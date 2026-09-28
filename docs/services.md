# 官网服务与钱包协议

本项目没有另起业务后端，公开数据直接使用官网服务。私人账户数据通过用户批准后的钱包协议读取。

| 服务                     | 来源                                                                 | 已接接口                                                            |
| ------------------------ | -------------------------------------------------------------------- | ------------------------------------------------------------------- |
| DEX Matcher              | https://app.plabs.online/dex-matcher                                 | GET /healthz、/book、/market/stats、/market/candles/history         |
| Monad / Ethereum Indexer | https://monad-indexer.plabs.online、https://eth-indexer.plabs.online | GET /stats、/shield/stats、/txs?limit=25&before_block=…、/tx?hash=… |
| Platform                 | https://api.plabs.online                                             | GET /wallet/stats、/privasea/whitelist/status                       |
| PEX 私人订单状态         | 同一官方 DEX Matcher，由扩展访问                                     | POST /orders/status，ID 来自用户显式导入的原官网订单引用            |
| 公网与隐私余额           | 钱包 RPC + 本地解密快照                                              | plabs_getBalances，需 balances scope                                |
| 隐私历史 / Notes         | 钱包加密日志和已扫描 notes                                           | plabs_getHistory / plabs_getNotes，需各自 scope                     |

Market 精度来自 healthz，资金意图与余额 raw units 保持字符串。+9.5238 等正数涨幅和 null VWAP 均在契约中处理。

`/shield/stats` 属于 Indexer；此前探测 Relayer 返回 404 不能代表此功能不存在。池的 net shielded units 不等同于原生 private issuer 的总供应量；页面区分两者。

SDK 0.3.0 新增 address/balances/history/notes/dexOrders 范围授权。连接先授权隐私地址；点详情可申请余额/历史；锁定、切链、换账户或撤销后清空数据。没有将查看密钥交给网页，也没有恢复网页端 scanner。

PEX 旧订单不能按隐私地址自动枚举。一次性导入只复制展示引用，不含 match capability、VNote 或账户查看密钥。匹配状态来自官网，previous-epoch / unavailable 不当作完成或取消。插件 0.7.0 已实现 VNote 意图下单、订单继续检查、取消/资金回收及成交资产同步。写请求直接交给插件，插件访问官方 Matcher、Relayer 和专用 dex-indexer；网页不持有 proving 材料。实测范围见 pex-trading.md。

Platform 的 auth/challenge、auth/login、whitelist/me、twitter/start/complete、privacy-address/challenge、apply 已在官网代码中确认，但仍需认证与签名协议迁移，不冒充已实现。

详细功能差异、风险和下一阶段协议设计见 [functional-review.md](functional-review.md)。
