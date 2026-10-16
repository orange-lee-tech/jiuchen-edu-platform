# 甲方管理员本地备份与选择性恢复合同

2026-10-16 用户确认。当前为接口范围与验收合同；脚本尚未交付，未执行备份或恢复。

## 操作与交付
甲方管理员在其电脑上定期手动执行。无个人Mac、常驻Runner、云付费备份或24小时在线电脑依赖。工具提供备份下载、校验、恢复计划、选择性上传与恢复接口；维护文档和演练随交付补齐。
恢复scope固定为miniprogram / website / all。all代表这两项业务及其必要共享依赖；不自动覆盖其他同机服务。

## 资产边界
- 小程序：current实际release、运行配置、systemd及timer配置、Node运行时的版本/重建资料、全部必须保留的持久业务文件（包括私有案例）、腾讯CloudBase生产MySQL一致性备份。
- 网站：/www/wwwroot/jiuchen-current实际目标、静态资源、宿主nginx站点配置、证书与入口依赖；额外数据库和外部对象存储按盘点结果纳入。
- 共享入口：Nginx Proxy Manager配置数据库、证书/持久化资料及重建信息，需一致性备份；不能将运行中SQLite直接tar后称可恢复。
- CloudBase外部持久对象按用途盘点，不能把ECS目录归档称为全部业务备份。
- Harbor/Portainer登记依赖；未证明为两业务恢复必需时不进行整机复制或恢复写入。网站scope不得覆盖小程序路由，反之亦然。共享配置恢复需要逐项差异与显式确认。

## 下载与保留
完整业务备份应包含独立模块归档、数据备份、配置、版本/权限/依赖和校验清单。秘密与个人数据只进入管理员持有的加密备份，禁止进Git、CI Artifact、聊天或普通日志。
优先流式或受限临时打包，失败标partial，只有全部必需模块完整下载且校验成功才能标complete。
最多三代有效备份；新代成功后轮换。迁移前恢复点固定保留至该次上线验收结束，固定点计入三代；无可安全删除项就停止轮换并提示处理，不擅删固定点。
ECS API发布版本最多三代：现役、上一稳定、额外稳定；任何自动删除先检查current/previous/READY/审批及进行中的任务引用。备份代际与release代际分开处理。

## 恢复
先校验解密/清单/目标/模块依赖/磁盘权限，输出覆盖计划，再明确确认执行。恢复前保全目标状态；数据库默认恢复到隔离目标验证，直接覆盖生产需明确范围及数据丢失窗口确认。
SQL使用可靠官方客户端/一致性导出，明确InnoDB、触发器/视图/例程/事件等覆盖边界，不自造不完整JSON数据导出冒充数据库备份。
失败停止，不自动连带恢复另一业务。完成后按所选scope健康与业务验收，失败走已验证回退。
接口准备授权不等于已授权此刻生产恢复、删除历史版本或停止官网/NPM。

## 当前缺口
ECS无mysql/mysqldump客户端；须确定隔离工具路径。官网入口、NPM持久化挂载及数据库类型、CloudBase持久对象、网站附属数据库待只读核实。
现有候选e5908185已通过代码/临时数据库验证及ECS受限无DB冒烟；生产备份隔离恢复仍未通过，不用备份合同代替该Gate。

## 20:33 现场路径回执
- 官网current解析到/www/wwwroot/jiuchen-releases/20260809-115206-2fecbaf0，实际22MiB；需备份真实目标及current指向，不只归档符号链接。
- 宿主nginx主配置/etc/nginx/nginx.conf，prefix=/usr/share/nginx；包含的站点配置/证书路径还需由配置依赖解析核对，不打印配置秘密。
- NPM容器nginx-app：/clouddream/nginx-proxy-manage/letsencrypt→/etc/letsencrypt；/clouddream/nginx-proxy-manage/data→/data；自定义/app/index.js来自/clouddream/nginx-proxy-manage/app/index.js，必须保留该定制覆盖文件及版本信息。
- shared一级目录cases/tmp/previous-release；cases列为保留业务资料，tmp不默认长期备份，previous-release作为版本元数据。
- ECS已有/usr/bin/openssl，未安装MySQL客户端。下一步核查管理员WSL现有MySQL客户端，评估经SSH隧道在管理员侧执行官方一致性导出；不默认向ECS安装数据库或另起数据库容器。
- NPM配置数据库类型及一致性导出工具待核；未确定前入口备份不能标complete。当前只完成盘点与合同，下载/恢复脚本仍待实现验证。
