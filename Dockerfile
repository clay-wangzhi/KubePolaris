# ==========================================
# KubePolaris 多阶段构建 Dockerfile
# 前端嵌入后端，单二进制镜像
# ==========================================

# ==========================================
# Stage 1: Build Frontend
# ==========================================
FROM node:20-alpine AS frontend-builder

WORKDIR /app/ui

# 增加 Node.js 堆内存限制（解决构建时 OOM 问题）
ENV NODE_OPTIONS="--max-old-space-size=4096"

# 安装依赖（利用缓存层）
COPY ui/package*.json ./
RUN npm ci --registry=https://registry.npmmirror.com

# 复制源代码并构建
COPY ui/ ./
RUN npm run build

# ==========================================
# Stage 2: Build Backend (with embedded frontend)
# ==========================================
FROM golang:1.25-alpine AS backend-builder

# 安装必要的构建工具
RUN apk add --no-cache git ca-certificates tzdata

WORKDIR /app

# 设置 Go 代理
ENV GOPROXY=https://goproxy.cn,direct
ENV CGO_ENABLED=0
ENV GOOS=linux

# 复制依赖文件并下载依赖（利用缓存层）
COPY go.mod go.sum ./
RUN go mod download

# 复制源代码
COPY . .

# 将前端构建产物复制到 ui/dist 目录（供 go:embed 嵌入）
COPY --from=frontend-builder /app/ui/dist ./ui/dist

# 构建二进制文件
RUN go build -ldflags="-s -w" -o kubepolaris .

# ==========================================
# Stage 3: Production Image
# ==========================================
FROM alpine:3.21

LABEL maintainer="KubePolaris Team"
LABEL description="KubePolaris - Enterprise Kubernetes Multi-Cluster Management Platform"
LABEL version="1.0.0"

# 安装必要的运行时依赖
RUN apk add --no-cache \
    ca-certificates \
    tzdata \
    curl \
    && rm -rf /var/cache/apk/*

# 设置时区
ENV TZ=Asia/Shanghai

# 创建非 root 用户
RUN addgroup -g 1000 kubepolaris && \
    adduser -u 1000 -G kubepolaris -s /bin/sh -D kubepolaris

WORKDIR /app

# 复制后端二进制文件
COPY --from=backend-builder /app/kubepolaris /app/

# 创建必要的目录
RUN mkdir -p /app/logs /app/data && \
    chown -R kubepolaris:kubepolaris /app

# 暴露端口
# 8080: Backend API + Frontend
EXPOSE 8080

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8080/healthz || exit 1

# 使用非 root 用户运行
USER kubepolaris

# 直接启动二进制文件
ENTRYPOINT ["/app/kubepolaris"]
