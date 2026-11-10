<p align="center">
  <a href="https://github.com/Loping151/XutheringWavesUID"><img src="./ICON.png" width="200" height="200" alt="dsh-plugin-waves"></a>
</p>
<h1 align="center">dsh-plugin-waves</h1>
<p align="center">XutheringWavesUID 的 DeepSeek Harness 版本 · v0.0.3</p>

这是 [XutheringWavesUID](https://github.com/Loping151/XutheringWavesUID) 的 dsh 版：同一套鸣潮查询、
面板、伤害计算与评分、排行，由 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)
提供原生渲染能力。

已内置 [RoverSign](https://github.com/Loping151/RoverSign)（签到）与 [ScoreEcho](https://github.com/Loping151/ScoreEcho)（声骸识图评分）。

图文结果直接以 HTML 卡片呈现；卡片里的角色可以点击，其余命令、算法、素材、模板全部与 [XutheringWavesUID](https://github.com/Loping151/XutheringWavesUID) 一致。

为模型提供了原生数据接口，模型完全可读用户数据。可自行搭配其他工具使用，比如让AI将数据自行填入其他排轴/伤害计算等网页工具（需对应工具支持）。

开新会话首次发送指令将同时发送你好，此为dsh目前固有限制，否则无法显示指令结果。

## dsh-go 原生适配（本分支）

本分支是基于 [Loping151/dsh-plugin-waves](https://github.com/Loping151/dsh-plugin-waves) 的 dsh-go 测试适配，保留上游历史及 GPL-3.0 许可证。适配代码位于本 fork 的 `dsh-go` 分支；聊天新媒体卡片的 App 内最终显示仍待确认，详见 [验证记录](./DSH-GO-VERIFICATION.md)。

支持 DSH `0.2.2-rc.1` 和 dsh-go 原生界面：

- 输入框上方「鸣潮」胶囊打开查询面板；「全部功能」内提供「鸣潮查询」「鸣潮设置」。
- `waves` / `waves_panel` 聊天结果通过 `dsh-go/media` 返回本机文件图片；原生查询面板使用 `asset:文件名` 由 App 带权限读取。两条显示通道分开处理，避免把面板资源引用用于无插件归属的聊天工具卡片。`/ww` 始终保留摘要，可在查询面板点「刷新结果」查看最近的图。
- HTML 面板在本机无头 Chromium 中截图后生成不超过 1 MiB、4096 像素边长及 400 万像素的原生图片。原来的 Web 卡片和配置页仍保留。
- 原生设置支持分组、分页、单项保存。敏感项不回显，使用系统文件选择器导入单项 UTF-8 文本；文件上传项也使用系统选择器。文件选择需要支持 files 能力的较新 App。
- Linux ARM64 + Python 3.12 已实测 8 个计算扩展加载、OCR 初始化与识别、39 个上游功能模块、帮助命令截图。账号数据查询和伤害结果仍需用户自行登录并配置相应 token。
- 安装准备改为异步、有超时、可取消；失败不启动服务，连续崩溃 5 次后停止重试。Python 默认复用受支持的系统版本。

手机安装本适配分支（保留克隆目录，它同时保存插件环境和运行数据）：

```sh
PLUGIN_DIR="${DSH_HOME:-$HOME/.dsh}/dsh-go/plugins/dsh-plugin-waves"
git clone --branch dsh-go --single-branch \
  https://github.com/Sophiacyl/dsh-plugin-waves.git "$PLUGIN_DIR"
dsh plugin --profile web add "link:$PLUGIN_DIR"
```

目录已存在时先检查现有安装，不要覆盖或删除。`$DSH_HOME` 未设置时默认为 `~/.dsh`。代码更新后可重载该插件；无需为素材下载重启整个引擎。首次启动会下载上游素材，健康接口的 `resources_ready` 独立报告准备状态。

宿主与原生协议回归（路径按本机安装调整）：

```sh
DSH_TEST_RUNTIME=/opt/dsh \
DSH_GO_KIT=$HOME/.dsh/skills/dsh-go-plugin/kit npm test
WAVES_AUTOSTART=0 node $HOME/.dsh/skills/dsh-go-plugin/kit/bin/check.mjs . --load
```

`WAVES_AUTOSTART=0` 仅用于隔离验证，防止检查器启动第二个后端。初次环境安装使用 `bash install.sh --env-only`；浏览器若缺系统库，需另执行 `service/.venv/bin/python -m playwright install-deps chromium`。本分支使用 `rapidocr` 3.x 和 headless OpenCV，避免旧 OCR 引入图形版 OpenCV。

## 用例

<table>
<tr>
<td nowrap valign="top">
<img src="./assets/demo-help.png" width="525" height="720" alt="帮助卡片">
<img src="./assets/demo-matrix-team.png" width="2000" height="1063" alt="矩阵配队建议">
<img src="./assets/demo-echo-swap.png" width="440" height="720" alt="声骸互换分析">
<img src="./assets/demo-echo-swap-result.png" width="488" height="720" alt="分析结论">
</td>
</tr>
</table>

## TODO

- [ ] 修修补补，完成迁移
- [ ] 补充游戏常识库：挑战规则、矩阵挑战的模板声骸配置、模态规则等（缺少尝试胡言乱语为已知问题，可以通过鼓励搜索解决，但不如固化常识知识）
- [ ] 补充库街区wiki文字攻略接口，注入常规配队知识
- [ ] 尝试寻找文字轴数据源
- [ ] 提供更多接口工具，便于在此之上自行搭建其他项目

本仓库仅迁移 XutheringWavesUID 内置方法和接口，以及处理通用知识，使用本插件数据接口继续开发应新建插件以实现功能解耦。

## 安装

上游已验证 DSH `0.1.0-rc.7`、`0.2.0-rc.2` 与 `0.2.1-rc.2`。本适配分支另通过了 DSH `0.2.2-rc.1` 的真实宿主库兼容测试（工具定义、参数校验、模拟服务调用与结果展示元数据），不代表 Python 后端和手机原生界面已完成验证。需要 Node.js 22.19+ 或 24.2+（DSH 0.2.1 在 24.0/24.1 上会静默退出）。DSH 0.2 支持斜杠命令携带图片和单个文件；旧版可继续执行无附件命令。

Linux / macOS：

```sh
mkdir -p ~/dsh-plugins && cd ~/dsh-plugins         # 放哪都行, 换成你自己的目录
git clone https://github.com/Loping151/dsh-plugin-waves.git && cd dsh-plugin-waves
dsh plugin --profile web add file:.
dsh web
```

Windows（PowerShell）：

```powershell
mkdir -Force ~\dsh-plugins; cd ~\dsh-plugins
git clone https://github.com/Loping151/dsh-plugin-waves.git; cd dsh-plugin-waves
dsh plugin --profile web add file:.
dsh web
```

第一次启动时插件会自己把环境装好（一般来说）：建虚拟环境、装依赖、拉取三个上游插件、生成数据目录，
几分钟后服务就绪，不需要手动跑任何脚本。之后在对话里绑定账号即可用：
`ww登录` 保存登录态，与库街区登录冲突，同时登录办法需自行查找，`ww绑定<特征码>` 需要自行提供有效库街区token才可使用，原理为：街区点击他人主页查看信息，故至少需要一个登录态。

安装若卡住或失败，直接问 dsh 里的模型——插件会把完整排障步骤转交给它。

缺什么会尽量自己装：`uv`、Python 3.10–3.13（`uv` 拉官方构建，计算内核按版本分发）、
以及 `git`（Linux 走发行版包管理器，Windows 走 winget/choco/scoop）。装不上会说明要手工补什么，也可以直接问 dsh 里的模型。

<details>
<summary>手动安装 / 从机器人部署迁入数据</summary>

```sh
./install.sh          # 等价于自动安装

# 从聊天机器人版迁过来: 指向那边 gsuid_core 的 data 目录,
# 会迁入绑定关系、登录态、WavesToken、面板与抽卡记录、自定义素材,
# 并把归属改写到本地使用者名下(源库只读取快照, 不会改动)
./install.sh --src ~/gsuid_core/data
```

Windows 用 `install.ps1`，参数一一对应（若提示无法运行脚本，先 `Set-ExecutionPolicy -Scope Process Bypass`）：

```powershell
powershell -ExecutionPolicy Bypass -File .\install.ps1
powershell -ExecutionPolicy Bypass -File .\install.ps1 -Src C:\gsuid_core\data
```

</details>

## 用法

两种用法：

- **`/ww 深塔`、`/ww 椿面板`**——斜杠命令，host 直接执行，**不经过模型**，最快。
- **直接说话**——「看下我的深塔」「椿的面板怎么样」，模型理解后调用工具。
  注意不带斜杠时哪怕原样打 `ww深塔` 也会先经过模型，慢一些但同样能用。

`ww帮助` 出全量命令图，本机的运维命令并在同一张图里。下表命令都可以放在 `/ww ` 后面用：

| 类别 | 常用 |
|---|---|
| 账号 | `ww查询` `ww体力` `ww探索` `ww库洛币` `ww积分` `ww日历` |
| 深渊 | `ww深塔` `ww海墟` `ww矩阵` `ww全息` |
| 面板 | `ww<角色>面板` `ww<角色>伤害` `ww<角色>优化` `ww<角色>权重` `ww刷新面板` |
| 排行 | `ww<角色>总排行` `ww练度总排行` `ww无尽总排行` `ww矩阵总排行` |
| 资料 | `ww<角色>攻略` `ww<角色>图鉴` `ww<角色>养成` `ww武器列表` `ww套装列表` |
| 唤取 | `ww抽卡记录` `ww导入抽卡链接` `ww抽卡登录` |
| 其它 | `ww签到` `ww兑换码` `ww声骸` `ww练度` `ww评分`（连声骸截图一起发）`ww公告` |
| 运维 | `ww更新插件` `ww重启服务` `ww服务状态` |

只有单人使用，没有用户身份概念：签到覆盖全部已登录账号、不筛活跃。
群成员管理、群排行、公告订阅、订阅签到结果、联系主人这类只在群聊里成立的命令不注册。
内置 HTTP 接口见 [docs/api.md](./docs/api.md)。

带截图的命令（`ww评分`、`ww分析`）可通过 `/ww 评分` 或 `/ww 分析` 携带图片直接执行，不经过模型。
普通聊天图片保持原始附件，不会被插件替换成提示文字，也不会改写模型能力。使用支持图片的模型时，
插件仅暂存当前输入的附件引用，在明确调用 `waves(with_image=true)` 时转交鸣潮服务；文本模型是否接收图片由宿主决定。
模型还可以用 `waves_panel` 工具按自定义数据（跨角色借声骸、手填词条）渲一张假设面板——
只在本地渲染，不写用户数据、不上传总排行。

图片卡（评分/面板等）会经本地轻量 OCR（RapidOCR）把文字抽进给模型的摘要，
纯文本模型也能读到卡上数值；设置里"图片文字摘要（OCR）"可关。

内置游戏知识库（`service/knowledge/`）：库洛 wiki 全站文本按小节整理（图鉴/攻略/百科等
5000+ 节，图片以原 URL 内嵌）+ 人工补充的机制常识（挑战周期、换期语义、配队细则）。
用户话里首次提到角色名/机制词时自动附带对应条目（每会话每条只注入一次），模型也可主动检索。
设置里"内置知识增强（测试）"可关掉自动注入，主动检索不受影响。

## Token

伤害计算、评分与排行都要 `WavesToken`，**评分与排行是同一个 token，只填一处**：
`service/data/XutheringWavesUID/config.json` 的 `WavesToken`。

token 的申请方式与使用条件与本体一致，请阅读：

- [XutheringWavesUID 本体仓库](https://github.com/Loping151/XutheringWavesUID)——申请入口与条件都在它的 README
- [0428 声明](https://github.com/Loping151/XutheringWavesUID/blob/main/assets/0428.md)——本插件相关的重要声明

没有 token 时查询类功能照常可用，适合单人使用。

## 更新

`service/plugins/` 是三个上游仓库的原样克隆，本地差异全部写在运行时里，所以上游更新不会冲突。
在对话里发 `ww更新插件`，完成后 `ww重启服务`；或者：

```sh
cd service && .venv/bin/python tools/update_plugins.py
```

默认从 GitHub 拉；连不上时自动改用 `cnb.cool/gscore-mirror`，反过来镜像不通也会切回 GitHub（已有仓库会把 origin 一并改掉）。
只有网络类错误才切源，仓库不存在、认证失败、无法快进这些会照原样报出来。

上游若用到了本运行时还没提供的接口，不会静默失败：更新命令会把缺失的模块和适配步骤
直接交给 dsh 里的模型，让它改好运行时再让你重启。

## 配置

| 文件 | 内容 |
|---|---|
| `service/data/config.json` | 服务自身：监听地址、命令前缀、日志、命令超时、缓存上限 |
| `service/data/XutheringWavesUID/config.json` | 查询与计算：token、代理、渲染、面板刷新 |
| `service/data/RoverSign/config.json` | 签到 |
| `service/data/ScoreEcho/config.json` | 识图评分 |

这些也可以在 dsh 侧栏的**插件 → 鸣潮**页里直接改，共 60 余项（只留下本地场景用得上的），敏感项显示为掩码。
数据目录首次运行自动生成，不需要预先准备。

## 结构

```
assets/          README 用例图
docs/            人读文档（内置 HTTP 接口）
lib/             dsh 侧：斜杠命令、模型工具、反代 /waves-api、托管服务、浏览器卡片
service/ai/      给模型读的数据/脚本指南
service/knowledge/ 内置游戏知识库（wiki 文本 + 人工补充，AI 检索与自动注入）
service/rover/   运行时：命令分发、数据库、配置、调度、渲染、接口
service/plugins/ 上游插件原样克隆（勿手改，改动请写进 hooks）
service/tools/   安装、迁移、更新与自检脚本
```

本地与上游的全部差异集中在 `service/rover/hooks.py`。

## 自检

宿主适配回归测试（不读取账号数据）：

```sh
npm test
```

```sh
cd service
.venv/bin/python tools/regression.py                    # 批量跑只读命令
.venv/bin/python tools/verify_actions.py                # 校验卡片点击与角色对应
.venv/bin/python tools/verify_card.py                   # 真实浏览器验证渲染与点击
.venv/bin/python tools/update_plugins.py --check-only    # 上游更新后的兼容性自检
```

## 许可

[GPL-3.0](./LICENSE)，与上游 [XutheringWavesUID](https://github.com/Loping151/XutheringWavesUID) 一致。
`service/plugins/` 安装时克隆的其它上游仓库遵循各自许可。使用前请阅读上游说明与声明。
