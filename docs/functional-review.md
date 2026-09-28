# 官网、钱包扩展与新版 UI 功能审查

> 本文记录上一版的诊断。2026-09-28 的 PEX 写链路实现和验证边界见 [pex-trading.md](pex-trading.md)。

核对日期：2026-09-27。来源为 app.plabs.online 当前可访问界面、线上 index-BqtySNMe.js / PrivaSeaPanel-Bf1PczwH.js、官方 GET API 响应，以及本地扩展代码。未使用用户钱包登录官网、签名、下单或广播资金交易。

## 结论

前一版 UI **没有完整保持官网功能**。它只有公开行情/统计和几个资金意图入口，账户连接、余额、历史、交易所账户与迁移协议都未补齐。工程化和 UI 测试通过，不等于业务等价。

本次已将扩展升级为 0.6.0、嵌入 SDK 升级为 0.2.0，新增有权限边界的读取协议，并接入新版网页。仍不能宣称完整交易所或官网功能已经迁移完成。

## 对照

| 功能                   | 官网实际行为                                                                              | 本次结果                                                                                                  | 仍有差异                                                                                                  |
| ---------------------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| 账户连接               | EVM + 独立隐私账户                                                                        | 连接后请求隐私地址授权；顶栏主身份为 perc1                                                                | 仍需在钱包确认；拒绝时不能假造地址                                                                        |
| 钱包详情               | 公网资产和隐私资产                                                                        | 公网原始余额、隐私 total/spendable/pending、Notes 数量、同步状态/时间                                     | 无官方统一价格源时不把不同代币随意相加为美元总资产                                                        |
| History                | 原网站扫描与本地恢复记录                                                                  | 扩展加密操作日志 + 扫描到的收到 notes；分页、CSV、权限撤销                                                | 导入前旧网页的 outgoing 元数据不保证恢复；导入 notes 缺少交易元数据时也不能重建原交易；收到输出可能含找零 |
| PrivacyFi              | **Shield / Transfer / Unshield**，不是收益 Vault                                          | PeFi 与 /privacyfi 进入同一个真实 Gateway；按资产小数位与钱包可用余额提供比例输入                         | 普通 ERC20 Shield、Monad sUSDC Unshield 等范围仍受现有插件支持限制；提现目前到绑定 EVM 地址               |
| PEX 市场               | 官方 Matcher 配置/盘口/行情/FDV                                                           | 完全使用同一服务与精度配置                                                                                | 该字段为 false，但官网前端没有将它作为下单暂停条件；不能据此宣称交易暂停                                  |
| PEX 个人订单           | 本地订单 ID / matches_epoch + 后端 /orders/status                                         | 明确授权后，由扩展使用导入的官网订单引用查询同一后端；显示 open/pending/filled/previous-epoch/unavailable | 地址本身不是订单枚举凭证；旧记录需显式一次导入；不持有完整 DEX recovery materials                         |
| PEX 下单/撤单/成交恢复 | 选币 → 子账户 → funding → VNote 材料加密 → order/fee 签名 → Matcher → settlement/recovery | 尚未实现完整写流程；capabilities.dexTrading=false                                                         | 不可把 /cancel 返回当成资金回收成功；也不可复用普通转账签名冒充订单签名                                   |
| Explorer               | /shield/stats、/txs 分页、/tx 查询，私人内容需解密                                        | 接入官方池统计、交易摘要、分页、交易承诺查询                                                              | 不把 OVK 输入框搬到网页；交易全文解密应由钱包提供受控方法                                                 |
| P-Sea whitelist        | EVM challenge 登录、X OAuth、隐私 ownership proof、/apply                                 | 公开活动/申请人数/截止时间继续来自官方 Platform API                                                       | 登录、OAuth 和 proof 提交尚未迁移；当前 NFT 卡片仅概念展示，不是官方库存                                  |
| PrivacyFun             | 线上 build feature flags 未启用 privacyfun                                                | 仍显示开发状态                                                                                            | 不把原型里的匿名发币当成已上线后端能力                                                                    |
| 原网站路由             | /privacyfi /privasea /browser /privacyfun /privacypay                                     | 已提供兼容跳转                                                                                            | 特殊深层 OAuth 回调和交易详情路由需随认证迁移补齐                                                         |

## 隐私边界上的判断

1. **展示隐私地址，不等于对当前网站匿名。** EVM 连接、隐私地址、余额和交易历史在同一 origin 被授权后，网站可以关联它们。因此地址先授权，balances/history/notes/dexOrders 后授权；默认不把全部数据自动暴露。
2. **隐私余额不是公开 API 的 address → balance。** 它需要钱包解密已扫描的 notes。扩展负责 scanner/prover，页面只拿批准后的摘要；SDK 不导出 seed、IVK/NK/OVK、note opening 或 spending secret。
3. **同步状态属于余额正确性。** 未扫描返回 null，partial/error 显示出来；不能将 unavailable 当 0，也不能把未确认部分视为可花费金额。
4. **交易写权限与读权限分离。** 允许网站看余额不等于允许生成或广播交易，现有交易的最终钱包确认不能省掉。
5. **没有绝对不可关联承诺。** EVM gas 支付方、公开 shield/unshield 边界、时间、金额、流动性和站点日志都可能形成关联，不应继续使用原型中的 100% non-linkable、零 IP 泄漏、固定 1.18s 等未经核实宣传。
6. **现有插件同步与 proving 仍为第三方预编译资源。** 打包 Worker 没有路由 dex_order_sign / dex_order_fee_sign / dex_order_verify_owned，但现有 WASM glue 已导出这些函数及 vnote_encode。不能把缺少 Worker 路由等同于 WASM 缺少底层算法。需要与官网同版本的 DEX worker 源码和可复现构建，不能只改 capability 为 true。

## PEX 为什么不能只用地址查订单

官网保存 key 为 `perc20.dex.orders.<privacyAddress>`（当前为 perc1 身份；导入器兼容同身份旧 raw-hex 键） 的本地恢复记录。其中包含 orderId、epoch、viewIdx、funding、matchSubscriptions 等。公开/状态查询按已知 order IDs 进行；成交查询使用 `match_capability`；取消撮合也使用 capability。

本次迁移只把 display references 导入扩展、加密保存，用于同源官方后端的状态查询。它不会声称具备密码学意义的订单所有权证明，也不会向新网页复制 capability 或 viewing keys。

真正完整的 PEX 钱包集成应由扩展持有全部恢复材料，并暴露以下意图接口，而不是向网页交付原始材料：

- preview/placeOrder：网络/市场/价格/数量/最大手续费校验，钱包审批，安全持久化后才 funding。
- getOrders/getTrades：内部 ID/capability 查询，返回必要展示数据，按账户/epoch 隔离。
- cancelOrder：先检查 in-flight fills，取消撮合，再受控回收资产；步骤分别显示状态。
- resume/recover：服务重启、超时、部分 funding/settlement 的幂等恢复；不得盲目重试写请求。

## 接口来源修正

之前文档对 `/shield/stats` 的判断不准确：这是 **Indexer** 接口，不是 Relayer 接口。本次已实际验证 `https://monad-indexer.plabs.online/shield/stats` 返回真实池统计，并正式接入。前端没有自建余额/订单后端，也没有生产 mock 数据。

## 完成剩余迁移所需资料

需要原官网前端/DEX SDK/Worker 源码、Matcher/Indexer/Platform API 契约与版本，以及新域名在 auth challenge 和 X OAuth 回调中的允许配置。当前只拿到线上压缩产物，无法据此把涉及 spending authority 的 DEX 写流程宣称为完成或经审计。

本次具体协议见钱包扩展 `docs/WEBSITE-READ-PROTOCOL.md`；数据访问权限、状态生命周期与各端测试均有代码实现。

## DEX 的服务信任边界

原官网 VNote preflight/submit 会把受限 account_S 子账户的查看材料加密交给 Matcher。完整迁移必须坚持子账户索引大于 0、确认 Matcher 公钥与协议版本、按订单持久化恢复材料；不得把主账户 IVK/NK 委派给 Matcher，也不能宣传为撮合方看不到任何委派信息。
