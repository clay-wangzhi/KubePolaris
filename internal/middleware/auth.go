package middleware

import (
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"

	"github.com/clay-wangzhi/KubePolaris/internal/response"
)

// AuthRequired JWT认证中间件
func AuthRequired(secret string) gin.HandlerFunc {
	return func(c *gin.Context) {
		var tokenString string

		// 优先从请求头获取token
		authHeader := c.GetHeader("Authorization")
		if authHeader != "" {
			// 检查Bearer前缀
			tokenString = strings.TrimPrefix(authHeader, "Bearer ")
			if tokenString == authHeader {
				response.Unauthorized(c, "认证令牌格式错误")
				return
			}
		} else {
			// 如果请求头没有token，尝试从URL查询参数获取（用于WebSocket）
			tokenString = c.Query("token")
		}

		if tokenString == "" {
			response.Unauthorized(c, "缺少认证令牌")
			return
		}

		// 解析JWT token
		token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
			return []byte(secret), nil
		})

		if err != nil || !token.Valid {
			response.Unauthorized(c, "认证令牌无效")
			return
		}

		// 提取用户信息
		if claims, ok := token.Claims.(jwt.MapClaims); ok {
			// 处理user_id类型转换（JWT claims中的数字默认是float64）
			if userIDFloat, ok := claims["user_id"].(float64); ok {
				c.Set("user_id", uint(userIDFloat))
			} else {
				response.Unauthorized(c, "认证令牌中缺少用户ID")
				return
			}
			c.Set("username", claims["username"])
			c.Set("auth_type", claims["auth_type"])
		} else {
			response.Unauthorized(c, "认证令牌格式无效")
			return
		}

		c.Next()
	}
}
