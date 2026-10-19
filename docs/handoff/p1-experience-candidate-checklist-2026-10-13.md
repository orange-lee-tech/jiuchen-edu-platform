# P1-20261013 Experience Candidate Checklist

候选 `p1/foundation` 的代码 SHA 为 `22f388911e60a2831f3bfb27e0f6191f5e912a85`；[CI](https://github.com/orange-lee-tech/jiuchen-edu-platform/actions/runs/38357710899) PASS。后续文档提交不更改小程序代码；上传前以最终 HEAD 与本清单核对。微信开发者工具编译／上传、体验版预览和手机验收尚未执行；本清单是本人集中验收的记录页，不是通过证明。生产 API 为 Release A，不重复发布。

| 身份 | 页面路径／动作 | 预期结果 | 当前限制与验收记录 |
| --- | --- | --- | --- |
| 学员 | 微信登录 → 我的 → 完善资料 | 真实绑定状态、学校专业回显；缺字段明确错误 | `enrollment_year` 生产缺列，实际提交可能失败；DEVICE PENDING |
| 学员 | 我的规划 → 导入课表 → 选学期 → 设置第一周周一 | 日期保存回读、本周周次与课程正确；返回首页显示最新学期 | 既有导入／第一周链路 DEVICE PASS；本轮首页刷新 DEVICE PENDING |
| 学员 | AI 评估 → 结果 → 历史报告 | 现有真实评估不回归 | 既有 Runtime DEVICE PASS，本轮不改 Runtime |
| 学员 | 结果／历史 → 保存图片／生成长图 | 全文无裁切，姓名 UID 日期斜向水印，相册里可查看 | DEVICE PENDING |
| 学员 | 院校详情／评估结果 → 联系客服 | 剪贴板模板只含当前用户可核实资料，手动粘贴发送 | DEVICE PENDING |
| 学员 | 保研资讯 → 分类／详情 | 旧 `/news` 的已审核文章，来源更新时间语义明确；收藏提示待开放 | News V2 未生产启用；DEVICE PENDING |
| 管理员 | 登录 → 用户与内部编号 | 学员／老师列表与真实绑定、分配、缺失信息一致 | 已分配学员与已认领老师真实样本缺失，DATA PENDING |
| 管理员 | AI 评估与充值统计 → 周月年／折柱 | 成功／失败／创建／运行按来源显示；缺支付表提示数据源不可用 | 区间评估用户数在 Release A 明示“当前 API 未提供”；DEVICE PENDING |
| 管理员 | 资讯运营 → 同步回执／标签 | 旧后台 API 可用；核对最新文章标题和来源更新时间 | V2 退役任务不可测试；DEVICE PENDING |
| 老师 | 登录 → 负责学员／只读查阅 | 仅能查看实际分配学员，不获取编辑、评估、支付权限 | 已认领老师样本缺失；DATA/DEVICE PENDING |

记录每项的账号类别、实际时间、页面、HTTP 状态、脱敏结果和截图位置；不要在仓库提交完整个人资料、会话或生产密钥。失败项按真实原因标记 BLOCKED，不转成零统计或 PASS。

**入口状态**：CODE/TEST READY FOR UPLOAD，DEPLOYED: NO，DEVICE PENDING。Profile 缺列使完善资料 BLOCKED；News V2、支付与成本防火墙代码均不进入本次 P1 验收。完整来源与限制见 [设备就绪审计](p1-device-readiness-audit-2026-10-13.md)。
