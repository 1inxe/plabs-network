# Licensing guide

[English](#english) | [简体中文](#简体中文)

## English

### Current status

This repository has no repository-wide `LICENSE` or package license declaration.
The separate `plabs-js-sdk` package is already MIT-licensed and includes upstream
notices. Its license does not automatically apply to this application.

This guide proposes a licensing workflow; it does not grant a license.
Public repository visibility alone is not an open-source license. See
[GitHub's licensing guidance](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/licensing-a-repository).

### Choose according to the intended reuse

| License                                                       | Suitable intent                                                           | Main requirements                                                                                            |
| ------------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| [MIT](https://choosealicense.com/licenses/mit/)               | Simple, permissive reuse, including commercial and closed-source products | Retain copyright and license notices                                                                         |
| [Apache-2.0](https://choosealicense.com/licenses/apache-2.0/) | Permissive reuse with an explicit contributor patent grant                | Retain required notices, mark modified files, and preserve applicable NOTICE attribution; no trademark grant |
| [GPL-3.0](https://choosealicense.com/licenses/gpl-3.0/)       | Keep distributed derivative versions under copyleft                       | Covered distributions must satisfy GPL source-code and licensing requirements; commercial use is allowed     |

**Suggested starting point: MIT**, if the aim is broad adoption and alignment
with the SDK. Choose GPL only if copyleft is an intentional project requirement;
GPL does not prohibit commercial use.

### Apply the decision

1. Confirm who owns the original code and has authority to license it. Preserve
   existing upstream copyrights and check contributed code and bundled assets.
2. Add the selected standard license text as root-level `LICENSE`. For MIT,
   fill in the actual copyright holder and year; do not guess the legal entity.
3. Add the matching SPDX identifier to `package.json`, for example
   `"license": "MIT"`. Keep `"private": true` for applications that should not
   publish to npm; npm publication settings are separate from source licensing.
4. Update the English and Chinese README license sections to link to `LICENSE`
   and describe any separately licensed or excluded files accurately.
5. Preserve third-party licenses and attribution. Confirm redistribution rights
   for bundled code, binaries, fonts and artwork; a new project license cannot
   grant rights the project does not hold.
6. Include the applicable license and notices in distributed packages, then
   commit the license, metadata and documentation together. Verify GitHub's
   license display after the commit reaches the repository.

Keep the standard license text intact. A Chinese explanation may accompany it;
it should not silently replace the selected legal text or add custom conditions.

## 简体中文

### 当前状态

本仓库尚无仓库级 `LICENSE`，`package.json` 也未声明许可证。
独立的 `plabs-js-sdk` 已使用 MIT 并保留上游声明，但该许可不自动覆盖本应用。

本文是许可选型与实施说明，不构成许可证授予。
公开 GitHub 仓库本身不等于提供开源许可，参见
[GitHub 许可说明](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/licensing-a-repository)。

### 根据复用目标选择

| 协议                                                          | 适用目标                             | 主要要求                                                             |
| ------------------------------------------------------------- | ------------------------------------ | -------------------------------------------------------------------- |
| [MIT](https://choosealicense.com/licenses/mit/)               | 简洁宽松，允许商用和闭源产品使用     | 保留版权和许可声明                                                   |
| [Apache-2.0](https://choosealicense.com/licenses/apache-2.0/) | 宽松复用，并提供明确的贡献者专利授权 | 保留必要声明、注明文件修改、保留适用的 NOTICE 归属信息；不授予商标权 |
| [GPL-3.0](https://choosealicense.com/licenses/gpl-3.0/)       | 希望分发的衍生版本继续遵守 copyleft  | 受覆盖的分发需满足 GPL 源码与许可要求；仍允许商用                    |

**建议从 MIT 开始考虑**，适合广泛接入，也与 SDK 保持一致。
只有明确需要 copyleft 时再考虑 GPL；GPL 不禁止商用。

### 落地步骤

1. 确认原创代码的版权归属与授权权限，保留上游版权，检查外部贡献及捆绑资源。
2. 在仓库根目录新增 `LICENSE`，使用所选协议标准全文。MIT 需要填写实际版权持有人和年份，不猜测法律主体。
3. 在 `package.json` 添加对应 SPDX 标识，例如 `"license": "MIT"`。不发布到 npm 的应用继续保留 `"private": true`；npm 发布配置与源码许可证是两件事。
4. 更新中英文 README 的许可章节，链接到 `LICENSE`，准确说明单独许可或排除的文件。
5. 保留第三方许可证与归属声明。确认代码、二进制、字体和美术素材的再分发权限；新增项目许可证不能授予项目本身没有的权利。
6. 将适用许可证和声明纳入分发包，一并提交许可证、元数据与文档。推送后检查 GitHub 的许可证识别结果。

保留标准协议正文。可以附中文解释，但不要以译文悄悄替换正式文本或添加自定义限制。
