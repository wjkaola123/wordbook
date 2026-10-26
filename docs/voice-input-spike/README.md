# WB-1 语音识别可行性验证

这是独立、可丢弃的 MV3 验证扩展，不是 Wordbloom 的功能实现。没有后台脚本、词库读写、API Key 或额外 manifest 权限。两种入口共用相同探针脚本，直接测试浏览器提供的 `SpeechRecognition` / `webkitSpeechRecognition`。

## 当前结论（2026-10-24）

- 代码检查：Wordbloom 尚未实现语音输入；popup 和 full 共用新增单词逻辑，可以复用已有 `addWord` 消息与后台补全流程。
- 自动化环境：发现运行中的 Chrome，但 Windows Computer Use 无法可靠判定当前浏览器 URL，策略保护中止了 UI 操作。
- **真实浏览器可行性尚未确认**。本探针准备完成不代表授权、识别或资源释放已通过。
- 已通过 `node --check docs/voice-input-spike/probe.js` 和 `node --test docs/voice-input-spike/probe.test.cjs`（10 项模拟生命周期测试），覆盖取消与迟到回调、重复开始、超时、错误、页面销毁及迟到的麦克风授权结果。模拟测试不等于真实收音验证。
- 本探针使用独立扩展来源。即使通过，仍需在 Wordbloom 自身来源及实际 popup/full 页面复验，不能推断麦克风授权跨扩展共享。

## 运行

1. 在 Chrome 打开 `chrome://extensions`，或在 Edge 打开 `edge://extensions`。由你自行启用开发者模式并选择“加载已解压的扩展”。
2. 选择目录 `C:\project\wordbook\docs\voice-input-spike`，不是 Wordbloom 项目根目录。显示名称应为 **Wordbloom voice feasibility probe**。
3. 从浏览器扩展菜单点击该探针，打开真正的 action popup。不要把普通标签页当作 popup 测试。
4. 先点击 **Start recognition**，自行处理首次权限请求，说 `apple` 或 `non-deterministic`。如弹窗因授权而关闭，记录这一点；再打开，使用 **Open full-page probe** 测试完整页面。
5. 首先测试识别自身的授权流程；**Test microphone permission separately** 只用于诊断。它会请求真实麦克风并立即停止所有音轨，成功也不能证明识别服务可用。
6. 在 notes 中填写浏览器完整版本（Chrome 可在 `chrome://version` 查看）、操作系统、网络环境和麦克风指示器观察；从两种入口各导出 JSON。导出后 popup 可能关闭，请每个场景重新打开测试。

音频可能由浏览器送往其识别服务；只说测试用词。探针不录制或持久化音频，事件仅驻留页面内存。导出的 JSON 包含识别文字和手填 notes，导出前检查内容。关闭页面会丢失内存事件，因此应先导出；关闭后的资源释放需观察浏览器/系统麦克风指示器。

## 验证矩阵

所有“待测”均需要真实浏览器证据，不得用 API 构造成功或模拟回调代替。

| 场景 | popup | 完整页面 | 通过条件 |
| --- | --- | --- | --- |
| API 能力与环境 | 待测 | 待测 | 记录完整版本、来源、构造器是否存在；这只是能力检测 |
| 直接识别的首次授权 | 待测 | 待测 | 能处理请求并进入 listening；记录 popup 是否关闭 |
| 英文单词及短语 | 待测 | 待测 | `result` 有最终文字，随后有 `end`；成功后替换原文、不保存 |
| Stop and wait | 待测 | 待测 | stop 后最终结果仍能到达，随后 end，指示器停止 |
| Cancel / Esc | 待测 | 待测 | 保留 original text，有 end，迟到结果不覆盖原文 |
| 10 秒无语音 | 待测 | 待测 | 有明确无结果/错误反馈，原文保留，end 后可重试 |
| 拒绝麦克风 | 待测 | 待测 | 有错误或超时反馈、原文保留，手动输入可继续 |
| 网络/识别服务不可达 | 待测 | 待测 | 记录实际网络条件和错误；能恢复、无假成功 |
| 快速重复开始/停止 | 待测 | 待测 | 活跃期间 start 被禁用，没有重叠识别会话 |
| 关闭界面时正在识别 | 待测 | 待测 | 浏览器/系统麦克风指示器停止；重新打开可再次开始 |
| 完整页面授权后再测 popup | 待测 | 待测 | 记录实际授权行为，不预设共享成功 |

探针的请求/收音上限为 10 秒，停止或取消后最多等待 4 秒 `end`。如果没有收到 `end`，会保留原文并阻止新会话，要求关闭页面检查麦克风指示器；不能把这个保护状态当作资源释放成功。

## 决策门槛

- Chrome 和 Edge 分别记录结果；一个浏览器成功不代表另一个成功。
- 若完整页面成功但 popup 首次授权关闭，验证“完整页面完成授权 → popup 再次识别”是否稳定，再决定授权入口。
- 若构造器存在但持续服务错误，记录为服务不可用；独立 `getUserMedia` 成功不能改变这个结论。
- 只有目标环境的授权、最终文字、停止/取消、关闭释放与失败恢复有证据，才可推荐进入正式实现。之后仍须验证 Wordbloom 的朗读互斥、提交禁用和原文保护集成。
- 当前建议维持 `enhancement` / `needs-triage`，先收集上述结果。项目尚未提供 triage 角色到 Jira 标签的映射，未猜测并写入标签。

## 参考

- [MDN SpeechRecognition](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition)：支持有限；部分浏览器采用服务端识别，不能承诺离线。
- [Web Speech API 规范](https://webaudio.github.io/web-speech-api/#speechreco-section)：`stop`、`abort` 与识别事件定义。
