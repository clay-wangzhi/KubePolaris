# ==========================================
# KubePolaris Makefile
# ==========================================

.PHONY: help dev build test lint docker-build docker-push helm-package docs swagger clean

# 变量
VERSION ?= $(shell git describe --tags --always --dirty 2>/dev/null || echo "dev")
REGISTRY ?= docker.io
IMAGE_NAME ?= registry.cn-hangzhou.aliyuncs.com/clay-wangzhi/kubepolaris
BACKEND_IMAGE ?= registry.cn-hangzhou.aliyuncs.com/clay-wangzhi/kubepolaris-backend
FRONTEND_IMAGE ?= registry.cn-hangzhou.aliyuncs.com/clay-wangzhi/kubepolaris-frontend
COMPOSE_CMD := $(shell command -v docker-compose 2>/dev/null || echo "docker compose")
DEPLOY_DIR := deploy

# 颜色
BLUE := \033[0;34m
GREEN := \033[0;32m
YELLOW := \033[1;33m
NC := \033[0m

# 默认目标
.DEFAULT_GOAL := help

## help: 显示帮助信息
help:
	@echo ""
	@echo "$(BLUE)╔═══════════════════════════════════════════════════════════╗$(NC)"
	@echo "$(BLUE)║         KubePolaris Makefile 命令                          ║$(NC)"
	@echo "$(BLUE)╚═══════════════════════════════════════════════════════════╝$(NC)"
	@echo ""
	@echo "$(GREEN)开发命令:$(NC)"
	@echo "  make dev            - 启动开发环境"
	@echo "  make dev-backend    - 仅启动后端开发服务"
	@echo "  make dev-frontend   - 仅启动前端开发服务"
	@echo ""
	@echo "$(GREEN)构建命令:$(NC)"
	@echo "  make build          - 构建前后端"
	@echo "  make build-backend  - 构建后端"
	@echo "  make build-frontend - 构建前端"
	@echo ""
	@echo "$(GREEN)测试命令:$(NC)"
	@echo "  make test           - 运行所有测试"
	@echo "  make test-backend   - 运行后端测试"
	@echo "  make test-frontend  - 运行前端测试"
	@echo ""
	@echo "$(GREEN)代码检查:$(NC)"
	@echo "  make lint           - 运行代码检查"
	@echo "  make lint-backend   - 检查后端代码"
	@echo "  make lint-frontend  - 检查前端代码"
	@echo ""
	@echo "$(GREEN)Docker 命令:$(NC)"
	@echo "  make docker-build   - 构建 Docker 镜像"
	@echo "  make docker-push    - 推送 Docker 镜像"
	@echo "  make docker-up      - 启动 Docker Compose 服务"
	@echo "  make docker-down    - 停止 Docker Compose 服务"
	@echo "  make docker-logs    - 查看 Docker Compose 日志"
	@echo ""
	@echo "$(GREEN)部署命令:$(NC)"
	@echo "  make install        - 安装 KubePolaris"
	@echo "  make upgrade        - 升级 KubePolaris"
	@echo "  make uninstall      - 卸载 KubePolaris"
	@echo "  make helm-package   - 打包 Helm Chart"
	@echo ""
	@echo "$(GREEN)其他命令:$(NC)"
	@echo "  make docs           - 生成文档"
	@echo "  make swagger        - 生成 Swagger 文档"
	@echo "  make clean          - 清理构建产物"
	@echo ""
	@echo "$(YELLOW)当前版本: $(VERSION)$(NC)"
	@echo ""

# ==========================================
# 开发命令
# ==========================================

## dev: 启动开发环境
dev:
	@echo "$(BLUE)启动开发环境...$(NC)"
	cd $(DEPLOY_DIR)/docker-compose && $(COMPOSE_CMD) up -d mysql grafana
	@echo "$(GREEN)基础服务已启动$(NC)"
	@echo "请在单独的终端运行:"
	@echo "  后端: go run cmd/main.go"
	@echo "  前端: cd ui && npm run dev"

## dev-backend: 启动后端开发服务
dev-backend:
	@echo "$(BLUE)启动后端开发服务...$(NC)"
	go run cmd/main.go

## dev-frontend: 启动前端开发服务
dev-frontend:
	@echo "$(BLUE)启动前端开发服务...$(NC)"
	cd ui && npm run dev

# ==========================================
# 构建命令
# ==========================================

## build: 构建前后端
build: build-backend build-frontend
	@echo "$(GREEN)构建完成$(NC)"

## build-backend: 构建后端
build-backend:
	@echo "$(BLUE)构建后端...$(NC)"
	CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w -X main.Version=$(VERSION)" -o bin/kubepolaris ./cmd/main.go
	@echo "$(GREEN)后端构建完成: bin/kubepolaris$(NC)"

## build-frontend: 构建前端
build-frontend:
	@echo "$(BLUE)构建前端...$(NC)"
	cd ui && npm ci && npm run build
	@echo "$(GREEN)前端构建完成: ui/dist/$(NC)"

# ==========================================
# 测试命令
# ==========================================

## test: 运行所有测试
test: test-backend test-frontend
	@echo "$(GREEN)所有测试完成$(NC)"

## test-backend: 运行后端测试
test-backend:
	@echo "$(BLUE)运行后端测试...$(NC)"
	go test -v -race -coverprofile=coverage.out ./...
	go tool cover -html=coverage.out -o coverage.html
	@echo "$(GREEN)后端测试完成，覆盖率报告: coverage.html$(NC)"

## test-frontend: 运行前端测试
test-frontend:
	@echo "$(BLUE)运行前端测试...$(NC)"
	cd ui && npm run test 2>/dev/null || echo "$(YELLOW)前端测试尚未配置$(NC)"

# ==========================================
# 代码检查
# ==========================================

## lint: 运行所有代码检查
lint: lint-backend lint-frontend
	@echo "$(GREEN)代码检查完成$(NC)"

## lint-backend: 检查后端代码
lint-backend:
	@echo "$(BLUE)检查后端代码...$(NC)"
	@which golangci-lint > /dev/null || (echo "$(YELLOW)请安装 golangci-lint$(NC)" && exit 1)
	golangci-lint run ./...

## lint-frontend: 检查前端代码
lint-frontend:
	@echo "$(BLUE)检查前端代码...$(NC)"
	cd ui && npm run lint

# ==========================================
# Docker 命令
# ==========================================

## docker-build: 构建 Docker 镜像
docker-build:
	@echo "$(BLUE)构建 Docker 镜像...$(NC)"
	docker build -t $(IMAGE_NAME):$(VERSION) -t $(IMAGE_NAME):latest -f $(DEPLOY_DIR)/docker/kubepolaris/Dockerfile .
	docker build -t $(BACKEND_IMAGE):$(VERSION) -t $(BACKEND_IMAGE):latest -f $(DEPLOY_DIR)/docker/kubepolaris/Dockerfile.backend .
	docker build -t $(FRONTEND_IMAGE):$(VERSION) -t $(FRONTEND_IMAGE):latest -f $(DEPLOY_DIR)/docker/kubepolaris/Dockerfile.frontend .
	@echo "$(GREEN)镜像构建完成$(NC)"
	@echo "  $(IMAGE_NAME):$(VERSION)"
	@echo "  $(BACKEND_IMAGE):$(VERSION)"
	@echo "  $(FRONTEND_IMAGE):$(VERSION)"

## docker-push: 推送 Docker 镜像
docker-push:
	@echo "$(BLUE)推送 Docker 镜像...$(NC)"
	docker push $(IMAGE_NAME):$(VERSION)
	docker push $(IMAGE_NAME):latest
	docker push $(BACKEND_IMAGE):$(VERSION)
	docker push $(BACKEND_IMAGE):latest
	docker push $(FRONTEND_IMAGE):$(VERSION)
	docker push $(FRONTEND_IMAGE):latest
	@echo "$(GREEN)镜像推送完成$(NC)"

## docker-up: 启动 Docker Compose 服务
docker-up:
	@echo "$(BLUE)启动 Docker Compose 服务...$(NC)"
	cd $(DEPLOY_DIR)/docker-compose && $(COMPOSE_CMD) up -d
	@echo "$(GREEN)服务已启动$(NC)"
	cd $(DEPLOY_DIR)/docker-compose && $(COMPOSE_CMD) ps

## docker-down: 停止 Docker Compose 服务
docker-down:
	@echo "$(BLUE)停止 Docker Compose 服务...$(NC)"
	cd $(DEPLOY_DIR)/docker-compose && $(COMPOSE_CMD) down
	@echo "$(GREEN)服务已停止$(NC)"

## docker-logs: 查看 Docker Compose 日志
docker-logs:
	cd $(DEPLOY_DIR)/docker-compose && $(COMPOSE_CMD) logs -f

## docker-ps: 查看 Docker Compose 状态
docker-ps:
	cd $(DEPLOY_DIR)/docker-compose && $(COMPOSE_CMD) ps

# ==========================================
# 部署命令
# ==========================================

## install: 安装 KubePolaris
install:
	@echo "$(BLUE)安装 KubePolaris...$(NC)"
	./$(DEPLOY_DIR)/scripts/install.sh

## upgrade: 升级 KubePolaris
upgrade:
	@echo "$(BLUE)升级 KubePolaris...$(NC)"
	./$(DEPLOY_DIR)/scripts/upgrade.sh

## uninstall: 卸载 KubePolaris
uninstall:
	@echo "$(BLUE)卸载 KubePolaris...$(NC)"
	./$(DEPLOY_DIR)/scripts/uninstall.sh

## helm-package: 打包 Helm Chart
helm-package:
	@echo "$(BLUE)打包 Helm Chart...$(NC)"
	@if [ -d "$(DEPLOY_DIR)/yaml" ]; then \
		echo "$(YELLOW)YAML 部署文件目录: $(DEPLOY_DIR)/yaml$(NC)"; \
	fi
	@if [ -d "$(DEPLOY_DIR)/helm/kubepolaris" ]; then \
		helm package $(DEPLOY_DIR)/helm/kubepolaris -d dist/; \
		echo "$(GREEN)Helm Chart 打包完成$(NC)"; \
	else \
		echo "$(YELLOW)Helm Chart 目录不存在，请先创建$(NC)"; \
	fi

# ==========================================
# 其他命令
# ==========================================

## docs: 生成文档
docs:
	@echo "$(BLUE)生成文档...$(NC)"
	@echo "$(YELLOW)文档生成功能待实现$(NC)"

## swagger: 生成 Swagger 文档
swagger:
	@echo "$(BLUE)生成 Swagger 文档...$(NC)"
	@which swag > /dev/null || (echo "$(YELLOW)请安装 swag: go install github.com/swaggo/swag/cmd/swag@latest$(NC)" && exit 1)
	swag init -g cmd/main.go -o docs/api
	@echo "$(GREEN)Swagger 文档生成完成: docs/api/$(NC)"

## clean: 清理构建产物
clean:
	@echo "$(BLUE)清理构建产物...$(NC)"
	rm -rf bin/
	rm -rf ui/dist/
	rm -rf coverage.out coverage.html
	rm -rf dist/
	docker image prune -f
	@echo "$(GREEN)清理完成$(NC)"

## version: 显示版本信息
version:
	@echo "Version: $(VERSION)"
