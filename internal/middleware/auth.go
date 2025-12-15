package middleware

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
)

// AuthRequired JWT认证中间件
func AuthRequired(secret string) gin.HandlerFunc {
	return func(c *gin.Context) {
		// 从请求头获取token
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			c.JSON(http.StatusUnauthorized, gin.H{
				"code":    401,
				"message": "缺少认证令牌",
			})
			c.Abort()
			return
		}

		// 检查Bearer前缀
		tokenString := strings.TrimPrefix(authHeader, "Bearer ")
		if tokenString == authHeader {
			c.JSON(http.StatusUnauthorized, gin.H{
				"code":    401,
				"message": "认证令牌格式错误",
			})
			c.Abort()
			return
		}

		// 解析JWT token
		token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
			return []byte(secret), nil
		})

		if err != nil || !token.Valid {
			c.JSON(http.StatusUnauthorized, gin.H{
				"code":    401,
				"message": "认证令牌无效",
			})
			c.Abort()
			return
		}

		// 提取用户信息
		if claims, ok := token.Claims.(jwt.MapClaims); ok {
			// 处理user_id类型转换（JWT claims中的数字默认是float64）
			if userIDFloat, ok := claims["user_id"].(float64); ok {
				c.Set("user_id", uint(userIDFloat))
			} else {
				c.JSON(http.StatusUnauthorized, gin.H{
					"code":    401,
					"message": "认证令牌中缺少用户ID",
				})
				c.Abort()
				return
			}
			c.Set("username", claims["username"])
			c.Set("auth_type", claims["auth_type"])
		} else {
			c.JSON(http.StatusUnauthorized, gin.H{
				"code":    401,
				"message": "认证令牌格式无效",
			})
			c.Abort()
			return
		}

		c.Next()
	}
}
