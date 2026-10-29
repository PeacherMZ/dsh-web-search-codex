# dsh-web-search-codex

为 DeepSeek Harness 提供 Codex Web Search 能力。

插件会注册 `codex` 搜索提供方，并将搜索请求发送到配置好的 `/alpha/search` 兼容接口。

## 获取与安装

插件通过 [PeacherMZ/dsh-web-search-codex 的 GitHub Releases](https://github.com/PeacherMZ/dsh-web-search-codex/releases) 分发，**不发布到 npm，也不要使用包名或 `@latest` 从 npm 安装**。npm 格式的 `.tgz` 是本地安装包，不代表已发布到 npm registry。

### 1. 确认 DSH 版本与 CLI 入口

插件 `0.2.0` 的 DSH peer 最低版本为 `0.2.1-rc.3`。兼容性仅限已经验证的 DSH 版本，不代表任意更高版本都兼容；详见下方“兼容性”。

不要假设系统 PATH 中一定存在 `dsh` 命令。请先确认当前 DSH 安装方式提供的 **CLI 入口**，并查看其 `--help` 和 `plugin --help`。桌面应用的启动程序不一定就是 CLI；如果安装包没有提供可用 CLI，请先按 DSH 对应版本的说明取得入口，不要猜测可执行文件或内部脚本路径。

下面以 PowerShell 和可直接调用的 CLI 文件为例；将路径替换为你已确认的真实入口。如果平时通过 Node.js 等命令启动 CLI，请沿用该启动命令及所需参数，不要把 Node.js 路径单独当作 `$DshCli`。

```powershell
# Windows 桌面版默认安装路径；自定义安装时请改为实际路径。
$DshCli = Join-Path $env:LOCALAPPDATA 'Programs\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd'
& $DshCli --version
& $DshCli --help
& $DshCli plugin --help
```

以下示例使用 Windows 桌面版的 `desktop` profile（本次运行环境已确认使用此 profile）。如果你使用 CLI 的 `web` profile，请将命令中的 `desktop` 改为 `web`；安装、移除和启动必须使用原实例的同一个 profile，否则插件不会出现在当前页面。

### 2. 下载并校验发布附件

从上述 Releases 页面选择插件 `v0.2.0`，下载 **Assets** 中的 `dsh-web-search-codex-0.2.0.tgz` 和 `SHA256SUMS`，不要下载 GitHub 自动生成的源码压缩包。两个文件应来自同一次发布。

使用本地**绝对路径**校验，只有校验成功才继续安装：

```powershell
$ErrorActionPreference = 'Stop'
$Tarball = (Resolve-Path -LiteralPath 'C:\absolute\path\dsh-web-search-codex-0.2.0.tgz').Path
$Checksums = 'C:\absolute\path\SHA256SUMS'
$Expected = ((Get-Content -LiteralPath $Checksums -Raw).Trim() -split '\s+')[0]
$Actual = (Get-FileHash -LiteralPath $Tarball -Algorithm SHA256).Hash
if ($Expected -notmatch '^[0-9a-fA-F]{64}$' -or $Actual -ne $Expected) {
  throw 'SHA256 校验失败，请停止安装并重新核对发布附件'
}
```

每次发布的校验文件只包含该发布的一个 `.tgz`。SHA256 用于检查文件完整性，不是独立的签名或来源认证；请始终从可信的仓库 Releases 页面获取附件。

### 3. 安装到既有 DSH，并重启刷新

```powershell
& $DshCli plugin --profile desktop add $Tarball
```

不要将 Releases 下载 URL 或 npm 包名直接传给安装命令。`$Tarball` 必须指向下载并校验过的本地 `.tgz` 绝对路径。

安装完成后，**完整退出并重新启动原来使用的 DSH 实例，再刷新原有浏览器页面**；仅刷新页面不足以加载新的宿主插件。保持既有 profile、端口、启动方式和访问地址，不需要另外启动一个 DSH 服务。桌面版请按原方式退出并重新打开；使用 CLI 的用户请沿用原来的启动参数。

### 4. 配置搜索提供方

打开“插件”页面，在第三方插件中选择 `dsh-web-search-codex` 的配置页，选择一种配置方式（新版 DSH 不再使用旧的“设置 -> 插件 -> 插件配置”卡槽）：

- 复用 OpenAI：在 API Key 来源中选择“OpenAI”，并检查自动生成的接口地址。
- 使用独立 Key：在 API Key 来源中选择“独立 Key”，填写完整的 `/alpha/search` 接口地址和 API Key。

确认配置后，点击“保存”。

安装插件后，Web Runtime 会使用 `codex` 作为搜索提供方，**默认网页搜索将失效**。

## 兼容性

- 本版插件版本为 `0.2.0`，DSH peer 最低版本为 `0.2.1-rc.3`；不支持旧版 DSH `0.1.x`。
- 最低 peer 版本只是依赖约束，不是完整兼容性承诺。仅保证发布时已验证的 DSH 版本；具体已验证版本和限制以对应 Release 说明为准。没有列为已验证的版本（包括更高版本）不能视为已兼容。
- 插件依赖 DSH 的宿主与 Web 插件接口；升级 DSH 后应重新确认搜索功能和设置界面，不能仅根据版本号推断兼容。

## 配置方式

### 复用 OpenAI 配置

如果模型设置中已经配置 OpenAI 提供方，且具有可用的 `baseURL` 与显式 API Key 引用（`apiKeyEnv`），选择“OpenAI”后，插件会根据其 `baseURL` 生成 `/alpha/search` 接口地址，并使用已有的 API Key。密钥不会被复制。

新版 Models 页的登录凭据可能使用 scoped record 或 OAuth grant，本版不将它们自动转换为独立 API Key。若“OpenAI”显示不可用，请选择“独立 Key”并配置支持 `/alpha/search` 的服务地址和 API Key；仅有 OAuth 登录状态并不代表该接口支持搜索。

模型留空时，搜索会跟随当前会话模型。保存前请确认生成的接口地址可用。

### 使用独立 Key

选择“独立 Key”，填写完整的 `/alpha/search` 接口地址和 API Key。模型为可选项，留空时同样跟随当前会话模型。

点击“恢复默认”并保存后，会清除插件单独保存的接口地址、模型和独立 Key，但不会影响 OpenAI 配置及其 API Key。

## 行为与限制

- 只发送当前搜索词，不读取或发送对话历史。
- 接口地址必须是包含 `/alpha/search` 的完整 URL，插件不会自动改写。
- 支持 HTTP 和 HTTPS；使用 HTTP 时会显示未加密警告。
- 拒绝所有 HTTP 重定向，避免 API Key 被发送到其他地址。
- `/alpha/search` 是 Codex 内部 alpha 协议，不是稳定的公开 API。
- 请求失败时不会自动回退到 DeepSeek 搜索提供方。
- 插件不限制模型名称，也不会替换服务端不支持的模型。

## 本地开发

```powershell
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm test
pnpm pack
```

`pnpm pack` 会执行 `prepack` 构建并生成本地 `.tgz`，不会向 npm 发布。安装时沿用前面确认过的 CLI 和 profile，并将路径替换为本次实际生成的 tarball：

```powershell
& $DshCli plugin --profile desktop add 'C:\absolute\path\dsh-web-search-codex-0.2.0.tgz'
```

如果同一版本的本地 tarball 已经安装，请先运行：

```powershell
& $DshCli plugin --profile desktop remove dsh-web-search-codex
```

然后重新添加，避免包管理器复用旧产物。开发安装后也需要完整退出并重启既有 DSH，再刷新原有页面。

## 发布方式

推送与包版本一致的 `v<version>` 标签后，GitHub Actions 会使用锁文件安装依赖，校验标签与包版本，运行测试和 typecheck，再通过 `pnpm pack` 构建 tarball，生成并校验 `SHA256SUMS`，最后将两者上传为 GitHub Release 附件。创建 Release 和上传均支持有限次数重试；重跑任务可覆盖同名附件。整个发布流程不执行 `npm publish`，也不需要 npm 发布凭据。
