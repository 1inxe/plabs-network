# PLabs Network

[English](README.md) | **简体中文**

PLabs Network 将隐私资产管理、PEX 交易和链上活动整合在一个应用中。连接 PLabs Wallet 即可管理资产并确认交易，密钥管理和证明生成均在钱包内完成。

- **资产** — 存入、转账和提取支持的隐私资产。
- **PEX** — 浏览行情，管理支持的交易订单。
- **活动** — 查看钱包活动与交易状态。
- **白名单** — 在 Genesis whitelist 检查 JubJub Bird 名额和 P20 空投数量。需重新加载包含 `privacyOwnership` 能力的钱包插件，并在钱包中确认登录签名及隐私地址所有权证明。
- **浏览器** — 查询公开资产池统计和链上交易。

[PLabs Wallet](https://github.com/1inxe/plabs-wallet) · [JavaScript SDK](https://github.com/1inxe/plabs-js-sdk)

白名单流程测试：`node --test tests/qualification.test.mjs`（Node.js 22.15+）。查询凭证和结果仅保留在内存中，切换账户、网络或隐私会话后清除；每次查询重新读取插件能力，旧插件需重新加载更新版本后在本站重试。
