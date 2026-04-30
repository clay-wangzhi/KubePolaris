package middleware

import (
	"net/url"
	"os"
	"strings"

	"github.com/gin-gonic/gin"
)

// CORS 跨域中间件
func CORS() gin.HandlerFunc {
	allowedOrigins := parseAllowedOrigins()

	return func(c *gin.Context) {
		method := c.Request.Method
		origin := c.Request.Header.Get("Origin")

		if origin != "" && isOriginAllowedForRequest(origin, c.Request.Host, allowedOrigins) {
			c.Header("Access-Control-Allow-Origin", origin)
			c.Header("Access-Control-Allow-Methods", "POST, GET, OPTIONS, PUT, DELETE")
			c.Header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization, Cache-Control, X-File-Name")
			c.Header("Access-Control-Expose-Headers", "Content-Length, Access-Control-Allow-Origin, Access-Control-Allow-Headers, Cache-Control, Content-Language, Content-Type")
			c.Header("Access-Control-Allow-Credentials", "true")
		}

		if method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}

		c.Next()
	}
}

// ParseAllowedOrigins 解析 CORS_ALLOWED_ORIGINS 环境变量
func ParseAllowedOrigins() []string {
	return parseAllowedOrigins()
}

// IsOriginAllowed 检查 origin 是否在允许列表中（导出供 WebSocket CheckOrigin 使用）
func IsOriginAllowed(origin string) bool {
	return isOriginAllowed(origin, parseAllowedOrigins())
}

// IsRequestOriginAllowed 检查请求 Origin 是否允许访问当前 Host。
func IsRequestOriginAllowed(origin, requestHost string) bool {
	return isOriginAllowedForRequest(origin, requestHost, parseAllowedOrigins())
}

func parseAllowedOrigins() []string {
	envOrigins := os.Getenv("CORS_ALLOWED_ORIGINS")
	if envOrigins == "" {
		return nil
	}
	var origins []string
	for _, o := range strings.Split(envOrigins, ",") {
		if trimmed := strings.TrimSpace(o); trimmed != "" {
			origins = append(origins, trimmed)
		}
	}
	return origins
}

func isOriginAllowed(origin string, allowedOrigins []string) bool {
	return isOriginAllowedForRequest(origin, "", allowedOrigins)
}

func isOriginAllowedForRequest(origin, requestHost string, allowedOrigins []string) bool {
	if len(allowedOrigins) == 0 {
		return isDevOrigin(origin) || isSameRequestHost(origin, requestHost)
	}
	for _, allowed := range allowedOrigins {
		if allowed == "*" || allowed == origin {
			return true
		}
	}
	return false
}

func isSameRequestHost(origin, requestHost string) bool {
	if requestHost == "" {
		return false
	}
	u, err := url.Parse(origin)
	if err != nil {
		return false
	}
	return strings.EqualFold(u.Host, requestHost)
}

// isDevOrigin 开发模式下允许 localhost 来源
func isDevOrigin(origin string) bool {
	u, err := url.Parse(origin)
	if err != nil {
		return false
	}
	host := u.Hostname()
	return host == "localhost" || host == "127.0.0.1"
}
