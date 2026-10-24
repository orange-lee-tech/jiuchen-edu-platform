# 九辰隔离真机验收环境

此环境只使用合成管理员、老师和学员及独立 MySQL 8 数据卷。API 在本机运行；临时 Cloudflare HTTPS 隧道只转发到受测试令牌保护的本机代理。模型地址指向本环境的模拟端点，不会调用真实供应商。微信虚拟支付关闭，充值由本地模拟结算命令完成。正式版小程序的 API 地址不受影响。

## 启动与项目入口

在仓库根目录运行：

```powershell
& ./tools/device-acceptance/acceptance.ps1 start
```

脚本检查本机独立 MySQL 容器，首次创建测试表并执行全部升级，编译 API，初始化三种合成身份，启动 API、代理与 HTTPS 隧道，生成 `runtime/miniprogram`。启动结束时会打印本次临时 HTTPS 地址和微信开发者工具项目路径。`runtime/status.json` 保存当前地址和进程号。隧道重启后地址会变化，须使用重新生成的项目；切勿上传此项目为正式版。

微信开发者工具导入 `C:\Users\yulia\Desktop\jiuchen-edu-device-acceptance\runtime\miniprogram`。这是单独生成的测试项目，首页和标题有“隔离测试”标识。“测试身份”页选择管理员、学员或老师，然后按正常流程同意协议并登录。身份切换会清除本机旧会话。三种身份使用固定合成 openid，只在带有随机测试令牌的代理上注入，不涉及真实微信账号或学生资料。

开发者工具的测试项目关闭 URL 合法域名检查，供开发调试及真机调试使用。当前临时隧道有有效公网 HTTPS 证书，但未登记为微信正式 request 合法域名；发布体验版或正式版前需要另行申请隔离测试域名并登记，且须有单独授权。本环境不上传微信版本。

## 管理员操作

选择管理员身份后进入管理员页的“商业控制”。“AI 评估连接 · 多密钥对象”中填写标签、服务商、当前 HTTPS 地址加 `/mock-ai/v1`、模型名、模拟密钥 `acceptance-model-alpha` 和六位对象口令。首个对象自动生效。后续对象先保存为候选；切换时填写现役控制口令与目标对象口令，两者允许相同。连接测试还需单独输入目标对象口令。错误口令不会访问模拟模型，也不会切换配置。列表不会显示密钥明文。

“评估次数方案 · 固定售价”只能改次数，不能改 JC000–JC003 的固定售价或商品 ID。填写预计单次成本并确认官方标价估算，再设置六位对象口令。首次方案自动生效，之后需现役控制口令和目标方案口令才能启用。成本只是运营估算，不是供应商账单或实时余额。切换 AI 服务商、模型、地址或密钥后要按新配置重新核验成本并创建方案。历史订单保留原始金额、次数和方案快照。

## 学员、老师、模拟充值

学员身份可看免费额度、评估次数、评估记录与充值商品。老师身份有一名合成已分配学员。原生支付开关始终关闭；小程序充值按钮不可向真实商户扣费。需要模拟充值时，先启用成本已核验的次数方案，在仓库根目录运行：

```powershell
& ./tools/device-acceptance/acceptance.ps1 recharge -Sku assessment-1
```

可用 SKU：`assessment-1`、`assessment-10`、`JC000`、`JC001`、`JC002`、`JC003`。命令仅对合成学员创建沙箱订单，并调用本地已验证通知结算逻辑两次，检查重复通知不会重复赠次。学员再次进入额度页可查看新增次数。运行成功的 AI 评估扣一次；失败时应释放预留次数。模拟模型只返回资料不足提示，不能用作实际申请建议。

## 停止、重启、重置与日志

```powershell
& ./tools/device-acceptance/acceptance.ps1 status
& ./tools/device-acceptance/acceptance.ps1 logs
& ./tools/device-acceptance/acceptance.ps1 stop
& ./tools/device-acceptance/acceptance.ps1 start
& ./tools/device-acceptance/acceptance.ps1 reset
```

`stop` 关闭本机 API、代理、隧道和测试 MySQL 容器，保留合成数据。重新 `start` 使用同一个数据卷，但生成新的临时 HTTPS 地址。已有密钥对象内保存的旧隧道地址随之失效，须在管理员页新建指向新地址的候选对象并切换，或运行 `reset` 重建合成数据。`reset` 仅删除固定名称的隔离测试容器、数据卷、生成的小程序及本地测试密钥；会清除测试数据。`logs` 只查看本地日志，`status` 不展示密钥。测试配置和随机令牌保存在忽略提交的 `runtime/acceptance.env`，脚本限制文件 ACL。不要复制或提交该文件。

## 验收证据边界

脚本启动时检查本机 API 与公网 HTTPS 健康状态。`runtime/status.json` 中的 `httpsServerReachable` 表示电脑通过公网 HTTPS 成功访问隔离 API，`wechatRealDeviceVerified` 在没有真实手机调试回执前始终为 `false`。用真实手机在微信开发者工具的真机调试中选择三种身份、访问额度和管理员配置，并记录手机端请求成功回执后，才能把真机连通判为通过。模拟器、桌面 HTTPS 检查和代码编译均不能替代真机回执。
