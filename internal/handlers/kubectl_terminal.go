package handlers

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/clay-wangzhi/KubePolaris/internal/middleware"
	"github.com/clay-wangzhi/KubePolaris/internal/models"
	"github.com/clay-wangzhi/KubePolaris/internal/response"
	"github.com/clay-wangzhi/KubePolaris/internal/services"
	"github.com/clay-wangzhi/KubePolaris/pkg/logger"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

// KubectlTerminalHandler kubectl终端WebSocket处理器
type KubectlTerminalHandler struct {
	clusterService *services.ClusterService
	auditService   *services.AuditService
	upgrader       websocket.Upgrader
	sessions       map[string]*KubectlSession
	sessionsMutex  sync.RWMutex
}

// KubectlSession kubectl会话
type KubectlSession struct {
	ID             string
	AuditSessionID uint // 审计会话ID
	ClusterID      string
	Namespace      string
	Conn           *websocket.Conn
	Cmd            *exec.Cmd
	StdinPipe      *os.File
	StdoutPipe     *os.File
	Context        context.Context
	Cancel         context.CancelFunc
	LastCommand    string
	History        []string
	Mutex          sync.Mutex
}

// TerminalMessage 终端消息
type TerminalMessage struct {
	Type string `json:"type"`
	Data string `json:"data"`
}

// NewKubectlTerminalHandler 创建kubectl终端处理器
func NewKubectlTerminalHandler(clusterService *services.ClusterService, auditService *services.AuditService) *KubectlTerminalHandler {
	return &KubectlTerminalHandler{
		clusterService: clusterService,
		auditService:   auditService,
		upgrader: websocket.Upgrader{
			CheckOrigin: func(r *http.Request) bool {
				origin := r.Header.Get("Origin")
				if origin == "" {
					return true
				}
				return middleware.IsRequestOriginAllowed(origin, r.Host)
			},
			ReadBufferSize:  1024,
			WriteBufferSize: 1024,
		},
		sessions:      make(map[string]*KubectlSession),
		sessionsMutex: sync.RWMutex{},
	}
}

// HandleKubectlTerminal 处理kubectl终端WebSocket连接
func (h *KubectlTerminalHandler) HandleKubectlTerminal(c *gin.Context) {
	clusterID := c.Param("clusterID")
	namespace := c.DefaultQuery("namespace", "default")
	userID := c.GetUint("user_id") // 从JWT中获取用户ID

	// 获取集群信息
	cluster, err := h.clusterService.GetCluster(uint(mustParseUint(clusterID)))
	if err != nil {
		response.NotFound(c, "集群不存在")
		return
	}

	// 创建审计会话
	var auditSessionID uint
	if h.auditService != nil {
		auditSession, err := h.auditService.CreateSession(&services.CreateSessionRequest{
			UserID:     userID,
			ClusterID:  cluster.ID,
			TargetType: services.TerminalTypeKubectl,
			Namespace:  namespace,
		})
		if err != nil {
			logger.Error("创建审计会话失败", "error", err)
		} else {
			auditSessionID = auditSession.ID
		}
	}

	// 升级到WebSocket连接
	conn, err := h.upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		logger.Error("升级WebSocket连接失败", "error", err)
		// 关闭审计会话
		if h.auditService != nil && auditSessionID > 0 {
			_ = h.auditService.CloseSession(auditSessionID, "error")
		}
		return
	}
	defer func() {
		_ = conn.Close()
	}()

	// 创建会话
	sessionID := fmt.Sprintf("%s-%d", clusterID, time.Now().Unix())
	ctx, cancel := context.WithCancel(context.Background())

	session := &KubectlSession{
		ID:             sessionID,
		AuditSessionID: auditSessionID,
		ClusterID:      clusterID,
		Namespace:      namespace,
		Conn:           conn,
		Context:        ctx,
		Cancel:         cancel,
		History:        make([]string, 0),
	}

	// 注册会话
	h.sessionsMutex.Lock()
	h.sessions[sessionID] = session
	h.sessionsMutex.Unlock()

	// 清理会话
	defer func() {
		h.sessionsMutex.Lock()
		delete(h.sessions, sessionID)
		h.sessionsMutex.Unlock()
		cancel()
		if session.Cmd != nil && session.Cmd.Process != nil {
			_ = session.Cmd.Process.Kill()
		}
		// 关闭审计会话
		if h.auditService != nil && auditSessionID > 0 {
			_ = h.auditService.CloseSession(auditSessionID, "closed")
		}
	}()

	// 创建临时kubeconfig文件
	kubeconfigPath, err := h.createTempKubeconfig(cluster)
	if err != nil {
		h.sendMessage(conn, "error", fmt.Sprintf("创建kubeconfig失败: %v", err))
		return
	}
	defer func() {
		_ = os.Remove(kubeconfigPath)
	}()

	// 发送欢迎消息
	h.sendMessage(conn, "output", fmt.Sprintf("Connected to cluster: %s\n", cluster.Name))
	h.sendMessage(conn, "output", fmt.Sprintf("Default namespace: %s\n", namespace))
	h.sendMessage(conn, "command_result", "")

	// 处理WebSocket消息
	for {
		var msg TerminalMessage
		err := conn.ReadJSON(&msg)
		if err != nil {
			logger.Error("读取WebSocket消息失败", "error", err)
			break
		}

		switch msg.Type {
		case "input":
			h.handleInput(session, msg.Data)
		case "command":
			h.handleCommand(session, kubeconfigPath, namespace)
		case "interrupt":
			h.handleInterrupt(session)
		case "change_namespace":
			namespace = msg.Data
			session.Namespace = namespace
			h.sendMessage(conn, "namespace_changed", namespace)
		case "quick_command":
			h.handleQuickCommand(session, kubeconfigPath, namespace, msg.Data)
		}
	}
}

// handleInput 处理用户输入
func (h *KubectlTerminalHandler) handleInput(session *KubectlSession, input string) {
	session.Mutex.Lock()
	defer session.Mutex.Unlock()

	if input == "\u007f" { // 退格键
		if len(session.LastCommand) > 0 {
			session.LastCommand = session.LastCommand[:len(session.LastCommand)-1]
			h.sendMessage(session.Conn, "output", "\b \b")
		}
	} else {
		session.LastCommand += input
		h.sendMessage(session.Conn, "output", input)
	}
}

// handleCommand 处理命令执行
func (h *KubectlTerminalHandler) handleCommand(session *KubectlSession, kubeconfigPath, namespace string) {
	session.Mutex.Lock()
	command := strings.TrimSpace(session.LastCommand)
	session.LastCommand = ""
	// 使用会话中的命名空间，而不是传入的参数
	currentNamespace := session.Namespace
	session.Mutex.Unlock()

	if command == "" {
		h.sendMessage(session.Conn, "command_result", "")
		return
	}

	// 添加到历史记录
	session.History = append(session.History, command)
	if len(session.History) > 100 {
		session.History = session.History[1:]
	}

	// 记录命令到审计数据库（异步）
	if h.auditService != nil && session.AuditSessionID > 0 {
		h.auditService.RecordCommandAsync(session.AuditSessionID, command, command, nil)
	}

	// 执行kubectl命令，使用会话中的命名空间
	h.executeKubectlCommand(session, kubeconfigPath, currentNamespace, command)
}

// handleQuickCommand 处理快捷命令
func (h *KubectlTerminalHandler) handleQuickCommand(session *KubectlSession, kubeconfigPath, namespace, command string) {
	h.sendMessage(session.Conn, "output", fmt.Sprintf("\n%s\n", command))

	// 记录快捷命令到审计数据库（异步）
	if h.auditService != nil && session.AuditSessionID > 0 {
		h.auditService.RecordCommandAsync(session.AuditSessionID, command, command, nil)
	}

	// 使用会话中的命名空间，而不是传入的参数
	h.executeKubectlCommand(session, kubeconfigPath, session.Namespace, command)
}

// executeKubectlCommand 执行kubectl命令
func (h *KubectlTerminalHandler) executeKubectlCommand(session *KubectlSession, kubeconfigPath, namespace, command string) {
	// 解析命令
	parts := strings.Fields(command)
	if len(parts) == 0 {
		h.sendMessage(session.Conn, "command_result", "")
		return
	}

	// 处理特殊命令
	if h.handleSpecialCommands(session, command) {
		return
	}

	// 构建kubectl命令
	var args []string
	if parts[0] == "kubectl" {
		args = parts[1:]
	} else {
		// 如果用户没有输入kubectl前缀，自动添加
		args = parts
	}

	// 检查是否需要添加namespace参数
	needsNamespace := h.commandNeedsNamespace(args)

	// 添加kubeconfig参数
	kubectlArgs := []string{"--kubeconfig", kubeconfigPath}

	// 如果命令需要namespace且用户没有指定，则添加默认namespace
	if needsNamespace && !h.hasNamespaceFlag(args) {
		kubectlArgs = append(kubectlArgs, "--namespace", namespace)
	}

	kubectlArgs = append(kubectlArgs, args...)

	// 检查是否是流式命令（如 logs -f）
	isStreamingCommand := h.isStreamingCommand(args)

	// 创建命令
	var ctx context.Context
	var cancel context.CancelFunc

	if isStreamingCommand {
		// 流式命令不设置超时
		ctx, cancel = context.WithCancel(session.Context)
	} else {
		// 非流式命令设置超时
		ctx, cancel = context.WithTimeout(session.Context, 60*time.Second)
	}
	defer cancel()

	cmd := exec.CommandContext(ctx, "kubectl", kubectlArgs...) // #nosec G204 -- kubectl 参数经过白名单校验

	// 设置环境变量
	cmd.Env = append(os.Environ(),
		fmt.Sprintf("KUBECONFIG=%s", kubeconfigPath),
	)

	// 保存命令到会话，以便可以被中断
	session.Mutex.Lock()
	session.Cmd = cmd
	session.Mutex.Unlock()

	// 如果是流式命令，使用管道处理输出
	if isStreamingCommand {
		// 创建管道
		stdout, err := cmd.StdoutPipe()
		if err != nil {
			h.sendMessage(session.Conn, "error", fmt.Sprintf("创建输出管道失败: %v", err))
			return
		}

		stderr, err := cmd.StderrPipe()
		if err != nil {
			h.sendMessage(session.Conn, "error", fmt.Sprintf("创建错误管道失败: %v", err))
			return
		}

		// 启动命令
		if err := cmd.Start(); err != nil {
			h.sendMessage(session.Conn, "error", fmt.Sprintf("启动命令失败: %v", err))
			return
		}

		// 读取标准输出
		go func() {
			buffer := make([]byte, 1024)
			for {
				n, err := stdout.Read(buffer)
				if n > 0 {
					h.sendMessage(session.Conn, "output", string(buffer[:n]))
				}
				if err != nil {
					break
				}
			}
		}()

		// 读取标准错误
		go func() {
			buffer := make([]byte, 1024)
			for {
				n, err := stderr.Read(buffer)
				if n > 0 {
					h.sendMessage(session.Conn, "error", string(buffer[:n]))
				}
				if err != nil {
					break
				}
			}
		}()

		// 等待命令完成
		go func() {
			err := cmd.Wait()
			if err != nil && ctx.Err() != context.Canceled {
				h.sendMessage(session.Conn, "error", fmt.Sprintf("命令执行失败: %v", err))
			}
			h.sendMessage(session.Conn, "command_result", "")

			// 清除会话中的命令引用
			session.Mutex.Lock()
			session.Cmd = nil
			session.Mutex.Unlock()
		}()
	} else {
		// 非流式命令，使用CombinedOutput
		output, err := cmd.CombinedOutput()

		// 清除会话中的命令引用
		session.Mutex.Lock()
		session.Cmd = nil
		session.Mutex.Unlock()

		if err != nil {
			if ctx.Err() == context.DeadlineExceeded {
				h.sendMessage(session.Conn, "error", "命令执行超时 (60秒)")
			} else {
				h.sendMessage(session.Conn, "error", fmt.Sprintf("命令执行失败: %v\n%s", err, string(output)))
			}
		} else {
			// 发送输出
			if len(output) > 0 {
				h.sendMessage(session.Conn, "output", string(output))
			}
		}

		h.sendMessage(session.Conn, "command_result", "")
	}
}

// isStreamingCommand 检查是否是流式命令
func (h *KubectlTerminalHandler) isStreamingCommand(args []string) bool {
	if len(args) == 0 {
		return false
	}

	// 检查是否是 logs 命令 (无论是否有 -f 参数，都作为流式处理)
	if args[0] == "logs" {
		return true
	}

	// 检查是否是 exec 命令
	if args[0] == "exec" {
		return true
	}

	// 检查是否是 port-forward 命令
	if args[0] == "port-forward" {
		return true
	}

	// 检查是否是 watch 命令
	if args[0] == "watch" {
		return true
	}

	// 检查是否是 top 命令
	if args[0] == "top" {
		return true
	}

	// 检查命令行中是否包含 --watch 参数
	for _, arg := range args {
		if arg == "--watch" || arg == "-w" {
			return true
		}
	}

	return false
}

// handleSpecialCommands 处理特殊命令
func (h *KubectlTerminalHandler) handleSpecialCommands(session *KubectlSession, command string) bool {
	command = strings.TrimSpace(command)

	switch {
	case command == "clear" || command == "cls":
		h.sendMessage(session.Conn, "clear", "")
		h.sendMessage(session.Conn, "command_result", "")
		return true
	case command == "help" || command == "?":
		h.sendHelpMessage(session)
		return true
	case command == "history":
		h.sendHistoryMessage(session)
		return true
	case strings.HasPrefix(command, "ns "):
		// 切换namespace的快捷命令
		namespace := strings.TrimSpace(command[3:])
		if namespace != "" {
			session.Namespace = namespace
			h.sendMessage(session.Conn, "namespace_changed", namespace)
		}
		h.sendMessage(session.Conn, "command_result", "")
		return true
	}

	return false
}

// commandNeedsNamespace 检查命令是否需要namespace
func (h *KubectlTerminalHandler) commandNeedsNamespace(args []string) bool {
	if len(args) == 0 {
		return false
	}

	// 不需要namespace的命令
	clusterCommands := []string{
		"cluster-info", "version", "api-versions", "api-resources",
		"get nodes", "get namespaces", "get ns", "get pv", "get sc",
		"get clusterroles", "get clusterrolebindings",
	}

	command := strings.Join(args, " ")
	for _, cmd := range clusterCommands {
		if strings.HasPrefix(command, cmd) {
			return false
		}
	}

	return true
}

// hasNamespaceFlag 检查命令是否已经包含namespace参数
func (h *KubectlTerminalHandler) hasNamespaceFlag(args []string) bool {
	for _, arg := range args {
		if arg == "-n" || arg == "--namespace" {
			return true
		}
		if strings.HasPrefix(arg, "--namespace=") {
			return true
		}
		if arg == "--all-namespaces" || arg == "-A" {
			return true
		}
	}
	return false
}

// sendHelpMessage 发送帮助信息
func (h *KubectlTerminalHandler) sendHelpMessage(session *KubectlSession) {
	helpText := `
kubectl终端帮助信息:

基本命令:
  kubectl get pods              - 查看Pod列表
  kubectl get nodes             - 查看节点列表
  kubectl get svc               - 查看服务列表
  kubectl get deployments      - 查看部署列表
  kubectl describe pod <name>   - 查看Pod详情
  kubectl logs <pod-name>       - 查看Pod日志
  kubectl exec -it <pod> bash   - 进入Pod容器

快捷命令:
  clear/cls                     - 清屏
  help/?                        - 显示帮助
  history                       - 显示命令历史
  ns <namespace>                - 切换命名空间

提示:
  - 可以省略kubectl前缀，系统会自动添加
  - 使用Tab键可以自动补全(部分支持)
  - 使用上下箭头键浏览历史命令
  - 当前命名空间会自动应用到相关命令

`
	h.sendMessage(session.Conn, "output", helpText)
	h.sendMessage(session.Conn, "command_result", "")
}

// sendHistoryMessage 发送历史命令
func (h *KubectlTerminalHandler) sendHistoryMessage(session *KubectlSession) {
	if len(session.History) == 0 {
		h.sendMessage(session.Conn, "output", "暂无命令历史\n")
	} else {
		historyText := "命令历史:\n"
		for i, cmd := range session.History {
			historyText += fmt.Sprintf("  %d: %s\n", i+1, cmd)
		}
		h.sendMessage(session.Conn, "output", historyText)
	}
	h.sendMessage(session.Conn, "command_result", "")
}

// handleInterrupt 处理中断信号
func (h *KubectlTerminalHandler) handleInterrupt(session *KubectlSession) {
	session.Mutex.Lock()
	cmd := session.Cmd
	session.LastCommand = ""
	session.Mutex.Unlock()

	// 发送中断信号到终端
	h.sendMessage(session.Conn, "output", "^C\n")

	// 如果有正在运行的命令，尝试终止它
	if cmd != nil && cmd.Process != nil {
		logger.Info("正在终止命令", "pid", cmd.Process.Pid)

		// 在Windows上，Kill()可能不会立即终止进程，尝试使用taskkill
		if runtime.GOOS == "windows" {
			_ = exec.Command("taskkill", "/F", "/T", "/PID", strconv.Itoa(cmd.Process.Pid)).Run() // #nosec G204 -- PID 来自已知进程
		} else {
			// 在Unix系统上，发送SIGINT信号（等同于Ctrl+C）
			_ = cmd.Process.Signal(syscall.SIGINT)

			// 给进程一点时间响应SIGINT
			time.Sleep(100 * time.Millisecond)

			// 如果进程仍在运行，强制终止
			if cmd.ProcessState == nil || !cmd.ProcessState.Exited() {
				_ = cmd.Process.Kill()
			}
		}
	}

	h.sendMessage(session.Conn, "command_result", "")
}

// createTempKubeconfig 创建临时kubeconfig文件
func (h *KubectlTerminalHandler) createTempKubeconfig(cluster *models.Cluster) (string, error) {
	// 创建临时文件
	tmpFile, err := os.CreateTemp("", "kubeconfig-*.yaml")
	if err != nil {
		return "", fmt.Errorf("创建临时文件失败: %v", err)
	}
	defer func() {
		_ = tmpFile.Close()
	}()

	// 写入kubeconfig内容
	var kubeconfigContent string
	if cluster.KubeconfigEnc != "" {
		kubeconfigContent = cluster.KubeconfigEnc
	} else if cluster.SATokenEnc != "" {
		// 从Token创建kubeconfig
		kubeconfigContent = services.CreateKubeconfigFromToken(
			cluster.Name,
			cluster.APIServer,
			cluster.SATokenEnc,
			cluster.CAEnc,
		)
	} else {
		return "", fmt.Errorf("集群缺少认证信息")
	}

	_, err = tmpFile.WriteString(kubeconfigContent)
	if err != nil {
		return "", fmt.Errorf("写入kubeconfig失败: %v", err)
	}

	return tmpFile.Name(), nil
}

// sendMessage 发送WebSocket消息
func (h *KubectlTerminalHandler) sendMessage(conn *websocket.Conn, msgType, data string) {
	msg := TerminalMessage{
		Type: msgType,
		Data: data,
	}

	if err := conn.WriteJSON(msg); err != nil {
		logger.Error("发送WebSocket消息失败", "error", err)
	}
}

// mustParseUint 解析uint，失败时panic
func mustParseUint(s string) uint64 {
	val, err := strconv.ParseUint(s, 10, 32)
	if err != nil {
		panic(fmt.Sprintf("解析uint失败: %v", err))
	}
	return val
}
