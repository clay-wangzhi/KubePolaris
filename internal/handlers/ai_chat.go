package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"github.com/clay-wangzhi/KubePolaris/internal/k8s"
	"github.com/clay-wangzhi/KubePolaris/internal/models"
	"github.com/clay-wangzhi/KubePolaris/internal/response"
	"github.com/clay-wangzhi/KubePolaris/internal/services"
	"github.com/clay-wangzhi/KubePolaris/pkg/logger"
)

// AIChatHandler AI 对话处理器
type AIChatHandler struct {
	clusterService  *services.ClusterService
	aiConfigService *services.AIConfigService
	toolExecutor    *services.ToolExecutor
}

// NewAIChatHandler 创建 AI 对话处理器
func NewAIChatHandler(db *gorm.DB, clusterSvc *services.ClusterService, k8sMgr *k8s.ClusterInformerManager) *AIChatHandler {
	return &AIChatHandler{
		clusterService:  clusterSvc,
		aiConfigService: services.NewAIConfigService(db),
		toolExecutor:    services.NewToolExecutor(k8sMgr, clusterSvc),
	}
}

// chatRequest 对话请求
type chatRequest struct {
	Messages []services.ChatMessage `json:"messages"`
}

// Chat 处理 AI 对话请求（SSE 流式响应）
func (h *AIChatHandler) Chat(c *gin.Context) {
	clusterIDStr := c.Param("clusterID")
	clusterID, err := strconv.ParseUint(clusterIDStr, 10, 32)
	if err != nil {
		response.BadRequest(c, "无效的集群ID")
		return
	}

	var req chatRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "请求参数错误: "+err.Error())
		return
	}

	if len(req.Messages) == 0 {
		response.BadRequest(c, "消息不能为空")
		return
	}

	aiConfig, err := h.aiConfigService.GetConfigWithAPIKey()
	if err != nil || aiConfig == nil {
		response.BadRequest(c, "AI 功能未配置，请在系统设置中配置 AI")
		return
	}
	if !aiConfig.Enabled || aiConfig.APIKey == "" {
		response.BadRequest(c, "AI 功能未启用")
		return
	}

	cluster, err := h.clusterService.GetCluster(uint(clusterID))
	if err != nil {
		response.BadRequest(c, "集群不存在")
		return
	}

	systemPrompt := buildSystemPrompt(cluster)

	messages := make([]services.ChatMessage, 0, len(req.Messages)+1)
	messages = append(messages, services.ChatMessage{
		Role:    "system",
		Content: systemPrompt,
	})
	messages = append(messages, req.Messages...)

	provider := services.NewAIProvider(aiConfig)
	tools := services.GetToolDefinitions()

	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")
	c.Header("X-Accel-Buffering", "no")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 120*time.Second)
	defer cancel()

	flusher, ok := c.Writer.(http.Flusher)
	if !ok {
		response.InternalError(c, "不支持流式响应")
		return
	}

	sendSSE := func(eventType, data string) {
		fmt.Fprintf(c.Writer, "event: %s\ndata: %s\n\n", eventType, data)
		flusher.Flush()
	}

	// Function Calling 循环：最多 10 轮工具调用
	for round := 0; round < 10; round++ {
		chatReq := services.ChatRequest{
			Messages: messages,
			Tools:    tools,
		}

		eventCh, err := provider.ChatStream(ctx, chatReq)
		if err != nil {
			sendSSE("error", fmt.Sprintf(`{"error":"%s"}`, escapeJSON(err.Error())))
			sendSSE("done", "{}")
			return
		}

		var contentBuilder strings.Builder
		toolCallsMap := make(map[int]*services.ToolCall)
		finishReason := ""

		for evt := range eventCh {
			if evt.Error != nil {
				sendSSE("error", fmt.Sprintf(`{"error":"%s"}`, escapeJSON(evt.Error.Error())))
				sendSSE("done", "{}")
				return
			}

			if evt.Content != "" {
				contentBuilder.WriteString(evt.Content)
				sendSSE("content", fmt.Sprintf(`{"content":"%s"}`, escapeJSON(evt.Content)))
			}

			for _, tc := range evt.ToolCalls {
				idx := tc.Index
				existing, ok := toolCallsMap[idx]
				if !ok {
					toolCallsMap[idx] = &services.ToolCall{
						Index:    idx,
						ID:       tc.ID,
						Type:     "function",
						Function: services.FunctionCall{Name: tc.Function.Name, Arguments: tc.Function.Arguments},
					}
				} else {
					if tc.ID != "" {
						existing.ID = tc.ID
					}
					if tc.Function.Name != "" {
						existing.Function.Name += tc.Function.Name
					}
					existing.Function.Arguments += tc.Function.Arguments
				}
			}

			if evt.FinishReason != "" {
				finishReason = evt.FinishReason
			}

			if evt.Done {
				break
			}
		}

		if finishReason == "tool_calls" && len(toolCallsMap) > 0 {
			toolCalls := make([]services.ToolCall, 0, len(toolCallsMap))
			for i := 0; i < len(toolCallsMap); i++ {
				if tc, ok := toolCallsMap[i]; ok {
					toolCalls = append(toolCalls, *tc)
				}
			}

			// 将 assistant 消息（包含 tool_calls）加入历史
			messages = append(messages, services.ChatMessage{
				Role:      "assistant",
				Content:   contentBuilder.String(),
				ToolCalls: toolCalls,
			})

			// 执行每个工具调用
			for _, tc := range toolCalls {
				sendSSE("tool_call", fmt.Sprintf(`{"id":"%s","name":"%s","arguments":%s}`,
					escapeJSON(tc.ID), escapeJSON(tc.Function.Name), tc.Function.Arguments))

				result, execErr := h.toolExecutor.ExecuteTool(ctx, uint(clusterID), tc.Function.Name, tc.Function.Arguments)
				if execErr != nil {
					result = fmt.Sprintf(`{"error":"%s"}`, escapeJSON(execErr.Error()))
					logger.Error("工具执行失败", "tool", tc.Function.Name, "error", execErr)
				}

				sendSSE("tool_result", fmt.Sprintf(`{"id":"%s","name":"%s","result":%s}`,
					escapeJSON(tc.ID), escapeJSON(tc.Function.Name), ensureJSON(result)))

				messages = append(messages, services.ChatMessage{
					Role:       "tool",
					Content:    result,
					ToolCallID: tc.ID,
				})
			}

			continue
		}

		// 文本回复完成
		sendSSE("done", "{}")
		return
	}

	sendSSE("error", `{"error":"工具调用轮次超出限制"}`)
	sendSSE("done", "{}")
}

func buildSystemPrompt(cluster *models.Cluster) string {
	name := cluster.Name
	version := cluster.Version

	return fmt.Sprintf(`你是 KubePolaris AI 助手，帮助用户管理和诊断 Kubernetes 集群。
当前集群：%s，K8s 版本：%s

你可以使用以下工具查询集群资源、查看监控指标、分析问题：
- list_pods / get_pod_detail / get_pod_logs：查看 Pod 信息和日志
- list_deployments / get_deployment_detail：查看 Deployment 信息
- list_nodes / get_node_detail：查看节点信息
- list_events：查看 K8s 事件
- list_services / list_ingresses：查看网络资源
- scale_deployment / restart_deployment：扩缩容和重启（需要用户确认）

使用规则：
1. 根据用户问题，主动使用工具获取数据后再回答
2. 对于写操作（扩缩容、重启等），必须先告知用户操作详情并等待确认
3. 回答使用 Markdown 格式，表格展示列表数据
4. 如果工具返回错误，向用户说明原因
5. 用中文回答`, name, version)
}

func escapeJSON(s string) string {
	b, _ := json.Marshal(s)
	return string(b[1 : len(b)-1])
}

func ensureJSON(s string) string {
	s = strings.TrimSpace(s)
	if s == "" {
		return `""`
	}
	if (s[0] == '{' || s[0] == '[') && json.Valid([]byte(s)) {
		return s
	}
	b, _ := json.Marshal(s)
	return string(b)
}
