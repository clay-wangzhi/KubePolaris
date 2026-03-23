package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/clay-wangzhi/KubePolaris/internal/k8s"
	"github.com/clay-wangzhi/KubePolaris/internal/middleware"
	"github.com/clay-wangzhi/KubePolaris/internal/models"
	"github.com/clay-wangzhi/KubePolaris/internal/response"
	"github.com/clay-wangzhi/KubePolaris/internal/services"
	"github.com/clay-wangzhi/KubePolaris/pkg/logger"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
	v1 "k8s.io/api/core/v1"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/kubernetes/scheme"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/remotecommand"
)

// PodTerminalHandler Pod终端WebSocket处理器
type PodTerminalHandler struct {
	clusterService *services.ClusterService
	auditService   *services.AuditService
	k8sMgr         *k8s.ClusterInformerManager
	upgrader       websocket.Upgrader
	sessions       map[string]*PodTerminalSession
	sessionsMutex  sync.RWMutex
}

// PodTerminalSession Pod终端会话
type PodTerminalSession struct {
	ID             string
	AuditSessionID uint // 审计会话ID
	ClusterID      string
	Namespace      string
	PodName        string
	Container      string
	Conn           *websocket.Conn
	Context        context.Context
	Cancel         context.CancelFunc
	Mutex          sync.Mutex

	// 命令捕获（从终端输出中提取完整命令，包括Tab补全结果）
	currentLine      strings.Builder // 当前行的输出内容
	lastCompleteLine string          // 上一个完整行（用于提取命令）
	pendingEnter     bool            // 是否有待处理的回车键

	// Kubernetes连接相关
	stdinReader  io.ReadCloser
	stdinWriter  io.WriteCloser
	stdoutReader io.ReadCloser
	stdoutWriter io.WriteCloser
	winSizeChan  chan *remotecommand.TerminalSize
	done         chan struct{}
}

// PodTerminalMessage Pod终端消息
type PodTerminalMessage struct {
	Type string `json:"type"`
	Data string `json:"data"`
	Cols int    `json:"cols,omitempty"`
	Rows int    `json:"rows,omitempty"`
}

// NewPodTerminalHandler 创建Pod终端处理器
func NewPodTerminalHandler(clusterService *services.ClusterService, auditService *services.AuditService, k8sMgr *k8s.ClusterInformerManager) *PodTerminalHandler {
	return &PodTerminalHandler{
		clusterService: clusterService,
		auditService:   auditService,
		k8sMgr:         k8sMgr,
		upgrader: websocket.Upgrader{
			CheckOrigin: func(r *http.Request) bool {
				origin := r.Header.Get("Origin")
				if origin == "" {
					return true
				}
				return middleware.IsOriginAllowed(origin)
			},
			ReadBufferSize:  1024,
			WriteBufferSize: 1024,
		},
		sessions:      make(map[string]*PodTerminalSession),
		sessionsMutex: sync.RWMutex{},
	}
}

// HandlePodTerminal 处理Pod终端WebSocket连接
func (h *PodTerminalHandler) HandlePodTerminal(c *gin.Context) {
	clusterID := c.Param("clusterID")
	namespace := c.Param("namespace")
	podName := c.Param("name")
	container := c.DefaultQuery("container", "")
	userID := c.GetUint("user_id") // 从JWT中获取用户ID

	// 获取集群信息
	clusterIDUint, err := strconv.ParseUint(clusterID, 10, 32)
	if err != nil {
		response.BadRequest(c, "无效的集群ID")
		return
	}

	cluster, err := h.clusterService.GetCluster(uint(clusterIDUint))
	if err != nil {
		response.NotFound(c, "集群不存在")
		return
	}

	terminalType := services.TerminalTypePod
	if t, exists := c.Get("terminal_type"); exists && t == "kubectl" {
		terminalType = services.TerminalTypeKubectl
	}

	// 升级到WebSocket连接
	conn, err := h.upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		return
	}
	defer func() {
		_ = conn.Close()
	}()

	h.RunPodTerminalWithConn(conn, cluster, clusterID, namespace, podName, container, userID, terminalType)
}

// RunPodTerminalWithConn 在已建立的 WebSocket 上运行 Pod 终端（kubectl Pod 终端等场景先推送进度再复用此逻辑）
func (h *PodTerminalHandler) RunPodTerminalWithConn(
	conn *websocket.Conn,
	cluster *models.Cluster,
	clusterIDStr, namespace, podName, container string,
	userID uint,
	terminalType services.TerminalType,
) {
	var auditSessionID uint
	if h.auditService != nil {
		auditSession, err := h.auditService.CreateSession(&services.CreateSessionRequest{
			UserID:     userID,
			ClusterID:  cluster.ID,
			TargetType: terminalType,
			Namespace:  namespace,
			Pod:        podName,
			Container:  container,
		})
		if err != nil {
			logger.Error("创建审计会话失败", "error", err)
		} else {
			auditSessionID = auditSession.ID
		}
	}

	sessionID := fmt.Sprintf("%s-%s-%s-%d", clusterIDStr, namespace, podName, time.Now().Unix())
	ctx, cancel := context.WithCancel(context.Background())

	session := &PodTerminalSession{
		ID:             sessionID,
		AuditSessionID: auditSessionID,
		ClusterID:      clusterIDStr,
		Namespace:      namespace,
		PodName:        podName,
		Container:      container,
		Conn:           conn,
		Context:        ctx,
		Cancel:         cancel,
	}

	h.sessionsMutex.Lock()
	h.sessions[sessionID] = session
	h.sessionsMutex.Unlock()

	defer func() {
		h.sessionsMutex.Lock()
		delete(h.sessions, sessionID)
		h.sessionsMutex.Unlock()
		cancel()
		h.closeSession(session)
		if h.auditService != nil && auditSessionID > 0 {
			_ = h.auditService.CloseSession(auditSessionID, "closed")
		}
	}()

	k8sClient, err := h.k8sMgr.GetK8sClient(cluster)
	if err != nil {
		h.sendMessage(conn, "error", fmt.Sprintf("获取K8s客户端失败: %v", err))
		return
	}
	client := k8sClient.GetClientset()
	k8sConfig := k8sClient.GetRestConfig()

	shell, err := h.findAvailableShell(client, k8sConfig, session)
	if err != nil {
		h.sendMessage(conn, "error", fmt.Sprintf("未找到可用的shell: %v", err))
		return
	}

	if err := h.startPodTerminal(client, k8sConfig, session, shell); err != nil {
		h.sendMessage(conn, "error", fmt.Sprintf("启动Pod终端失败: %v", err))
		return
	}

	containerInfo := ""
	if container != "" {
		containerInfo = fmt.Sprintf(" (container: %s)", container)
	}
	h.sendMessage(conn, "connected", fmt.Sprintf("Connected to pod %s/%s%s using %s", namespace, podName, containerInfo, shell))

	for {
		mt, data, err := conn.ReadMessage()
		if err != nil {
			break
		}
		if mt != websocket.TextMessage && mt != websocket.BinaryMessage {
			continue
		}

		var msg PodTerminalMessage
		if err := json.Unmarshal(data, &msg); err == nil && msg.Type != "" {
			switch msg.Type {
			case "input":
				h.handleInput(session, msg.Data)
			case "resize":
				h.handleResize(session, msg.Cols, msg.Rows)
			}
			continue
		}

		h.handleInput(session, string(data))
	}
}

// findAvailableShell 查找可用的shell
func (h *PodTerminalHandler) findAvailableShell(client *kubernetes.Clientset, k8sConfig *rest.Config, session *PodTerminalSession) (string, error) {
	shells := []string{"bash", "sh", "ash", "dash", "zsh", "ksh"}

	for _, shell := range shells {
		if h.hasShellInContainer(client, k8sConfig, session, shell) {
			return shell, nil
		}
	}

	return "", fmt.Errorf("未找到任何可用的shell")
}

// hasShellInContainer 检查容器中是否有指定的shell
func (h *PodTerminalHandler) hasShellInContainer(client *kubernetes.Clientset, k8sConfig *rest.Config, session *PodTerminalSession, shell string) bool {
	testScript := fmt.Sprintf("command -v %s", shell)
	command := []string{"sh", "-c", testScript}

	req := client.CoreV1().RESTClient().Post().
		Resource("pods").
		Name(session.PodName).
		Namespace(session.Namespace).SubResource("exec")

	req.VersionedParams(&v1.PodExecOptions{
		Container: session.Container,
		Command:   command,
		Stdout:    true,
	}, scheme.ParameterCodec)

	exec, err := remotecommand.NewSPDYExecutor(k8sConfig, "POST", req.URL())
	if err != nil {
		return false
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	var buf bytes.Buffer
	err = exec.StreamWithContext(ctx, remotecommand.StreamOptions{
		Stdout: &buf,
		Tty:    false,
	})
	if err != nil {
		return false
	}

	result := strings.TrimSpace(buf.String())
	return strings.HasSuffix(result, shell)
}

// startPodTerminal 启动Pod终端连接
func (h *PodTerminalHandler) startPodTerminal(client *kubernetes.Clientset, k8sConfig *rest.Config, session *PodTerminalSession, shell string) error {
	// 创建管道
	stdinReader, stdinWriter := io.Pipe()
	stdoutReader, stdoutWriter := io.Pipe()

	session.stdinReader = stdinReader
	session.stdinWriter = stdinWriter
	session.stdoutReader = stdoutReader
	session.stdoutWriter = stdoutWriter
	session.winSizeChan = make(chan *remotecommand.TerminalSize, 10)
	session.done = make(chan struct{})

	// 设置默认终端大小
	session.winSizeChan <- &remotecommand.TerminalSize{
		Width:  120,
		Height: 30,
	}

	// 启动输出读取协程
	go h.readOutput(session)

	// 启动Kubernetes exec
	go func() {
		defer func() {
			select {
			case <-session.done:
			default:
				close(session.done)
			}
			h.sendMessage(session.Conn, "disconnected", "Pod终端连接已断开")
		}()

		req := client.CoreV1().RESTClient().Post().
			Resource("pods").
			Name(session.PodName).
			Namespace(session.Namespace).
			SubResource("exec")

		req.VersionedParams(&v1.PodExecOptions{
			Container: session.Container,
			Command:   []string{shell},
			Stdin:     true,
			Stdout:    true,
			Stderr:    true,
			TTY:       true,
		}, scheme.ParameterCodec)

		exec, err := remotecommand.NewSPDYExecutor(k8sConfig, "POST", req.URL())
		if err != nil {
			h.sendMessage(session.Conn, "error", fmt.Sprintf("创建执行器失败: %v", err))
			return
		}

		streamOption := remotecommand.StreamOptions{
			Stdin:             &terminalStream{session: session},
			Stdout:            session.stdoutWriter,
			Stderr:            session.stdoutWriter,
			TerminalSizeQueue: &terminalSizeQueue{session: session},
			Tty:               true,
		}

		if err := exec.StreamWithContext(session.Context, streamOption); err != nil {
			h.sendMessage(session.Conn, "error", fmt.Sprintf("执行失败: %v", err))
		}
	}()

	return nil
}

// handleInput 处理用户输入
func (h *PodTerminalHandler) handleInput(session *PodTerminalSession, input string) {
	session.Mutex.Lock()
	defer session.Mutex.Unlock()

	if session.stdinWriter != nil {
		_, err := session.stdinWriter.Write([]byte(input))
		if err != nil {
			h.sendMessage(session.Conn, "error", "写入输入失败")
			return
		}
	}

	// 检测回车键，标记待处理（命令将从输出中提取）
	if h.auditService != nil && session.AuditSessionID > 0 {
		if strings.Contains(input, "\r") || strings.Contains(input, "\n") {
			session.pendingEnter = true
		} else if input == "\x03" {
			// Ctrl+C 清空当前行
			session.currentLine.Reset()
		}
	}
}

// handleResize 处理终端大小调整
func (h *PodTerminalHandler) handleResize(session *PodTerminalSession, cols, rows int) {
	if session.winSizeChan != nil {
		size := &remotecommand.TerminalSize{
			Width:  uint16(cols),
			Height: uint16(rows),
		}
		select {
		case session.winSizeChan <- size:
		case <-session.done:
		}
	}
}

// readOutput 读取命令输出
func (h *PodTerminalHandler) readOutput(session *PodTerminalSession) {
	buffer := make([]byte, 1024)
	for {
		n, err := session.stdoutReader.Read(buffer)
		if err != nil {
			break
		}

		if n > 0 {
			output := string(buffer[:n])
			h.sendMessage(session.Conn, "data", output)

			// 追踪终端输出，用于提取完整命令（包括Tab补全结果）
			if h.auditService != nil && session.AuditSessionID > 0 {
				h.trackOutputForCommand(session, output)
			}
		}
	}
}

// trackOutputForCommand 追踪输出以提取命令
func (h *PodTerminalHandler) trackOutputForCommand(session *PodTerminalSession, output string) {
	session.Mutex.Lock()
	defer session.Mutex.Unlock()

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
					h.auditService.RecordCommandAsync(session.AuditSessionID, cmd, cmd, nil)
				}
				session.pendingEnter = false
			}
			session.lastCompleteLine = currentContent

		case '\r':
			// 回车符，可能是行首返回，暂时忽略
			continue

		case '\x1b':
			// ESC 字符，可能是 ANSI 转义序列的开始，忽略
			continue

		case '\x07':
			// Bell 字符，忽略
			continue

		default:
			// 过滤掉不可打印字符和ANSI序列中的字符
			if c >= 32 && c < 127 {
				session.currentLine.WriteRune(c)
			}
		}
	}
}

// extractCommandFromLine 从行内容中提取命令（去掉shell提示符）
func (h *PodTerminalHandler) extractCommandFromLine(line string) string {
	// 去掉 ANSI 转义序列
	line = h.stripANSI(line)
	line = strings.TrimSpace(line)

	if line == "" {
		return ""
	}

	// 尝试识别并去掉常见的 shell 提示符
	// 格式如: "bash-4.4#", "root@hostname:~#", "$ ", "# ", "[user@host ~]$ "
	promptPatterns := []string{
		"# ", // root 提示符
		"$ ", // 普通用户提示符
		"] ", // 方括号结尾的提示符
		"> ", // 其他提示符
	}

	for _, pattern := range promptPatterns {
		if idx := strings.LastIndex(line, pattern); idx != -1 {
			cmd := strings.TrimSpace(line[idx+len(pattern):])
			if cmd != "" {
				return cmd
			}
		}
	}

	// 如果没有找到提示符模式，检查是否看起来像命令
	// 如果行以常见命令开头，可能就是命令本身
	commonCommands := []string{"ls", "cd", "cat", "grep", "kubectl", "find", "pwd", "echo", "ps", "top", "vi", "vim", "nano", "apt", "yum", "dnf", "pip", "npm", "go", "python", "java", "curl", "wget", "tar", "cp", "mv", "rm", "mkdir", "chmod", "chown", "df", "du", "free", "whoami", "id", "date", "tail", "head", "less", "more", "sort", "uniq", "wc", "awk", "sed", "cut", "tr", "diff", "patch", "git", "docker", "helm", "make", "sh", "bash", "exit", "clear", "history"}

	lineLower := strings.ToLower(line)
	for _, cmd := range commonCommands {
		if strings.HasPrefix(lineLower, cmd+" ") || lineLower == cmd {
			return line
		}
	}

	return ""
}

// stripANSI 去掉ANSI转义序列
func (h *PodTerminalHandler) stripANSI(s string) string {
	// 简单的ANSI转义序列过滤
	result := strings.Builder{}
	inEscape := false
	for _, c := range s {
		if c == '\x1b' {
			inEscape = true
			continue
		}
		if inEscape {
			// ANSI序列通常以字母结尾
			if (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') {
				inEscape = false
			}
			continue
		}
		result.WriteRune(c)
	}
	return result.String()
}

// closeSession 关闭会话
func (h *PodTerminalHandler) closeSession(session *PodTerminalSession) {
	if session.stdinWriter != nil {
		_ = session.stdinWriter.Close()
	}
	if session.stdoutReader != nil {
		_ = session.stdoutReader.Close()
	}
	if session.done != nil {
		select {
		case <-session.done:
		default:
			close(session.done)
		}
	}
}

// sendMessage 发送WebSocket消息
func (h *PodTerminalHandler) sendMessage(conn *websocket.Conn, msgType, data string) {
	msg := PodTerminalMessage{
		Type: msgType,
		Data: data,
	}

	if err := conn.WriteJSON(msg); err != nil {
		logger.Error("发送WebSocket消息失败", "error", err)
	}
}

// terminalStream 实现io.Reader和io.Writer接口
type terminalStream struct {
	session *PodTerminalSession
}

func (t *terminalStream) Read(p []byte) (int, error) {
	return t.session.stdinReader.Read(p)
}

func (t *terminalStream) Write(p []byte) (int, error) {
	return len(p), nil // 不需要写入
}

// terminalSizeQueue 实现remotecommand.TerminalSizeQueue接口
type terminalSizeQueue struct {
	session *PodTerminalSession
}

func (t *terminalSizeQueue) Next() *remotecommand.TerminalSize {
	select {
	case size := <-t.session.winSizeChan:
		return size
	case <-t.session.done:
		return nil
	}
}
