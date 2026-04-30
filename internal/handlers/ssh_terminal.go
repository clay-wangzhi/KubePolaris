package handlers

import (
	"fmt"
	"io"
	"net"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/clay-wangzhi/KubePolaris/internal/middleware"
	"github.com/clay-wangzhi/KubePolaris/internal/services"
	"github.com/clay-wangzhi/KubePolaris/internal/terminalreplay"
	"github.com/clay-wangzhi/KubePolaris/pkg/logger"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
	"golang.org/x/crypto/ssh"
)

// SSHHandler SSH终端处理器
type SSHHandler struct {
	auditService *services.AuditService
	replayDir    string
}

// NewSSHHandler 创建SSH处理器
func NewSSHHandler(auditService *services.AuditService, replayDir string) *SSHHandler {
	return &SSHHandler{
		auditService: auditService,
		replayDir:    replayDir,
	}
}

// SSHConfig SSH连接配置
type SSHConfig struct {
	Host       string `json:"host"`
	Port       int    `json:"port"`
	Username   string `json:"username"`
	Password   string `json:"password,omitempty"`
	PrivateKey string `json:"privateKey,omitempty"`
	AuthType   string `json:"authType"` // "password" or "key"
	ClusterID  uint   `json:"clusterId,omitempty"`
}

// SSHMessage WebSocket消息
type SSHMessage struct {
	Type   string      `json:"type"`
	Data   interface{} `json:"data,omitempty"`
	Cols   int         `json:"cols,omitempty"`
	Rows   int         `json:"rows,omitempty"`
	Config *SSHConfig  `json:"config,omitempty"`
	Error  string      `json:"error,omitempty"`
}

// SSHSession SSH会话信息
type SSHSession struct {
	auditSessionID   uint
	replay           *terminalreplay.Recorder
	currentLine      strings.Builder // 当前行的输出内容
	lastCompleteLine string          // 上一个完整行
	pendingEnter     bool            // 是否有待处理的回车键
}

// WebSocket升级器
var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		origin := r.Header.Get("Origin")
		if origin == "" {
			return true
		}
		return middleware.IsRequestOriginAllowed(origin, r.Host)
	},
}

// SSHConnect 处理SSH WebSocket连接
func (h *SSHHandler) SSHConnect(c *gin.Context) {
	userID := c.GetUint("user_id") // 从JWT中获取用户ID

	// 升级HTTP连接为WebSocket
	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		logger.Error("WebSocket升级失败", "error", err)
		return
	}
	defer func() {
		_ = conn.Close()
	}()

	logger.Info("SSH WebSocket连接建立")

	var sshClient *ssh.Client
	var sshSession *ssh.Session
	var stdin io.WriteCloser
	var stdout io.Reader
	var stderr io.Reader
	var sessionInfo *SSHSession

	// 清理资源
	defer func() {
		if sshSession != nil {
			_ = sshSession.Close()
		}
		if sshClient != nil {
			_ = sshClient.Close()
		}
		if sessionInfo != nil && sessionInfo.replay != nil {
			sessionInfo.replay.End()
		}
		// 关闭审计会话
		if sessionInfo != nil && sessionInfo.auditSessionID > 0 && h.auditService != nil {
			_ = h.auditService.CloseSession(sessionInfo.auditSessionID, "closed")
		}
	}()

	for {
		var msg SSHMessage
		err := conn.ReadJSON(&msg)
		if err != nil {
			logger.Error("读取WebSocket消息失败", "error", err)
			break
		}

		switch msg.Type {
		case "connect":
			if msg.Config == nil {
				h.sendError(conn, "缺少SSH配置")
				continue
			}

			// 创建审计会话
			sessionInfo = &SSHSession{}
			if h.auditService != nil {
				auditSession, err := h.auditService.CreateSession(&services.CreateSessionRequest{
					UserID:     userID,
					ClusterID:  msg.Config.ClusterID,
					TargetType: services.TerminalTypeNode,
					Node:       fmt.Sprintf("%s:%d", msg.Config.Host, msg.Config.Port),
				})
				if err != nil {
					logger.Error("创建审计会话失败", "error", err)
				} else {
					sessionInfo.auditSessionID = auditSession.ID
					if rec, err := terminalreplay.NewRecorder(h.replayDir, h.auditService, auditSession.ID, 80, 24); err != nil {
						logger.Error("SSH 会话录像创建失败", "error", err)
					} else {
						sessionInfo.replay = rec
					}
				}
			}

			// 创建SSH连接
			sshClient, sshSession, stdin, stdout, stderr, err = h.createSSHConnection(msg.Config)
			if err != nil {
				h.sendError(conn, fmt.Sprintf("SSH连接失败: %v", err))
				if sessionInfo != nil && sessionInfo.replay != nil {
					sessionInfo.replay.End()
				}
				if sessionInfo != nil && sessionInfo.auditSessionID > 0 && h.auditService != nil {
					_ = h.auditService.CloseSession(sessionInfo.auditSessionID, "error")
				}
				continue
			}

			// 发送连接成功消息
			_ = conn.WriteJSON(SSHMessage{
				Type: "connected",
			})

			// 启动输出读取协程
			go h.readSSHOutput(conn, stdout, stderr, sessionInfo)

		case "input":
			if stdin != nil && msg.Data != nil {
				if input, ok := msg.Data.(string); ok {
					_, err := stdin.Write([]byte(input))
					if err != nil {
						logger.Error("写入SSH输入失败", "error", err)
						h.sendError(conn, "写入输入失败")
					}

					// 检测回车键，标记待处理
					if sessionInfo != nil && h.auditService != nil && sessionInfo.auditSessionID > 0 {
						if strings.Contains(input, "\r") || strings.Contains(input, "\n") {
							sessionInfo.pendingEnter = true
						} else if input == "\x03" {
							// Ctrl+C 清空当前行
							sessionInfo.currentLine.Reset()
						}
					}
				}
			}

		case "resize":
			if sshSession != nil && msg.Cols > 0 && msg.Rows > 0 {
				err := sshSession.WindowChange(msg.Rows, msg.Cols)
				if err != nil {
					logger.Error("调整终端大小失败", "error", err)
				}
				if sessionInfo != nil && sessionInfo.replay != nil {
					sessionInfo.replay.Resize(msg.Cols, msg.Rows)
				}
			}
		}
	}

	logger.Info("SSH WebSocket连接关闭")
}

// trackOutputForCommand 追踪输出以提取命令
func (h *SSHHandler) trackOutputForCommand(session *SSHSession, output string) {
	for _, c := range output {
		switch c {
		case '\n':
			// 遇到换行，保存当前行并检查是否需要记录命令
			currentContent := session.currentLine.String()
			session.currentLine.Reset()

			if session.pendingEnter && currentContent != "" {
				// 用户按了回车，提取命令
				cmd := h.extractCommandFromLine(currentContent)
				if cmd != "" {
					h.auditService.RecordCommandAsync(session.auditSessionID, cmd, cmd, nil)
				}
				session.pendingEnter = false
			}
			session.lastCompleteLine = currentContent

		case '\r':
			// 回车符，忽略
			continue

		case '\x1b':
			// ESC 字符，忽略
			continue

		case '\x07':
			// Bell 字符，忽略
			continue

		default:
			// 过滤掉不可打印字符
			if c >= 32 && c < 127 {
				session.currentLine.WriteRune(c)
			}
		}
	}
}

// extractCommandFromLine 从行内容中提取命令（去掉shell提示符）
func (h *SSHHandler) extractCommandFromLine(line string) string {
	// 去掉 ANSI 转义序列
	line = h.stripANSI(line)
	line = strings.TrimSpace(line)

	if line == "" {
		return ""
	}

	// 尝试识别并去掉常见的 shell 提示符
	promptPatterns := []string{
		"# ",
		"$ ",
		"] ",
		"> ",
	}

	for _, pattern := range promptPatterns {
		if idx := strings.LastIndex(line, pattern); idx != -1 {
			cmd := strings.TrimSpace(line[idx+len(pattern):])
			if cmd != "" {
				return cmd
			}
		}
	}

	// 检查是否看起来像命令
	commonCommands := []string{"ls", "cd", "cat", "grep", "kubectl", "find", "pwd", "echo", "ps", "top", "vi", "vim", "nano", "apt", "yum", "dnf", "pip", "npm", "go", "python", "java", "curl", "wget", "tar", "cp", "mv", "rm", "mkdir", "chmod", "chown", "df", "du", "free", "whoami", "id", "date", "tail", "head", "less", "more", "sort", "uniq", "wc", "awk", "sed", "cut", "tr", "diff", "patch", "git", "docker", "helm", "make", "sh", "bash", "exit", "clear", "history", "systemctl", "journalctl", "service", "ifconfig", "ip", "netstat", "ss", "ping", "traceroute", "nslookup", "dig", "hostname", "uname", "uptime", "dmesg", "lsof", "kill", "pkill", "htop", "iotop", "vmstat", "iostat", "sar"}

	lineLower := strings.ToLower(line)
	for _, cmd := range commonCommands {
		if strings.HasPrefix(lineLower, cmd+" ") || lineLower == cmd {
			return line
		}
	}

	return ""
}

// stripANSI 去掉ANSI转义序列
func (h *SSHHandler) stripANSI(s string) string {
	result := strings.Builder{}
	inEscape := false
	for _, c := range s {
		if c == '\x1b' {
			inEscape = true
			continue
		}
		if inEscape {
			if (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') {
				inEscape = false
			}
			continue
		}
		result.WriteRune(c)
	}
	return result.String()
}

// createSSHConnection 创建SSH连接
func (h *SSHHandler) createSSHConnection(config *SSHConfig) (*ssh.Client, *ssh.Session, io.WriteCloser, io.Reader, io.Reader, error) {
	// 创建SSH客户端配置
	sshConfig := &ssh.ClientConfig{
		User:            config.Username,
		HostKeyCallback: ssh.InsecureIgnoreHostKey(), // #nosec G106 -- 平台管理场景，目标节点已在集群管理范围内
		Timeout:         30 * time.Second,
	}

	// 根据认证类型设置认证方法
	switch config.AuthType {
	case "password":
		if config.Password == "" {
			return nil, nil, nil, nil, nil, fmt.Errorf("密码不能为空")
		}
		sshConfig.Auth = []ssh.AuthMethod{
			ssh.Password(config.Password),
		}

	case "key":
		if config.PrivateKey == "" {
			return nil, nil, nil, nil, nil, fmt.Errorf("私钥不能为空")
		}

		// 解析私钥
		signer, err := ssh.ParsePrivateKey([]byte(config.PrivateKey))
		if err != nil {
			return nil, nil, nil, nil, nil, fmt.Errorf("解析私钥失败: %v", err)
		}

		sshConfig.Auth = []ssh.AuthMethod{
			ssh.PublicKeys(signer),
		}

	default:
		return nil, nil, nil, nil, nil, fmt.Errorf("不支持的认证类型: %s", config.AuthType)
	}

	// 连接SSH服务器
	address := net.JoinHostPort(config.Host, strconv.Itoa(config.Port))
	client, err := ssh.Dial("tcp", address, sshConfig)
	if err != nil {
		return nil, nil, nil, nil, nil, fmt.Errorf("连接SSH服务器失败: %v", err)
	}

	// 创建SSH会话
	session, err := client.NewSession()
	if err != nil {
		_ = client.Close()
		return nil, nil, nil, nil, nil, fmt.Errorf("创建SSH会话失败: %v", err)
	}

	// 设置终端模式
	modes := ssh.TerminalModes{
		ssh.ECHO:          1,     // 启用回显
		ssh.TTY_OP_ISPEED: 14400, // 输入速度
		ssh.TTY_OP_OSPEED: 14400, // 输出速度
	}

	// 请求伪终端
	err = session.RequestPty("xterm-256color", 24, 80, modes)
	if err != nil {
		_ = session.Close()
		_ = client.Close()
		return nil, nil, nil, nil, nil, fmt.Errorf("请求伪终端失败: %v", err)
	}

	// 获取输入输出流
	stdin, err := session.StdinPipe()
	if err != nil {
		_ = session.Close()
		_ = client.Close()
		return nil, nil, nil, nil, nil, fmt.Errorf("获取stdin失败: %v", err)
	}

	stdout, err := session.StdoutPipe()
	if err != nil {
		_ = session.Close()
		_ = client.Close()
		return nil, nil, nil, nil, nil, fmt.Errorf("获取stdout失败: %v", err)
	}

	stderr, err := session.StderrPipe()
	if err != nil {
		_ = session.Close()
		_ = client.Close()
		return nil, nil, nil, nil, nil, fmt.Errorf("获取stderr失败: %v", err)
	}

	// 启动shell
	err = session.Shell()
	if err != nil {
		_ = session.Close()
		_ = client.Close()
		return nil, nil, nil, nil, nil, fmt.Errorf("启动shell失败: %v", err)
	}

	return client, session, stdin, stdout, stderr, nil
}

// readSSHOutput 读取SSH输出
func (h *SSHHandler) readSSHOutput(conn *websocket.Conn, stdout, stderr io.Reader, session *SSHSession) {
	// 读取stdout
	go func() {
		buffer := make([]byte, 1024)
		for {
			n, err := stdout.Read(buffer)
			if err != nil {
				if err != io.EOF {
					logger.Error("读取SSH stdout失败", "error", err)
				}
				break
			}

			if n > 0 {
				output := string(buffer[:n])
				err = conn.WriteJSON(SSHMessage{
					Type: "data",
					Data: output,
				})
				if err != nil {
					logger.Error("发送SSH输出失败", "error", err)
					break
				}
				if session != nil && session.replay != nil {
					session.replay.Record(buffer[:n])
				}

				// 追踪输出以提取命令
				if session != nil && h.auditService != nil && session.auditSessionID > 0 {
					h.trackOutputForCommand(session, output)
				}
			}
		}
	}()

	// 读取stderr
	go func() {
		buffer := make([]byte, 1024)
		for {
			n, err := stderr.Read(buffer)
			if err != nil {
				if err != io.EOF {
					logger.Error("读取SSH stderr失败", "error", err)
				}
				break
			}

			if n > 0 {
				err = conn.WriteJSON(SSHMessage{
					Type: "data",
					Data: string(buffer[:n]),
				})
				if err != nil {
					logger.Error("发送SSH错误输出失败", "error", err)
					break
				}
				if session != nil && session.replay != nil {
					session.replay.Record(buffer[:n])
				}
			}
		}
	}()
}

// sendError 发送错误消息
func (h *SSHHandler) sendError(conn *websocket.Conn, errorMsg string) {
	_ = conn.WriteJSON(SSHMessage{
		Type:  "error",
		Error: errorMsg,
	})
}
