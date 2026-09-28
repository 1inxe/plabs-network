# PEX 无法卖出的实测诊断

> 本文记录上一版的诊断。2026-09-28 的 PEX 写链路实现和验证边界见 [pex-trading.md](pex-trading.md)。

核对官网 index-BqtySNMe.js、当前 GET /dex-matcher/healthz 和 /book。没有使用用户钱包签名、锁定资金或发送订单。

## 确认的问题

1. 原新版页面的提交按钮在钱包连接后直接 disabled，点击逻辑只有连接/切链；没有任何下单 RPC。插件 capabilities.dexTrading 为 false，SDK 0.2.0 只有订单读取接口。这是未实现的交易写链路，不是用户操作错误。
2. 将 settle_enabled=false 解释成“Matching engine paused”不成立。官网当前代码的 rF/eF 路径不以该字段拒绝下单；它检查市场状态、持久化健康、固定部署地址、协议版本、价格/数量网格及资金条件。真实后端结算语义仍需 Matcher 源码确认。
3. 市价金额以 amount × 24h VWAP 计算是错误的。没有 24 小时成交时 VWAP 为 null，但仍可存在充足盘口流动性。
4. 余额按 symbol 匹配不充分，现已按当前链和市场 pool address 匹配；已授权的余额会自动读取和刷新。读取失败/拒绝会显示在订单表单内。

## 本次已修正

- 移除无依据的“交易暂停”提示，明确区分已连接、读权限、同步状态和未完成的下单能力。
- 市价卖出按 bid 深度估算、买入按 ask 深度估算，使用 BigInt 原始单位；保留价格 tick、lot size、最低数量和滑点保护。
- 限价单显示其委托金额，允许没有对手盘时计算委托值，不保证立即成交。
- 显示官方配置的预计费用储备及对应资产；独立费用池余额不足与卖出本金不足分别提示。
- 卖出比例/MAX 使用已授权可花费余额，并扣除同资产费用储备，不做浮点数量运算。

对应快照：best bid 0.001 sUSDC、85,000 P20 深度，84,000 P20 的预计卖出额为 84 sUSDC；另需配置的 0.5 sUSDC 费用储备。这只是当时盘口估算，不是成交承诺。0.5% 滑点保护还受 0.0001 的价格 tick 影响，页面显示取整后的保护价格。

## 真实卖出仍缺什么

当前仍未实现真实下单，不能把本次报价/反馈修正称为“卖出已修通”。官网 eF 的完整路径包括：

1. 链/资产池/DexSettlement/协议版本绑定，费用与可用 Notes 检查。
2. 持久分配 account_S，生成独立本金/费用 Notes、VNote 条款、受限查看委派。
3. 对 Matcher 公钥加密材料并先做 /vnote/preflight。
4. 在资金提交前持久化完整恢复记录。
5. 按先费用、后本金的条件调用官方 Relayer /dex/transfer/submit，逐笔跟踪不确定提交状态。
6. 等待官方 Indexer 确认，再 /vnote/submit；保存 order ID/capability 并处理匹配状态。
7. 处理部分成交、服务重启、取消撮合后的剩余资金回收和最终余额更新。

仅在 Worker 增加几个 method case、移除 disabled 或暴露 eth_sendTransaction，均不等于完成上述资金生命周期。

## Prover 核对修正

已有 WASM glue 包含 dex_order_sign_wasm、dex_order_fee_sign_wasm、dex_order_verify_owned_wasm、vnote_encode。0.6.0 Worker 没有将这些方法暴露给其消息协议。

官网当前 WASM manifest 版本 aaeba55a…，扩展当前打包版本 41df131b…；新版官网 Worker 还支持 VNote successor/payout 等接口。需要对照正式 DEX 模块/Worker 源码及版本资料迁移、验证，而不能只看导出函数存在就启用资金操作。本次没有替换扩展的证明产物或改变其资金写权限。

下一步需要原官网前端的 PEX 模块、对应 Prover 构建源及 Matcher/Relayer 协议版本。当前本地项目没有这些维护源文件；官网可读压缩 JS 能说明流程，但不足以作为已完成、已验证的资金实现声明。
