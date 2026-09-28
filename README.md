# PLabs Network

PLabs 新版前端。以用户提供的 Stitch 桌面/H5 原型为视觉依据，使用独立 PLabs Wallet 扩展连接，不包含网页钱包、私钥管理、浏览器隐私账本同步或网页证明生成。

## 本地开发

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

打开 <http://127.0.0.1:5180>。需要 Node.js 22.12+；仓库固定 pnpm 9.15.4。API 默认通过 Vite 同源代理接到官网的**公开只读服务**，不需要复制密钥或原站环境变量。安装同一个浏览器中的 PLabs Wallet 扩展后，点击连接。

## 架构

```text
src/
  app/                  应用装配、路由、Provider、外壳、错误边界
  features/
    gateway/            统一 Assets 存入 / 私密转账 / 提取表单、校验、复核
    trading/            PEX 行情、盘口、图表、下单能力状态
    collectibles/       NFT gallery 官方活动信息、藏品概念展示
    explorer/           Indexer 统计、公共链交易查询
    history/            本会话钱包请求记录、状态查询、CSV
    ecosystem/          Token launch 不可用状态页面
    wallet/             会话状态机、并发锁、账户切换隔离
  services/
    market/             DEX Matcher DTO、运行时校验、精度转换、Query 工厂
    indexer/            Monad / Ethereum 公开统计
    platform/           平台用户、白名单公开状态
    wallet/             PLabs SDK 唯一适配入口（可替换、可独立测试）
  shared/
    api/                HTTP transport、超时/取消、类型化错误
    config/             Zod 环境变量校验
    lib/                数值显示、CSV、安全链接等纯函数
    ui/                 Radix 基础组件、Button variants、反馈组件
    styles/             Tokens、全局基础、外壳、业务、响应式
```

依赖只能沿 `app → features → services → shared` 向下流动。业务模块只能通过公共 `index.ts` 导入，其他模块仅可复用 `wallet` 的会话接口。脚本在 CI 中检查依赖边界与 SDK/HTTP 入口。详见 [架构与状态归属](docs/architecture.md)。

## 技术栈与职责

| 技术                             | 职责                                                        |
| -------------------------------- | ----------------------------------------------------------- |
| Vite / React / TypeScript strict | 应用构建、视图、类型约束                                    |
| Tailwind CSS 4 + CSS tokens      | 布局工具、统一主题与语义样式                                |
| Radix UI                         | Dialog、Dropdown、RadioGroup、Tooltip、Slot，无障碍键盘交互 |
| Motion                           | 路由过渡，尊重 reduced-motion                               |
| TanStack Query                   | 服务端状态、缓存、请求取消、重试、后台刷新                  |
| Zod + React Hook Form            | DTO 运行时校验、环境校验、资金意图表单                      |
| Lightweight Charts               | 真实行情 K 线、成交量和 FDV 视图                            |
| PLabs Wallet SDK                 | 扩展发现、账户权限、隐私操作审批                            |
| Biome + Prettier                 | 分工明确的 lint/format，避免相互覆盖                        |
| Vitest / Playwright / axe        | 单元契约测试、桌面与手机流程、自动无障碍检查                |
| Storybook                        | 共享组件文档与独立预览                                      |

## 质量检查

```sh
pnpm lint                 # Biome + 架构边界
pnpm format               # Biome: 代码/JSON；Prettier: CSS/Markdown/YAML/HTML
pnpm typecheck            # strict + noUncheckedIndexedAccess
pnpm test:coverage        # 核心逻辑覆盖率门槛
pnpm build                # 路由按需加载与独立图表 chunk
pnpm check:bundle         # gzip 体积预算
pnpm check                # 上述门禁的集合（不含浏览器和 Storybook）
pnpm exec playwright install chromium
pnpm test:e2e             # 先构建；5181 preview 上跑桌面 + Pixel 7、可访问性、模拟扩展流程
pnpm storybook
pnpm build-storybook
```

本机复用 Chrome：`PLAYWRIGHT_CHROMIUM_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' pnpm test:e2e`。

本项目已初始化独立 Git 仓库并启用 hooks；不修改钱包扩展或父目录 hooks。复制项目时，只有**本项目有自己的 `.git`** 才安装 hooks，没有 Git 时会安全跳过。建库后可运行 `pnpm prepare`。提交前执行 lint-staged，提交信息按 Conventional Commits 校验。GitHub Actions 执行所有质量门禁，失败保留测试报告。

## 功能接入状态

扩展需重新加载同级 `plabs-wallet-extension/dist`（0.8.0），新版网页已消费 SDK 0.4.0。连接时一次批准地址、余额、历史、Notes 和 PEX 订单摘要；同一网站与账户记住读取授权，锁定时暂停，解锁后恢复。交易仍逐笔确认。

- 钱包详情：真实公网余额、隐私总余额/可花费/待确认余额、同步状态和时间；按资产展示，不编造统一美元总额。
- Assets：统一存入、隐私转账、提取，旧 Shield / Pay / PeFi 链接重定向到同一入口；池来自插件能力，比例金额来自批准后的余额，证明和广播仍在插件中。
- PEX：官网行情/盘口/精度，批准后从扩展读取官方 Matcher 的订单状态。旧网页订单 ID 需一次显式导入；新版插件提供 VNote 下单、继续检查、取消与资金回收、成交资产同步；每次操作在插件内确认。旧订单引用不能用于回收原网页钱包的资金。
- Explorer：官网 Indexer 的池统计、公开交易分页和交易承诺查询；私人密文不要求用户向网页粘贴 OVK。
- History：钱包操作日志和收到的 notes 摘要，另保留本站会话记录；旧网页 outgoing 元数据不保证完整恢复。
- NFT gallery：真实活动状态；登记及私密持仓控件置灰，认证、X OAuth、ownership proof 提交尚未迁移。卡片为用户给定概念素材，不是官方可售 NFT 库存。
- Token launch：创建功能未开放，导航与创建按钮禁用。

产品命名、旧链接映射及 Drawer 布局见 [产品结构说明](docs/product-model.md)。

完整审查与差异见 [functional-review.md](docs/functional-review.md)，接口来源见 [services.md](docs/services.md)。目前仍不能宣称全官网业务等价。

## 部署

```sh
docker build -t plabs-network .
docker run --rm -p 8080:8080 plabs-network
```

Nginx 提供 SPA 路由回退、静态资源缓存、只读 API 代理和 CSP 等响应头。请在 TLS 入口后运行。代理目标和线上静态站的域名需由部署方确认；**不要把新版部署成同一域名 `/dex-matcher` 的递归代理**。若替换现有 app.plabs.online，必须将 Nginx market upstream 改成实际 Matcher 服务地址。

Vite 的代理配置不会自动出现在静态产物里，生产环境需要使用 `deploy/nginx.conf` 或等价网关配置。Vite 环境变量在构建时写入，`VITE_*` 只能包含公开配置。详见 [运维与发布](docs/operations.md)。

右上角 [Notification](docs/notifications.md) 仅显示交易成功或交易失败；连接、授权、复制、数据加载和待确认状态不弹通知。长交易错误内容在固定卡片内滚动。
