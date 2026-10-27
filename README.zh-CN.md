# PLabs Network

新增 **NFT Launch**：运行 `pnpm dev` 后访问 `http://127.0.0.1:5180/privasea/launch`。支持 Ethereum 链上合集、图片校验、实时铸造进度、合集详情、搜索及隐私钱包额度查询。额度查询仅签署“查询资格”所有权证明，不预留 NFT，也不授权铸造。切换钱包账户、网络或隐私会话后清除查询结果。

更新后的钱包支持 Ethereum 免费 NFT 的站内 mint：独立核对合集、预留、生成私有证明并确认 ETH Gas；前端只接收公开状态，支持刷新后的原请求恢复。钱包还新增了独立的隐私 NFT 持仓与链上同步区域。需重载新扩展并刷新网页，旧钱包显示更新提示。创建合集、市场、官方持仓页、付费 mint 与竞价仍通过明确的官方入口打开。NFT mint 不复用 JubJub P20 托管付款。详见 [NFT Launch 接入记录](docs/nft-launch-research.md)。

新增 **JubJub 拍卖**：运行 `pnpm dev` 后访问 `http://127.0.0.1:5180/privasea/jubjub`。支持实时分析、个人订单、隐私身份登录、出价/加价、原付款恢复与结算退款查询。付款优先使用钱包的通用 `sponsoredPrivacyTransfers` 能力，兼容已安装的 `jubjubBidding` 旧接口；钱包需启用实验性隐私操作。证明与付款恢复资料保留在钱包内。

拍卖规则和公开 memo 前缀由前端提供，钱包独立认证并验证资产、金额、收款地址及付款意图。当前通用接口支持 Monad 上的 PLabs 托管协议 `plabs-custody-v1`，同协议的新活动可复用，无须逐个添加钱包专用 RPC。新的链、证明格式或赞助协议仍可能需要钱包支持；前端通过已发布的 SDK 0.3.0 调用 NFT、所有权证明和通用赞助付款接口。通用请求被拒绝或结果不确定时，不会自动改走旧接口重复付款。

`VITE_JUBJUB_API` 默认 `/api/jubjub`，开发服务器、Vercel 路由和附带的 Nginx 配置转发至官方 `/nft-jubjub/v1`，保留活动 Bearer 认证。玩法和接口见 [REA 研究记录](docs/jubjub-research.md)。

[English](README.md) | **简体中文**

PLabs Network 将隐私资产管理、PEX 交易和链上活动整合在一个应用中。连接 PLabs Wallet 即可管理资产并确认交易，密钥管理和证明生成均在钱包内完成。

- **资产** — 存入、转账和提取支持的隐私资产。
- **PEX** — 浏览行情，管理支持的交易订单。
- **活动** — 查看钱包活动与交易状态。
- **白名单** — 在 NFT gallery → Genesis campaign 检查 JubJub Bird 名额和 P20 空投数量。需重新加载包含 `privacyOwnership` 能力的钱包插件，并在钱包中确认登录签名及隐私地址所有权证明。
- **浏览器** — 查询公开资产池统计和链上交易。

[PLabs Wallet](https://github.com/1inxe/plabs-wallet) · [JavaScript SDK](https://github.com/1inxe/plabs-js-sdk)

白名单流程测试：`node --test tests/qualification.test.mjs`（Node.js 22.15+）。查询凭证和结果仅保留在内存中，切换账户、网络或隐私会话后清除；每次查询重新读取插件能力，旧插件需重新加载更新版本后在本站重试。
