#!/bin/bash
# ==========================================
# KubePolaris 一键安装脚本
# ==========================================

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 获取脚本所在目录
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DEPLOY_DIR="$(dirname "$SCRIPT_DIR")"
PROJECT_ROOT="$(dirname "$DEPLOY_DIR")"

# 日志函数
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 打印 Banner
print_banner() {
    echo ""
    echo -e "${BLUE}╔═══════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║                                                           ║${NC}"
    echo -e "${BLUE}║   ${GREEN}██╗  ██╗██╗   ██╗██████╗ ███████╗██████╗  ██████╗ ${BLUE}    ║${NC}"
    echo -e "${BLUE}║   ${GREEN}██║ ██╔╝██║   ██║██╔══██╗██╔════╝██╔══██╗██╔═══██╗${BLUE}   ║${NC}"
    echo -e "${BLUE}║   ${GREEN}█████╔╝ ██║   ██║██████╔╝█████╗  ██████╔╝██║   ██║${BLUE}   ║${NC}"
    echo -e "${BLUE}║   ${GREEN}██╔═██╗ ██║   ██║██╔══██╗██╔══╝  ██╔═══╝ ██║   ██║${BLUE}   ║${NC}"
    echo -e "${BLUE}║   ${GREEN}██║  ██╗╚██████╔╝██████╔╝███████╗██║     ╚██████╔╝${BLUE}   ║${NC}"
    echo -e "${BLUE}║   ${GREEN}╚═╝  ╚═╝ ╚═════╝ ╚═════╝ ╚══════╝╚═╝      ╚═════╝ ${BLUE}   ║${NC}"
    echo -e "${BLUE}║                                                           ║${NC}"
    echo -e "${BLUE}║       ${NC}KubePolaris - Kubernetes Multi-Cluster Manager${BLUE}     ║${NC}"
    echo -e "${BLUE}║                                                           ║${NC}"
    echo -e "${BLUE}╚═══════════════════════════════════════════════════════════╝${NC}"
    echo ""
}

# 检查依赖
check_dependencies() {
    log_info "检查依赖..."
    
    # 检查 Docker
    if ! command -v docker &> /dev/null; then
        log_error "Docker 未安装，请先安装 Docker"
        exit 1
    fi
    log_success "Docker 已安装: $(docker --version)"
    
    # 检查 Docker Compose
    if command -v docker-compose &> /dev/null; then
        COMPOSE_CMD="docker-compose"
        log_success "Docker Compose 已安装: $(docker-compose --version)"
    elif docker compose version &> /dev/null; then
        COMPOSE_CMD="docker compose"
        log_success "Docker Compose 已安装: $(docker compose version)"
    else
        log_error "Docker Compose 未安装，请先安装 Docker Compose"
        exit 1
    fi
    
    # 检查 Docker 服务
    if ! docker info &> /dev/null; then
        log_error "Docker 服务未运行，请启动 Docker 服务"
        exit 1
    fi
    log_success "Docker 服务运行正常"
}

# 创建必要目录
create_directories() {
    log_info "创建必要目录..."
    
    mkdir -p "$DEPLOY_DIR/docker/grafana/secrets"
    
    log_success "目录创建完成"
}

# 生成环境变量文件
generate_env_file() {
    local ENV_FILE="$DEPLOY_DIR/docker-compose/.env"
    
    if [ -f "$ENV_FILE" ]; then
        log_warn ".env 文件已存在，跳过生成"
        return
    fi
    
    log_info "生成环境变量文件..."
    
    # 生成随机密码
    MYSQL_ROOT_PWD=$(openssl rand -base64 16 | tr -dc 'a-zA-Z0-9' | head -c 16)
    MYSQL_PWD=$(openssl rand -base64 16 | tr -dc 'a-zA-Z0-9' | head -c 16)
    JWT_SECRET=$(openssl rand -base64 32)
    GRAFANA_PWD=$(openssl rand -base64 12 | tr -dc 'a-zA-Z0-9' | head -c 12)
    
    cat > "$ENV_FILE" << EOF
# ==========================================
# KubePolaris 环境变量配置
# ==========================================

# MySQL 配置
MYSQL_ROOT_PASSWORD=${MYSQL_ROOT_PWD}
MYSQL_DATABASE=kubepolaris
MYSQL_USER=kubepolaris
MYSQL_PASSWORD=${MYSQL_PWD}
MYSQL_PORT=3306

# 后端配置
BACKEND_PORT=8080
JWT_SECRET=${JWT_SECRET}
JWT_EXPIRE_TIME=24
LOG_LEVEL=info

# 前端配置
FRONTEND_PORT=80

# Grafana 配置
GRAFANA_PORT=3000
GRAFANA_ADMIN_USER=admin
GRAFANA_ADMIN_PASSWORD=${GRAFANA_PWD}
GRAFANA_ROOT_URL=http://localhost:3000

# 版本
VERSION=latest
EOF
    
    chmod 600 "$ENV_FILE"
    log_success "环境变量文件已生成: $ENV_FILE"
    log_warn "请妥善保管 .env 文件中的密码信息"
}

# 构建镜像
build_images() {
    log_info "构建 Docker 镜像..."
    
    cd "$DEPLOY_DIR/docker-compose"
    $COMPOSE_CMD build --no-cache
    
    log_success "镜像构建完成"
}

# 启动服务
start_services() {
    log_info "启动服务..."
    
    cd "$DEPLOY_DIR/docker-compose"
    $COMPOSE_CMD up -d
    
    log_success "服务启动中..."
}

# 等待服务就绪
wait_for_services() {
    log_info "等待服务就绪..."
    
    # 等待 MySQL
    log_info "等待 MySQL 就绪..."
    for i in {1..60}; do
        if $COMPOSE_CMD exec -T mysql mysqladmin ping -h localhost &> /dev/null; then
            log_success "MySQL 已就绪"
            break
        fi
        if [ $i -eq 60 ]; then
            log_error "MySQL 启动超时"
            exit 1
        fi
        sleep 2
    done
    
    # 等待后端
    log_info "等待后端服务就绪..."
    for i in {1..30}; do
        if curl -s http://localhost:8080/healthz &> /dev/null; then
            log_success "后端服务已就绪"
            break
        fi
        if [ $i -eq 30 ]; then
            log_error "后端服务启动超时"
            exit 1
        fi
        sleep 2
    done
    
    # 等待前端
    log_info "等待前端服务就绪..."
    for i in {1..30}; do
        if curl -s http://localhost:80/health &> /dev/null; then
            log_success "前端服务已就绪"
            break
        fi
        if [ $i -eq 30 ]; then
            log_warn "前端服务可能仍在启动中"
        fi
        sleep 2
    done
    
    # 等待 Grafana
    log_info "等待 Grafana 就绪..."
    for i in {1..30}; do
        if curl -s http://localhost:3000/api/health &> /dev/null; then
            log_success "Grafana 已就绪"
            break
        fi
        if [ $i -eq 30 ]; then
            log_warn "Grafana 可能仍在启动中"
        fi
        sleep 2
    done
}

# 显示安装完成信息
show_complete_info() {
    echo ""
    echo -e "${GREEN}╔═══════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║               🎉 安装完成！                                ║${NC}"
    echo -e "${GREEN}╚═══════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${BLUE}访问地址:${NC}"
    echo -e "  📊 KubePolaris:  ${GREEN}http://localhost:80${NC}"
    echo -e "  📈 Grafana:      ${GREEN}http://localhost:3000${NC}"
    echo ""
    echo -e "${BLUE}默认账号:${NC}"
    echo -e "  KubePolaris:  admin / KubePolaris@2026"
    echo -e "  Grafana:      查看 .env 文件中的 GRAFANA_ADMIN_PASSWORD"
    echo ""
    echo -e "${BLUE}常用命令:${NC}"
    echo -e "  查看日志:     ${YELLOW}cd $DEPLOY_DIR/docker-compose && $COMPOSE_CMD logs -f${NC}"
    echo -e "  停止服务:     ${YELLOW}cd $DEPLOY_DIR/docker-compose && $COMPOSE_CMD down${NC}"
    echo -e "  重启服务:     ${YELLOW}cd $DEPLOY_DIR/docker-compose && $COMPOSE_CMD restart${NC}"
    echo -e "  查看状态:     ${YELLOW}cd $DEPLOY_DIR/docker-compose && $COMPOSE_CMD ps${NC}"
    echo ""
    echo -e "${YELLOW}注意: 首次登录请及时修改默认密码！${NC}"
    echo ""
}

# 主函数
main() {
    print_banner
    
    check_dependencies
    create_directories
    generate_env_file
    
    # 询问是否构建镜像
    read -p "是否构建 Docker 镜像？[Y/n] " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]] || [[ -z $REPLY ]]; then
        build_images
    fi
    
    # 询问是否启动服务
    read -p "是否启动服务？[Y/n] " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]] || [[ -z $REPLY ]]; then
        start_services
        wait_for_services
    fi
    
    show_complete_info
}

# 运行
main "$@"
