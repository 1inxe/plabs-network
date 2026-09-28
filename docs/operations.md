# 运维、发布与质量门禁

## 配置

复制 `.env.example` 为 `.env.local` 可替换 API 前缀。默认同源 `/api/*` 无需此步骤。每个前缀必须是同源绝对路径或 HTTPS URL；Zod 在启动时验证。前端不得配置 API secret 或钱包密钥。

如改为跨域 HTTPS，后端必须允许 CORS，并同步调整生产 CSP 的 connect-src。现有 Nginx 以同源代理避免此问题。

开发和 preview 的代理相同。Vite preview 只用于验收构建，不是生产服务器。Docker 构建严格安装 lockfile；Nginx 监听 8080，部署时在 TLS 负载均衡或反向代理之后运行。

## 发布步骤

1. `pnpm install --frozen-lockfile`。
2. `pnpm check`：Biome、Prettier、架构边界、TypeScript、核心覆盖率、构建与预算。
3. `pnpm build-storybook` 与 `pnpm test:e2e`。
4. 根据环境核对 upstream、路由 fallback、CSP 和扩展网络支持。
5. 部署版本化镜像，保存前一镜像 tag，以切换 tag 回滚。
6. 用公开 GET smoke 验证平台统计、市场配置和静态路由；资金操作由授权测试账户在钱包内人工审批验证。

项目内没有自动部署生产的工作流，CI 只构建和验证。

## 缓存及可观测性

- 入口 HTML 为 no-store，assets 长缓存；source map 不对外公开。
- Query 暂存公开数据，失败保留上次可用数据但应标记 feed 状态；访问恢复后重取。
- 没有持久化钱包 state、查询缓存、余额或隐私地址；刷新丢弃会话 history。
- Nginx `/health` 表示静态服务存活，不代表所有上游正常。
- 第三方 telemetry 尚未配置。接入前需定义清除地址、签名、金额、proof、RPC payload 的策略。

## 预算与覆盖范围

JS gzip 预算：入口 160 KiB、单 chunk 210 KiB、总 JS 580 KiB。当前采用路由与图表分包；不得通过删除检查来解决超限。

覆盖率门槛针对 `shared/api`、`shared/lib`、Market 契约与适配器、WalletStore、Gateway schema：lines/statements/functions 80%，branches 75%。这不是全 UI 组件覆盖率。Playwright 在独立 5181 端口运行生产构建的 preview，避免开发环境依赖预打包/HMR 干扰。关键交互通过桌面/手机 E2E 验证，axe 检查 Gateway 的 WCAG A/AA；人工视觉检查仍必要。

## 工具职责

Biome 负责代码与 JSON；Prettier 负责 CSS/HTML/Markdown/YAML，ignore 明确排除重叠。Husky 只在当前项目初始化 Git 后装配。编辑器推荐配置放在 `.vscode`，不修改用户全局配置。

## 0.6.0 钱包集成更新

网页仍不持久化余额或隐私地址。刷新丢弃本站 session history；已批准的 wallet history 可从扩展重新读取。扩展内旧订单引用以 AES-GCM 加密保存，查询发往固定官方 Matcher。需要在扩展管理页重新加载同级 plabs-wallet-extension/dist，再刷新网页以加载 SDK 0.3.0。
