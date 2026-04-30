package handlers

import (
	"context"
	"fmt"
	"net/http"
	"strconv"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
	"gorm.io/gorm"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	"github.com/clay-wangzhi/KubePolaris/internal/config"
	"github.com/clay-wangzhi/KubePolaris/internal/k8s"
	"github.com/clay-wangzhi/KubePolaris/internal/middleware"
	"github.com/clay-wangzhi/KubePolaris/internal/models"
	"github.com/clay-wangzhi/KubePolaris/internal/response"
	"github.com/clay-wangzhi/KubePolaris/internal/services"
	"github.com/clay-wangzhi/KubePolaris/pkg/logger"
)

// ArthasHandler 处理 Pod 级 Arthas Agent 诊断请求。
type ArthasHandler struct {
	db             *gorm.DB
	cfg            *config.Config
	clusterService *services.ClusterService
	k8sMgr         *k8s.ClusterInformerManager
	auditService   *services.AuditService
	aiConfigSvc    *services.AIConfigService
	upgrader       websocket.Upgrader
	pending        map[string]services.ArthasPlannedCommand
	pendingMutex   sync.RWMutex
}

func NewArthasHandler(db *gorm.DB, cfg *config.Config, clusterService *services.ClusterService, k8sMgr *k8s.ClusterInformerManager, auditService *services.AuditService) *ArthasHandler {
	return &ArthasHandler{
		db:             db,
		cfg:            cfg,
		clusterService: clusterService,
		k8sMgr:         k8sMgr,
		auditService:   auditService,
		aiConfigSvc:    services.NewAIConfigService(db),
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
		pending:      make(map[string]services.ArthasPlannedCommand),
		pendingMutex: sync.RWMutex{},
	}
}

type arthasSessionRequest struct {
	Container string `json:"container"`
	PID       string `json:"pid"`
}

type arthasPlanRequest struct {
	Prompt   string   `json:"prompt" binding:"required"`
	Evidence []string `json:"evidence"`
}

type arthasConfirmRequest struct {
	Container string `json:"container" binding:"required"`
	PID       string `json:"pid" binding:"required"`
	Command   string `json:"command" binding:"required"`
}

type arthasWSMessage struct {
	Type      string   `json:"type"`
	Prompt    string   `json:"prompt,omitempty"`
	Command   string   `json:"command,omitempty"`
	CommandID string   `json:"commandId,omitempty"`
	PID       string   `json:"pid,omitempty"`
	Container string   `json:"container,omitempty"`
	Evidence  []string `json:"evidence,omitempty"`
}

type arthasWSEvent struct {
	Type     string      `json:"type"`
	Data     interface{} `json:"data,omitempty"`
	Message  string      `json:"message,omitempty"`
	Command  string      `json:"command,omitempty"`
	Decision interface{} `json:"decision,omitempty"`
}

// GetStatus 探测目标 Pod/容器内 Java 进程和 Arthas 可用性。
func (h *ArthasHandler) GetStatus(c *gin.Context) {
	if !h.cfg.Arthas.Enabled {
		response.ServiceUnavailable(c, "Arthas Agent 未启用")
		return
	}

	cluster, service, container, ok := h.prepareSessionService(c)
	if !ok {
		return
	}

	status, err := service.GetStatus(c.Request.Context(), c.Param("namespace"), c.Param("name"), container)
	if err != nil {
		logger.Error("获取 Arthas 状态失败", "cluster", cluster.ID, "error", err)
		response.InternalError(c, fmt.Sprintf("获取 Arthas 状态失败: %v", err))
		return
	}
	response.OK(c, status)
}

// CreateSession 返回创建诊断会话所需的目标信息。真正的流式执行在 WebSocket 中完成。
func (h *ArthasHandler) CreateSession(c *gin.Context) {
	if !h.cfg.Arthas.Enabled {
		response.ServiceUnavailable(c, "Arthas Agent 未启用")
		return
	}
	var req arthasSessionRequest
	_ = c.ShouldBindJSON(&req)

	_, service, container, ok := h.prepareSessionServiceWithContainer(c, req.Container)
	if !ok {
		return
	}
	status, err := service.GetStatus(c.Request.Context(), c.Param("namespace"), c.Param("name"), container)
	if err != nil {
		response.InternalError(c, fmt.Sprintf("创建 Arthas 会话失败: %v", err))
		return
	}
	if req.PID == "" && len(status.Processes) > 0 {
		req.PID = status.Processes[0].PID
	}
	response.OK(c, gin.H{
		"container": container,
		"pid":       req.PID,
		"status":    status,
	})
}

// BuildPlan 根据自然语言生成下一步诊断计划。
func (h *ArthasHandler) BuildPlan(c *gin.Context) {
	var req arthasPlanRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "诊断问题不能为空")
		return
	}
	agent := services.NewArthasAgentServiceWithPolicy(h.aiConfigSvc, h.newPolicy())
	plan, err := agent.BuildPlan(c.Request.Context(), req.Prompt, req.Evidence)
	if err != nil {
		response.InternalError(c, fmt.Sprintf("生成 Arthas 诊断计划失败: %v", err))
		return
	}
	response.OK(c, plan)
}

// ConfirmCommand 确认执行高风险或中风险命令。
func (h *ArthasHandler) ConfirmCommand(c *gin.Context) {
	var req arthasConfirmRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "container、pid 和 command 不能为空")
		return
	}

	_, service, _, ok := h.prepareSessionServiceWithContainer(c, req.Container)
	if !ok {
		return
	}
	decision := h.newPolicy().Classify(req.Command)
	result, _, err := service.ExecuteConfirmed(c.Request.Context(), services.ArthasSession{
		ClusterID: c.Param("clusterID"),
		Namespace: c.Param("namespace"),
		PodName:   c.Param("name"),
		Container: req.Container,
		PID:       req.PID,
		Command:   req.Command,
	}, decision)
	if err != nil {
		response.InternalError(c, fmt.Sprintf("执行 Arthas 命令失败: %v", err))
		return
	}
	response.OK(c, gin.H{"result": result, "decision": decision})
}

// HandleWebSocket 处理 Arthas Agent 流式诊断。
func (h *ArthasHandler) HandleWebSocket(c *gin.Context) {
	if !h.cfg.Arthas.Enabled {
		response.ServiceUnavailable(c, "Arthas Agent 未启用")
		return
	}

	cluster, service, container, ok := h.prepareSessionServiceWithContainer(c, c.DefaultQuery("container", ""))
	if !ok {
		return
	}

	conn, err := h.upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		return
	}
	defer conn.Close()

	auditID := h.createAuditSession(c, cluster, container)
	defer func() {
		if h.auditService != nil && auditID > 0 {
			_ = h.auditService.CloseSession(auditID, "closed")
		}
	}()

	agent := services.NewArthasAgentServiceWithPolicy(h.aiConfigSvc, h.newPolicy())
	h.sendWSEvent(conn, arthasWSEvent{Type: "connected", Message: "Arthas Agent 已连接"})
	ctx := context.WithValue(c.Request.Context(), arthasNamespaceKey, c.Param("namespace"))
	ctx = context.WithValue(ctx, arthasPodNameKey, c.Param("name"))
	diagnosisState := newArthasDiagnosisState()

	for {
		var msg arthasWSMessage
		if err := conn.ReadJSON(&msg); err != nil {
			return
		}
		h.handleWSMessage(ctx, conn, service, agent, diagnosisState, msg, container, auditID)
	}
}

func (h *ArthasHandler) handleWSMessage(ctx context.Context, conn *websocket.Conn, service *services.ArthasSessionService, agent *services.ArthasAgentService, diagnosisState *arthasDiagnosisState, msg arthasWSMessage, defaultContainer string, auditID uint) {
	container := msg.Container
	if container == "" {
		container = defaultContainer
	}

	switch msg.Type {
	case "prompt":
		plan, err := agent.BuildPlan(ctx, msg.Prompt, msg.Evidence)
		if err != nil {
			h.sendWSEvent(conn, arthasWSEvent{Type: "error", Message: err.Error()})
			return
		}
		h.storePendingCommands(plan.Commands)
		h.sendWSEvent(conn, arthasWSEvent{Type: "plan", Data: plan})
		diagnosisState.start(msg.Prompt, plan, msg.Evidence)
		initialEvidenceCount := diagnosisState.evidenceCount()
		for _, command := range plan.Commands {
			decision := h.newPolicy().Classify(command.Command)
			if !decision.AutoExecutable {
				diagnosisState.addPending(command)
				h.sendWSEvent(conn, arthasWSEvent{Type: "confirmation_required", Data: command, Command: command.Command})
				continue
			}
			if commandEvidence, ok := h.executeWSCommand(ctx, conn, service, services.ArthasSession{
				Namespace: msgNamespace(ctx),
				PodName:   msgPodName(ctx),
				Container: container,
				PID:       msg.PID,
				Command:   command.Command,
			}, auditID); ok {
				diagnosisState.addEvidence(commandEvidence)
			}
		}
		if diagnosisState.shouldBuildReport() {
			report := agent.BuildReport(ctx, diagnosisState.prompt, diagnosisState.plan, diagnosisState.evidence)
			h.sendWSEvent(conn, arthasWSEvent{Type: "diagnosis_report", Data: report})
		}
		if shouldSendPromptDone(plan, initialEvidenceCount, diagnosisState.evidenceCount(), diagnosisState.pendingCount()) {
			h.sendWSEvent(conn, arthasWSEvent{Type: "done", Message: "本轮诊断已完成"})
		}
	case "command":
		if commandEvidence, ok := h.executeWSCommand(ctx, conn, service, services.ArthasSession{
			Namespace: msgNamespace(ctx),
			PodName:   msgPodName(ctx),
			Container: container,
			PID:       msg.PID,
			Command:   msg.Command,
		}, auditID); ok {
			report := agent.BuildReport(ctx, msg.Command, &services.ArthasPlan{Intent: msg.Command}, []string{commandEvidence})
			h.sendWSEvent(conn, arthasWSEvent{Type: "diagnosis_report", Data: report})
			h.sendWSEvent(conn, arthasWSEvent{Type: "done", Message: "本轮诊断已完成"})
		}
	case "confirm":
		command := msg.Command
		if command == "" {
			command = h.getPendingCommand(msg.CommandID)
		}
		decision := h.newPolicy().Classify(command)
		result, _, err := service.ExecuteConfirmed(ctx, services.ArthasSession{
			Namespace: msgNamespace(ctx),
			PodName:   msgPodName(ctx),
			Container: container,
			PID:       msg.PID,
			Command:   command,
		}, decision)
		h.recordArthasCommand(auditID, command)
		if err != nil {
			h.sendWSEvent(conn, arthasWSEvent{Type: "error", Message: err.Error(), Command: command, Decision: decision})
			return
		}
		h.sendWSEvent(conn, arthasWSEvent{Type: "command_result", Data: result, Command: command, Decision: decision})
		commandEvidence := formatArthasEvidence(command, result)
		if diagnosisState.resolvePending(msg.CommandID, command) {
			diagnosisState.addEvidence(commandEvidence)
			if diagnosisState.shouldBuildReport() {
				report := agent.BuildReport(ctx, diagnosisState.prompt, diagnosisState.plan, diagnosisState.evidence)
				h.sendWSEvent(conn, arthasWSEvent{Type: "diagnosis_report", Data: report})
				h.sendWSEvent(conn, arthasWSEvent{Type: "done", Message: "本轮诊断已完成"})
			}
			return
		}
		report := agent.BuildReport(ctx, command, &services.ArthasPlan{Intent: command}, []string{commandEvidence})
		h.sendWSEvent(conn, arthasWSEvent{Type: "diagnosis_report", Data: report})
		h.sendWSEvent(conn, arthasWSEvent{Type: "done", Message: "本轮诊断已完成"})
	case "skip_confirm":
		if diagnosisState.resolvePending(msg.CommandID, msg.Command) && diagnosisState.shouldBuildReport() {
			report := agent.BuildReport(ctx, diagnosisState.prompt, diagnosisState.plan, diagnosisState.evidence)
			h.sendWSEvent(conn, arthasWSEvent{Type: "diagnosis_report", Data: report})
			h.sendWSEvent(conn, arthasWSEvent{Type: "done", Message: "本轮诊断已完成"})
		} else if diagnosisState.plan != nil && diagnosisState.pendingCount() == 0 {
			h.sendWSEvent(conn, arthasWSEvent{Type: "done", Message: "本轮诊断已完成"})
		}
	default:
		h.sendWSEvent(conn, arthasWSEvent{Type: "error", Message: "未知消息类型"})
	}
}

func shouldSendPromptDone(plan *services.ArthasPlan, initialEvidenceCount, evidenceCount, pendingCount int) bool {
	return len(plan.Commands) == 0 || (pendingCount == 0 && evidenceCount > initialEvidenceCount)
}

type arthasDiagnosisState struct {
	prompt   string
	plan     *services.ArthasPlan
	evidence []string
	pending  map[string]services.ArthasPlannedCommand
}

func newArthasDiagnosisState() *arthasDiagnosisState {
	return &arthasDiagnosisState{
		pending: make(map[string]services.ArthasPlannedCommand),
	}
}

func (s *arthasDiagnosisState) start(prompt string, plan *services.ArthasPlan, evidence []string) {
	s.prompt = prompt
	s.plan = plan
	s.evidence = append([]string{}, evidence...)
	s.pending = make(map[string]services.ArthasPlannedCommand)
}

func (s *arthasDiagnosisState) addPending(command services.ArthasPlannedCommand) {
	key := command.ID
	if key == "" {
		key = command.Command
	}
	if key != "" {
		s.pending[key] = command
	}
}

func (s *arthasDiagnosisState) resolvePending(commandID, command string) bool {
	if commandID != "" {
		if _, ok := s.pending[commandID]; ok {
			delete(s.pending, commandID)
			return true
		}
	}
	for key, pendingCommand := range s.pending {
		if pendingCommand.Command == command {
			delete(s.pending, key)
			return true
		}
	}
	return false
}

func (s *arthasDiagnosisState) addEvidence(evidence string) {
	if evidence != "" {
		s.evidence = append(s.evidence, evidence)
	}
}

func (s *arthasDiagnosisState) evidenceCount() int {
	return len(s.evidence)
}

func (s *arthasDiagnosisState) pendingCount() int {
	return len(s.pending)
}

func (s *arthasDiagnosisState) shouldBuildReport() bool {
	return s.plan != nil && len(s.evidence) > 0 && len(s.pending) == 0
}

func (h *ArthasHandler) executeWSCommand(ctx context.Context, conn *websocket.Conn, service *services.ArthasSessionService, session services.ArthasSession, auditID uint) (string, bool) {
	if session.PID == "" {
		h.sendWSEvent(conn, arthasWSEvent{Type: "error", Message: "缺少 Java PID", Command: session.Command})
		return "", false
	}
	result, decision, err := service.Execute(ctx, session)
	if result == nil && decision.RequiresConfirmation {
		h.sendWSEvent(conn, arthasWSEvent{Type: "confirmation_required", Command: session.Command, Decision: decision})
		return "", false
	}
	if result == nil && !decision.AutoExecutable {
		h.sendWSEvent(conn, arthasWSEvent{Type: "confirmation_required", Command: session.Command, Decision: decision})
		return "", false
	}
	h.recordArthasCommand(auditID, session.Command)
	if err != nil {
		h.sendWSEvent(conn, arthasWSEvent{Type: "error", Message: err.Error(), Command: session.Command, Decision: decision})
		return "", false
	}
	h.sendWSEvent(conn, arthasWSEvent{Type: "command_result", Data: result, Command: session.Command, Decision: decision})
	return formatArthasEvidence(session.Command, result), true
}

func formatArthasEvidence(command string, result *services.ArthasExecResult) string {
	if result == nil {
		return command
	}
	output := result.Stdout
	if result.Stderr != "" {
		output += "\n[stderr]\n" + result.Stderr
	}
	return fmt.Sprintf("%s\n%s", command, output)
}

func (h *ArthasHandler) prepareSessionService(c *gin.Context) (*models.Cluster, *services.ArthasSessionService, string, bool) {
	return h.prepareSessionServiceWithContainer(c, c.DefaultQuery("container", ""))
}

func (h *ArthasHandler) prepareSessionServiceWithContainer(c *gin.Context, container string) (*models.Cluster, *services.ArthasSessionService, string, bool) {
	clusterID, err := strconv.ParseUint(c.Param("clusterID"), 10, 32)
	if err != nil {
		response.BadRequest(c, "无效的集群ID")
		return nil, nil, "", false
	}
	cluster, err := h.clusterService.GetCluster(uint(clusterID))
	if err != nil {
		response.NotFound(c, "集群不存在")
		return nil, nil, "", false
	}
	k8sClient, err := h.k8sMgr.GetK8sClient(cluster)
	if err != nil {
		response.InternalError(c, fmt.Sprintf("连接集群失败: %v", err))
		return nil, nil, "", false
	}
	if container == "" {
		container = h.defaultContainer(c.Request.Context(), k8sClient, c.Param("namespace"), c.Param("name"))
	}
	if container == "" {
		response.BadRequest(c, "未找到可用容器")
		return nil, nil, "", false
	}
	executor := services.NewK8sPodCommandExecutor(k8sClient.GetClientset(), k8sClient.GetRestConfig())
	service := services.NewArthasSessionServiceWithPackage(
		executor,
		h.newPolicy(),
		time.Duration(h.cfg.Arthas.SessionTimeout)*time.Second,
		h.cfg.Arthas.PackageSource,
		h.cfg.Arthas.PackageURL,
	)
	return cluster, service, container, true
}

func (h *ArthasHandler) defaultContainer(ctx context.Context, k8sClient *services.K8sClient, namespace, podName string) string {
	pod, err := k8sClient.GetClientset().CoreV1().Pods(namespace).Get(ctx, podName, metav1.GetOptions{})
	if err != nil || len(pod.Spec.Containers) == 0 {
		return ""
	}
	return pod.Spec.Containers[0].Name
}

func (h *ArthasHandler) newPolicy() *services.ArthasCommandPolicy {
	return services.NewArthasCommandPolicy(h.cfg.Arthas.AutoExecLowRisk, h.cfg.Arthas.MaxOutputBytes)
}

func (h *ArthasHandler) createAuditSession(c *gin.Context, cluster *models.Cluster, container string) uint {
	if h.auditService == nil {
		return 0
	}
	session, err := h.auditService.CreateSession(&services.CreateSessionRequest{
		UserID:     c.GetUint("user_id"),
		ClusterID:  cluster.ID,
		TargetType: services.TerminalTypeArthas,
		Namespace:  c.Param("namespace"),
		Pod:        c.Param("name"),
		Container:  container,
	})
	if err != nil {
		logger.Error("创建 Arthas 审计会话失败", "error", err)
		return 0
	}
	return session.ID
}

func (h *ArthasHandler) recordArthasCommand(auditID uint, command string) {
	if h.auditService != nil && auditID > 0 && command != "" {
		h.auditService.RecordCommandAsync(auditID, command, command, nil)
	}
}

func (h *ArthasHandler) storePendingCommands(commands []services.ArthasPlannedCommand) {
	h.pendingMutex.Lock()
	defer h.pendingMutex.Unlock()
	for _, command := range commands {
		if command.ID != "" {
			h.pending[command.ID] = command
		}
	}
}

func (h *ArthasHandler) getPendingCommand(id string) string {
	h.pendingMutex.RLock()
	defer h.pendingMutex.RUnlock()
	return h.pending[id].Command
}

func (h *ArthasHandler) sendWSEvent(conn *websocket.Conn, event arthasWSEvent) {
	if err := conn.WriteJSON(event); err != nil {
		logger.Error("发送 Arthas WebSocket 消息失败", "error", err)
	}
}

type arthasContextKey string

const (
	arthasNamespaceKey arthasContextKey = "arthas_namespace"
	arthasPodNameKey   arthasContextKey = "arthas_pod_name"
)

func msgNamespace(ctx context.Context) string {
	value, _ := ctx.Value(arthasNamespaceKey).(string)
	return value
}

func msgPodName(ctx context.Context) string {
	value, _ := ctx.Value(arthasPodNameKey).(string)
	return value
}
