# dsh-go 适配验证记录

验证日期：2026-11-09 至 2026-11-10（Asia/Shanghai）。

## 来源与安装

- 上游：Loping151/dsh-plugin-waves。
- 起点：main，c371a8782969160b0dfc217c27476a5de747c3bd，版本 0.0.3。
- 工作副本：/root/workspace/dsh-plugin-waves。
- 持久安装：/root/.dsh/dsh-go/plugins/dsh-plugin-waves。
- 通过正式 CLI 安装到 web profile；Loader 条目 include:waves-plugin 已启用，管理器返回 application: applied。
- 仅重载鸣潮插件，未重启整个引擎。
- 上游依赖提交：XutheringWavesUID 622eb62、RoverSign ede8788、ScoreEcho e4fa90d；保留 .git 以支持更新。

## 已解决

1. DSH engines 和四项 peerDependencies 明确加入 0.2.2-rc.1，没有宽泛放开所有预发布版本。
2. 首次安装由同步阻塞改为异步、15 分钟超时、可取消；现有虚拟环境须通过真实依赖导入检查，安装失败不启动后端。
3. 服务连续短时失败 5 次后停止重试，监听 spawn error；健康检查明确报告插件加载错误与独立的资源准备状态。
4. Linux 安装优先使用受支持的系统 Python，避免手机默认另下 3.13；解析 pyproject 正式依赖列表，不将 TOML 错当 requirements。
5. 旧 rapidocr-onnxruntime 强制引入图形版 OpenCV，实测因缺 libxcb 无法加载。改用 RapidOCR 3.x、headless OpenCV、ONNX CPU 单线程。
6. 声明并安装 Playwright/ARM64 Chromium Headless Shell，补足截图依赖；原生图片限制在 1 MiB 以下、4096 像素边长以内、400 万像素以内。
7. 图片显示分成两条通道：原生面板使用 asset:文件名；聊天工具结果使用 dsh-go/media v1 的本机图片文件元数据。无可用图片时只返回文字视图，不产生破图占位。保留 Web segments 元数据；/ww 返回可读摘要。
8. 原生提供鸣潮胶囊、查询面板、分组分页设置和单项编辑。敏感项不回显，通过系统文件选择器导入单项文本；上传项通过文件选择器导入。
9. 克隆失败/插件缺失不再由更新脚本报告成功。下载批次计数重置并限制 4 并发，避免累计字节阈值导致逐文件串行。

## 验证结果

- Node 24.22.1，DSH 0.2.2-rc.1，Linux aarch64，Python 3.12.15。
- 28/28 Node 回归测试通过，包含真实 DSH 库、异步安装与取消、原生面板、聊天文件媒体元数据、缺失/损坏/过大图片回退、越界路径和符号链接拦截、嵌套图片尺寸，以及普通聊天附件保持原样。
- 官方 dsh-go 检查器 --load：通过，3 个面板、1 个胶囊、2 个工具，清单无错误；配色自动校正提示为正常信息。
- 真实后端 39 个上游功能模块成功加载；健康检查 667 个触发器、load_errors=[]。
- 8 个 Linux ARM64 cp312 计算扩展通过 ELF Machine=AArch64 和动态导入验证；最终安装目录 calculate/wuwacalc/damage/safety/score 再次导入通过。
- RapidOCR 初始化和空白图推理通过，CPU 执行。ONNX 扫描不可访问 GPU sysfs 的警告不影响本次 CPU 验证。
- 真实 ww体力：空账号明确返回需要登录。
- 真实 ww帮助：HTML 截图、压缩和原生图片链路通过，图片已查看；最终已安装工具 waves 的 ww帮助 调用通过。
- 从真实后端读取的全部 66 项配置，其原生编辑视图均通过解析检查；image_ocr 保存原值的写入链路通过。
- 最终安装环境 pip check 无依赖冲突，全部自有 Python 源码解析通过，git diff --check 通过。
- 首次素材准备最终 resources_ready=true、resource_error=null。

## 验证边界

- 初次环境测试未使用账号。后续用户自行在登录页完成登录，已验证体力与练度查询；未代填密码/验证码、未执行签到、未提交真实 WavesToken。发布记录不包含账号身份、UID、凭据或私人结果图片。
- 伤害内核已验证平台和加载，未用真实账号验证伤害数值、排行、抽卡等业务结果。
- 曾由用户截图证实聊天工具卡片破图，不能把早期文件/解析器测试算作视觉验收。随后改为 dsh-go/media 文件媒体卡片；代码与协议检查通过，最终 App 内新卡片显示仍待用户确认。
- 2026-11-10 的普通聊天图片实测已直接传入模型，未再出现插件生成的图片替代文字；历史已替换的消息不会自动恢复。
- 原生端使用图片和命令表单，不保留 Web HTML 卡片内部的可点击角色热点；可在面板输入角色命令继续查询。
- 手机操控工具禁止读取 DSH 自身界面，因此未宣称完成 App 视觉点按测试。验证覆盖清单、官方解析器、面板处理逻辑、真实后端和最终安装激活。
- Windows 安装流程未在本次 Linux ARM64 手机适配中验证。

## 使用入口

- 输入框上方「鸣潮」胶囊 → 查询面板。
- 全部功能 → 鸣潮查询 / 鸣潮设置。
- 对话命令：/ww 帮助、/ww 查询、/ww 椿面板。
- /ww 结果图：查询面板 → 刷新结果。
- 初次账号绑定由用户自行执行 ww登录。
