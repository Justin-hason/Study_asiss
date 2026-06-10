package middleware

import (
	"context"
	"net/http"
	"strings"

	"github.com/golang-jwt/jwt/v5"
)

type ctxKey string

const (
	CtxUserID   ctxKey = "user_id"
	CtxTenantID ctxKey = "tenant_id"
	CtxRole     ctxKey = "role"
)

func AuthMiddleware(jwtSecret string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ah := r.Header.Get("Authorization")
			if ah == "" || !strings.HasPrefix(ah, "Bearer ") {
				http.Error(w, `{"error":{"code":"UNAUTHORIZED","message":"missing or invalid token"}}`, http.StatusUnauthorized)
				return
			}
			tokenStr := strings.TrimPrefix(ah, "Bearer ")
			token, err := jwt.Parse(tokenStr, func(t *jwt.Token) (interface{}, error) {
				return []byte(jwtSecret), nil
			})
			if err != nil || !token.Valid {
				http.Error(w, `{"error":{"code":"UNAUTHORIZED","message":"invalid token"}}`, http.StatusUnauthorized)
				return
			}
			claims, ok := token.Claims.(jwt.MapClaims)
			if !ok {
				http.Error(w, `{"error":{"code":"UNAUTHORIZED","message":"invalid claims"}}`, http.StatusUnauthorized)
				return
			}
			uid, _ := claims["user_id"].(string)
			tid, _ := claims["tenant_id"].(string)
			role, _ := claims["role"].(string)
			ctx := context.WithValue(r.Context(), CtxUserID, uid)
			ctx = context.WithValue(ctx, CtxTenantID, tid)
			ctx = context.WithValue(ctx, CtxRole, role)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

func GetUserID(ctx context.Context) string {
	v, _ := ctx.Value(CtxUserID).(string)
	return v
}

func GetTenantID(ctx context.Context) string {
	v, _ := ctx.Value(CtxTenantID).(string)
	return v
}

func GetRole(ctx context.Context) string {
	v, _ := ctx.Value(CtxRole).(string)
	return v
}
