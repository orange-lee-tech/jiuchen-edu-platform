# 九辰 ECS 资源治理交接记录 2026-10-13

## 目标

完成 ECS 资产盘点、低风险清理、边界固化。

原则：

- 生产保护优先
- 先审计后处理
- GitHub 管理历史
- ECS 管理运行

## 当前架构边界

九辰采用跨云协同架构：

```
微信小程序
 |
腾讯 CloudBase
 |
业务数据 / 微信生态能力

阿里云 ECS
 |
API服务
AI评估业务编排
官网入口
定时任务
基础设施

阿里百炼
 |
大模型推理
```

ECS职责：

- `/opt/jiuchen-api`：小程序 API、业务逻辑、AI Runtime 编排
- `/www/wwwroot/jiuchen-current`：企业官网静态资源
- `/clouddream`：Harbor、Nginx Proxy Manager、Portainer 基础设施

数据库边界：

ECS PostgreSQL：

```
/data/database
```

属于 Harbor 组件。

九辰业务数据库位于腾讯云 CloudBase。

## 清理结果

### 磁盘

清理前：

```
/dev/vda3
40G
Used 19G
```

清理后：

```
/dev/vda3
40G
Used 16G
Avail 22G
Use 43%
```

### 日志治理

systemd journal：

```
928M -> 280M
```

设置日志使用上限，控制长期增长。

### Node缓存

```
/root/.npm
635M -> 128K
```

### Staging治理

```
/opt/jiuchen-api/staging
1.2G -> 572M
```

清理重复 build artifact、重复 tar 包。

### 历史项目归档

旧项目：

```
/opt/jiuchen-releases
```

已归档：

```
/root/jiuchen-archive-2026-10-13
```

### Docker治理

完成安全检查。

删除无运行依赖镜像：

```
goharbor/prepare:v2.10.0
```

Harbor运行容器保持正常。

## 生产保护验证

API：

```
active
/opt/jiuchen-api/releases/8cc4bb85ffdf3e86e7a13a89d119f1b110491e48
```

官网：

```
/www/wwwroot/jiuchen-current
```

未调整：

- nginx配置
- 80/443入口
- 官网目录
- API systemd
- 数据库配置

## Release管理原则

ECS保存：

- 当前运行版本
- 快速回滚版本
- 少量关键验证节点

GitHub保存完整历史。

ECS不作为代码仓库。

## 后续治理建议

1. 建立 release 生命周期策略。
2. 建立定期日志巡检。
3. 建立 CloudBase 数据备份与恢复演练。
4. 建立 ECS 资源年度审计记录。
5. 持续补充未闭合工程尾巴清单。

## 本次未处理项

- release 13个历史版本最终归档策略：需结合 GitHub commit 记录确认。
- staging 剩余历史节点：保留用于后续工程核查。
- `/opt/jiuchen-api-smoke`：保留，待确认 smoke 工具生命周期。
