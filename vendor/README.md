# PLabs Wallet SDK

此目录包含同级 plabs-wallet-extension 发布的 `@plabs-wallet/sdk` 0.2.0 tarball，package.json 通过本地 file 依赖固定，pnpm-lock.yaml 记录完整性哈希。不依赖开发机器的绝对路径或未发布的 workspace。

升级时在钱包扩展项目构建并打包 SDK，将新 tarball 放在此目录，更新本项目依赖并运行 `pnpm check` 与 `pnpm test:e2e`。不得编辑 node_modules 或复制钱包内部密钥/proving 实现来绕过 SDK 能力边界。

SDK 的许可证与上游 NOTICE 位于 tarball 内。
