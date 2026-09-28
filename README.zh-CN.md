# PLabs Network

[English](README.md) | **简体中文**

PLabs Network 是用于隐私资产转账、PEX 交易、钱包活动和公开链上数据查询的 Web 应用。它通过 [JavaScript SDK](https://github.com/1inxe/plabs-js-sdk) 连接 [PLabs Wallet](https://github.com/1inxe/plabs-wallet)，由钱包管理密钥、生成证明并确认交易。

## 本地运行

安装 Node.js 22.12+ 和 pnpm 9.15.4，然后运行：

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

打开 <http://127.0.0.1:5180>。公开行情和区块浏览器数据无需连接钱包即可查看。开发环境使用 `vite.config.ts` 配置的 API 代理；使用默认值时不需要环境变量文件。

## 连接与使用

1. 在同一浏览器安装 PLabs Wallet，创建或导入账户并解锁。
2. 点击应用中的 **Connect**，在钱包中批准请求的访问权限。
3. 打开 **Assets**，存入隐私池、发送隐私转账或提取到公开地址。选择支持的网络和资产，填写金额及需要的收款地址，再到钱包中复核并批准。
4. 打开 **Trade** 查看 PEX 行情并提交支持的订单。订单控件还可通过钱包查询状态、取消订单及同步成交资产。
5. 打开 **Activity** 查看钱包历史和当前会话记录，或打开 **Explorer** 查询公开池统计和交易。

可用操作取决于连接的钱包、网络和池。公开余额与隐私余额分开展示。待确认或超时的交易可能仍在处理中，重试前请先查询状态。导入的旧 PEX 订单引用仅供读取，不能用于回收原网页钱包中的资金。

NFT gallery 展示图片和活动信息，登记与私密持仓功能尚不可用。Token 创建也尚未开放。

## API 配置

需要覆盖默认值时，将 `.env.example` 复制为 `.env.local`，修改对应配置：

| 变量                | 默认值          | 数据                  |
| ------------------- | --------------- | --------------------- |
| `VITE_MARKET_API`   | `/api/market`   | PEX 行情和订单簿      |
| `VITE_MONAD_API`    | `/api/monad`    | Monad 公开 Indexer    |
| `VITE_ETHEREUM_API` | `/api/ethereum` | Ethereum 公开 Indexer |
| `VITE_PLATFORM_API` | `/api/platform` | 平台与活动信息        |

配置必须是同源路径或 HTTPS URL。修改后重启开发服务器。这些值在构建时写入产物，不得包含秘密信息。更换生产接口时，也需更新对应的部署代理规则。

## 构建与部署

```sh
pnpm build
pnpm preview
```

生产产物位于 `dist/`，本地预览地址为 <http://127.0.0.1:5180>。

**Vercel**：导入仓库，并使用仓库根目录作为项目目录。`vercel.json` 提供构建命令、输出目录、API 重写和 SPA 路由回退。

**Docker / Nginx**：

```sh
docker build -t plabs-network .
docker run --rm -p 8080:8080 plabs-network
```

打开 <http://localhost:8080>。公开部署时放在 HTTPS 入口后。`deploy/nginx.conf` 提供 SPA 路由、只读 API 代理与静态缓存；`deploy/security-headers.conf` 提供安全响应头。如果部署域名就是当前行情上游域名，请将行情代理指向实际 Matcher 服务，以免产生代理循环。

其他静态托管平台需要等价的 API 代理规则，以及面向应用路由的 `index.html` 回退。Vite 代理配置不包含在 `dist/` 中。

## 开发

使用 React、TypeScript、Vite、Tailwind CSS、Radix UI、TanStack Query 和 Lightweight Charts 构建。

```text
src/app/       路由、Provider 和应用外壳
src/features/  资产、交易、钱包、活动和区块浏览器视图
src/services/  公开 API 客户端和钱包 SDK 适配器
src/shared/    UI 组件、样式、配置和工具函数
public/        应用图片与品牌素材
vendor/        打包的 JavaScript SDK 依赖
```

```sh
pnpm check       # Lint、格式检查，以及包含类型检查的生产构建
pnpm format      # 格式化源码和文档
```

SDK 更新方法见 [vendor/README.zh-CN.md](vendor/README.zh-CN.md)。图片与字体来源见[素材来源](docs/asset-sources.md)。

修改 README 时请同步更新英文和中文版本。

## 许可证

本仓库尚未声明仓库级开源许可证。依赖保留各自的许可证，SDK 的 MIT 许可证不自动覆盖本应用。协议选型与添加步骤见[许可说明](LICENSING.md)。
