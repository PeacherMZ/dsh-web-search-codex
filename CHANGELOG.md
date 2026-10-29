# 更新记录

## 0.2.0

### DSH 兼容性

- 目标版本：DSH `0.2.1-rc.3` 与 `0.2.1-rc.4`；发布前对这两个候选版本分别运行类型检查、测试和构建。不承诺 `0.2.2-alpha` 或未来版本兼容。
- 适配新的 SettingsForms / Loader 设置表单接口，以 volatile 配置快照实现保存后热更新。
- 将已移除的 `settings.plugin.item` 迁移至第三方插件专用的 `plugins.bundle.config`，修复新版 DSH 插件配置页不显示的问题。
- 移除宿主已不再提供、插件也无实际用途的 invariant companion。
- 保留独立 API Key、搜索模型跟随会话、拒绝重定向及凭据脱敏。OpenAI 复用仅支持显式 `apiKeyEnv` 引用；不复用新版 scoped records 或 OAuth grant。

### 分发与安装

本 fork **只通过 GitHub Releases 分发，不发布到 npmjs**。包设置了 `private: true`，工作流不执行 `npm publish`。

1. 下载本 Release 的 `dsh-web-search-codex-0.2.0.tgz` 和 `SHA256SUMS`，不要下载自动生成的源码包。
2. 核对 SHA256 后，使用当前 DSH 提供的 CLI 安装本地 tarball；示例：

   ```powershell
   $DshCli = Join-Path $env:LOCALAPPDATA 'Programs\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd'
   & $DshCli --version
   & $DshCli plugin --profile web add 'C:\absolute\path\dsh-web-search-codex-0.2.0.tgz'
   ```

   路径按实际安装位置修改，profile 必须与原有实例一致。
3. 完整退出并重启原 DSH，再刷新原页面；打开“插件”页面中本插件的配置页，填写支持 `/alpha/search` 的服务地址和 API Key。

启用后默认网页搜索将由 `codex` 替代；搜索失败不会回退到默认提供方。搜索服务的 `/alpha/search` 属于非公开稳定协议，本次自动验证使用模拟服务，不代表已验证任意第三方服务或真实密钥。

详细安装、校验、更新与配置说明见仓库 README。
