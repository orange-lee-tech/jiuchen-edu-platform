# ADR-0008：Production 在公司阿里云主机上与官网同机隔离部署

- 状态：Proposed
- 日期：2026-09-20

## 背景

九辰教育正式官网当前已经运行在公司服务器上，官网采用 Next.js 静态导出，由 Nginx Proxy Manager 处理公网 80/443，宿主机 Nginx 负责静态文件。

小程序后端未来期望与官网共用同一台阿里云服务器，以复用现有服务器资产，但必须避免：
- 小程序 API 崩溃拖垮官网；
- 官网发布覆盖/污染小程序环境；
- 两者争抢端口、环境变量、日志、依赖；
- 一个项目的部署或回滚影响另一个项目。

## Proposed 决策

物理主机可以共用，但运行单元必须隔离。

推荐拓扑：

```text
Internet
   |
Alibaba Cloud Security Group
   |
Nginx Proxy Manager :80/:443
   |------------------------------|
   |                              |
jiuchenedu.com                 api.<domain>
   |                              |
Host Nginx :8088              reverse proxy
   |                              |
website static out/           jiuchen-api container
                                  |
                          private app network
                                  |
                              MySQL/RDS
```

管理后台建议使用独立域名或独立受控路径，例如 `admin.<domain>`，静态文件与 API 分开发布。

## 隔离要求

### 目录
官网和小程序不得共享项目目录。

建议：
- 官网保持 `/www/wwwroot/startup-company-website`
- 小程序后端使用独立目录，例如 `/srv/jiuchen-platform/`

### 进程
- 官网继续作为静态站点，无常驻 Node 进程；
- `jiuchen-api` 独立 Docker 容器或独立 systemd service；
- 不使用一个 PM2/npm 进程管理官网与 API。

### 网络
- API 容器只暴露给本机反向代理或私有 Docker network；
- MySQL 不直接暴露公网；
- Nginx Proxy Manager 是公网入口；
- Production 使用固定公网出口 IP，供微信公众号 API 白名单使用。

### 配置
- 官网与小程序分别维护环境变量；
- Secret 不写入镜像和 Git；
- 不共享 `.env`；
- 不共享上传目录、日志目录、临时目录。

### 资源
若同一 ECS：
- 给 API 设置 CPU/内存限制；
- 设置 restart policy；
- 健康检查失败只重启 API；
- 日志轮转，避免 API 日志写满磁盘；
- 预留官网静态服务的最低资源空间。

### 发布
官网与小程序必须拥有：
- 独立发布脚本；
- 独立 release 目录；
- 独立健康检查；
- 独立 rollback；
- 独立 Git commit/tag 对应关系。

任何一方发布失败不得触发另一方回滚或 reload，除非确实修改了共享反向代理配置。

## 边界

同一台 ECS 仍然共享：
- 内核；
- 磁盘；
- 网卡；
- Nginx Proxy Manager；
- 主机级故障。

因此该方案能隔离“应用崩溃/发布失败/依赖冲突”，不能隔离“整台 ECS 宕机/磁盘满/宿主机失陷”。

如果后续业务要求官网和小程序具备真正独立故障域，应升级为两台 ECS 或将 API/数据库迁到独立托管资源。

## 仍需确认

- 阿里云 ECS 实例规格；
- 当前 Nginx Proxy Manager 的部署方式；
- 是否已有 Docker；
- Production MySQL 采用阿里云 RDS 还是同机独立数据库；
- API 正式域名；
- 管理后台正式域名；
- 备份位置与恢复目标。

在这些信息确认前，本 ADR 保持 Proposed，不执行 Production 迁移。
