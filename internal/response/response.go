package response

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// ErrorBody 统一错误响应体
type ErrorBody struct {
	Error ErrorDetail `json:"error"`
}

// ErrorDetail 错误详情
type ErrorDetail struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

// ListResult 列表响应体（含分页）
type ListResult struct {
	Items interface{} `json:"items"`
	Total int64       `json:"total"`
}

// PagedListResult 分页列表响应体（含页码信息）
type PagedListResult struct {
	Items    interface{} `json:"items"`
	Total    int64       `json:"total"`
	Page     int         `json:"page"`
	PageSize int         `json:"pageSize"`
}

// ---- 成功响应 ----

// OK 返回 200 + 数据体
func OK(c *gin.Context, data interface{}) {
	c.JSON(http.StatusOK, data)
}

// List 返回 200 + 列表（含 total）
func List(c *gin.Context, items interface{}, total int64) {
	c.JSON(http.StatusOK, ListResult{Items: items, Total: total})
}

// PagedList 返回 200 + 分页列表（含 page/pageSize）
func PagedList(c *gin.Context, items interface{}, total int64, page, pageSize int) {
	c.JSON(http.StatusOK, PagedListResult{
		Items:    items,
		Total:    total,
		Page:     page,
		PageSize: pageSize,
	})
}

// Created 返回 201
func Created(c *gin.Context, data interface{}) {
	c.JSON(http.StatusCreated, data)
}

// NoContent 返回 204（无响应体）
func NoContent(c *gin.Context) {
	c.Status(http.StatusNoContent)
}

// ---- 错误响应 ----

// Error 返回自定义状态码 + 结构化错误
func Error(c *gin.Context, status int, code, message string) {
	c.JSON(status, ErrorBody{Error: ErrorDetail{Code: code, Message: message}})
	c.Abort()
}

// BadRequest 400
func BadRequest(c *gin.Context, msg string) {
	Error(c, http.StatusBadRequest, "BAD_REQUEST", msg)
}

// Unauthorized 401
func Unauthorized(c *gin.Context, msg string) {
	Error(c, http.StatusUnauthorized, "UNAUTHORIZED", msg)
}

// Forbidden 403
func Forbidden(c *gin.Context, msg string) {
	Error(c, http.StatusForbidden, "FORBIDDEN", msg)
}

// NotFound 404
func NotFound(c *gin.Context, msg string) {
	Error(c, http.StatusNotFound, "NOT_FOUND", msg)
}

// Conflict 409
func Conflict(c *gin.Context, msg string) {
	Error(c, http.StatusConflict, "CONFLICT", msg)
}

// InternalError 500
func InternalError(c *gin.Context, msg string) {
	Error(c, http.StatusInternalServerError, "INTERNAL_ERROR", msg)
}

// ServiceUnavailable 503
func ServiceUnavailable(c *gin.Context, msg string) {
	Error(c, http.StatusServiceUnavailable, "SERVICE_UNAVAILABLE", msg)
}
