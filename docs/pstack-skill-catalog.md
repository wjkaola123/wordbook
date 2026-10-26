# pstack 0.2.2 技能目录研究

本报告是安装包的静态研究，没有运行其中的开发、提交、PR、发布或模型配置工作流。研究日期为 2026-10-22。已读取全部 28 个非 principle 技能入口和共享运行时契约。安装目录还包含 23 个 principle 叶子技能，本报告不逐项解释这些原则。

## 入口与执行机制

`poteto-mode` 是总路由。它先按任务选择 playbook，再按情境调用 `how`、`architect`、`interrogate`、验证等技能。`figure-it-out` 是为大型、跨领域或现成 playbook 无法覆盖的任务设计一次专用流程。真正的长期项目协调属于 `poteto-mode/playbooks/orchestrate.md`，它不是独立名为 `orchestrate` 的技能。

源码：[poteto-mode](C:/Users/wjkao/.codex/plugins/cache/pstack/pstack/0.2.2/skills/poteto-mode/SKILL.md)、[figure-it-out](C:/Users/wjkao/.codex/plugins/cache/pstack/pstack/0.2.2/skills/figure-it-out/SKILL.md)。

文档中的 `/skill-name` 表示查找并读取技能，不等于存在对应的 shell 命令。宿主有原生技能调用时使用原生机制，否则按安装路径读取。安装 pstack 和执行 setup 不会自动注册持久宿主规则。

源码：[运行时契约](C:/Users/wjkao/.codex/plugins/cache/pstack/pstack/0.2.2/skills/setup-pstack/references/pstack-runtime.md)、[setup-pstack](C:/Users/wjkao/.codex/plugins/cache/pstack/pstack/0.2.2/skills/setup-pstack/SKILL.md)。

## 编排与设计

| 技能与源码 | 用途、常见触发 | 前置条件与输出 |
|---|---|---|
| [poteto-mode](C:/Users/wjkao/.codex/plugins/cache/pstack/pstack/0.2.2/skills/poteto-mode/SKILL.md) | `/poteto-mode`、按这种风格完成任务。按任务路由到 playbook，贯穿调查、设计、实现、验证、交付。 | 读取匹配的 playbook 和适用的 principle。输出随 playbook，不能把安装等同于后台常驻或跨会话模式。 |
| [figure-it-out](C:/Users/wjkao/.codex/plugins/cache/pstack/pstack/0.2.2/skills/figure-it-out/SKILL.md) | `/figure-it-out`、大型迁移、复杂多步骤、交给 AI 后再回来审阅的任务。 | 先写可证伪的完成条件、范围和严谨程度，再写工作流。先验证基线，再按单元实验，记录 TSV，最终检查真实产品。输出专用流程、决策日志、验证结论和未决项。 |
| [architect](C:/Users/wjkao/.codex/plugins/cache/pstack/pstack/0.2.2/skills/architect/SKILL.md) | `/architect`、设计接口和模块、非平凡代码的结构决策。 | 非绿地先 `how`，改所有权或层次时补 `why`。借助 `arena` 至少比较两个结构不同的方案。输出从调用方式推导的类型和签名草图、模块图、rationale，默认继续实现；用户显式要求 checkpoint 时才暂停。 |
| [arena](C:/Users/wjkao/.codex/plugins/cache/pstack/pstack/0.2.2/skills/arena/SKILL.md) | `/arena`、同一任务多候选比较、设计或代码方案竞争。 | 同一任务，3 至 6 项具体评分标准，独立输出路径，至少两个独立上下文，受宿主并发数约束。候选完成后才交叉评审，父代理通读所有结果，选基底并手工吸收优点。输出合成产物和包含取舍、退出候选、验证结果的合成说明。 |
| [swarm](C:/Users/wjkao/.codex/plugins/cache/pstack/pstack/0.2.2/skills/swarm/SKILL.md) | `/swarm`、分区调查、覆盖矩阵、竞赛、探索。 | 明确完成条件和 partition/race/mixed 形态。竞赛预先规定 first pass、rank all 或 best-of。每个写者独占输出。输出一个汇总报告、结果表、问题证据、覆盖缺口。它不执行 arena 的基底选择与嫁接过程。 |

## 理解、证据与审阅

| 技能与源码 | 用途、常见触发 | 前置条件与输出 |
|---|---|---|
| [how](C:/Users/wjkao/.codex/plugins/cache/pstack/pstack/0.2.2/skills/how/SKILL.md) | “如何工作”、改动前代码理解、层次与所有权问题。 | 简单范围由一个 explainer 调查并解释；复杂范围分 2 至 4 个 explorer 再交 explainer。输出概览、概念、运行路径、位置、陷阱，按需省略。 |
| [why](C:/Users/wjkao/.codex/plugins/cache/pstack/pstack/0.2.2/skills/why/SKILL.md) | 设计动机、历史原因、回归、阈值来源、复盘。 | 先锚定代码、符号、commit 与 PR，再发现实际可用证据源。七类证据是源码历史、issue、长文档、聊天、基础设施观测、异常追踪、产品分析仓库。缺源必须报告。输出事实、合理推断、竞争解释、未知项、来源覆盖与置信度；必要时形成 Preserve/Change/Avoid/Risk 约束。 |
| [teach](C:/Users/wjkao/.codex/plugins/cache/pstack/pstack/0.2.2/skills/teach/SKILL.md) | “教我理解这个系统”、解释改动。 | 组合 `how` 与 `why`，通常并行。小问题允许只做一个，保留 why 的置信度语言。输出贴合用户问题的解释和必要图示，不修改产品。 |
| [blast-radius](C:/Users/wjkao/.codex/plugins/cache/pstack/pstack/0.2.2/skills/blast-radius/SKILL.md) | “会影响哪里”、小 diff 的隐藏风险、合入前影响面。 | 追踪 diff 外的运行时、协议、依赖固定版本及下游。找出安全性赖以成立的一两个事实，尽量运行真实代码证明。输出改动说明、关键安全事实、已证实风险、排除项、合入前最便宜的检查；无法执行的事实明确标未证明。 |
| [interrogate](C:/Users/wjkao/.codex/plugins/cache/pstack/pstack/0.2.2/skills/interrogate/SKILL.md) | `/interrogate`、对抗审查、找盲点、挑战方案。 | 明确目标意图，打包 diff 与上下文，默认四个只读 reviewer 使用相同提示和 rubric；配置列表可变更人数。输出 Act on/Consider/Noted/Dismissed、来源 reviewer 和一致性图。它只给综合裁决，不自动应用改动。 |
| [recall](C:/Users/wjkao/.codex/plugins/cache/pstack/pstack/0.2.2/skills/recall/SKILL.md) | “我做到哪了”、恢复近期工作上下文。 | 默认当前项目最近七天，只读当前对话或显式授权的项目 transcript。具名目标可借 why 查共享记录，必须对照 live Git/PR 状态。输出至多五点 capsule、各线程状态、问题、一个 next move、证据缺口。单次会话接续改走 session-pickup playbook。 |

## 验证与质量检查

| 技能与源码 | 用途、常见触发 | 前置条件与输出 |
|---|---|---|
| [create-verification-skill](C:/Users/wjkao/.codex/plugins/cache/pstack/pstack/0.2.2/skills/create-verification-skill/SKILL.md) | `/create-verification-skill`、项目缺少真实 UI/CLI/API 驱动与证据流程。 | 从仓库调查 launch、drive、observe、isolate，不能对着坏基线编写。生成 `.agents/skills/verify-<app>/SKILL.md`，含 Launch/Doctor/Drive/Evidence/Cleanup/Helpers，另有 features README 及初始 3 至 5 个功能文件。必须亲自完整运行一次生成流程，驱动一个功能并确认清理后证据仍在。未执行只是草稿。 |
| [maintain-verification-skill](C:/Users/wjkao/.codex/plugins/cache/pstack/pstack/0.2.2/skills/maintain-verification-skill/SKILL.md) | `/maintain-verification-skill`、审计现有验证技能与功能地图。 | 必须已有带 feature map 的验证技能。每功能只读源码调查，协调者统一 live drive，所有功能都要覆盖。只编辑验证技能目录，产品回归另报。结果 clean/changed/blocked；有修订时最多一个证明过的 PR。 |
| [control-cli](C:/Users/wjkao/.codex/plugins/cache/pstack/pstack/0.2.2/skills/control-cli/SKILL.md) | CLI/TUI 真机验证。 | 优先项目验证技能与现有 harness，需要 shell，交互渲染需要 PTY。驱动公开 CLI，检查输入、退出码、输出、持久状态。输出可复现命令与证据，清理自己启动的进程。没有 PTY 不能宣称终端交互或渲染已验证。 |
| [control-ui](C:/Users/wjkao/.codex/plugins/cache/pstack/pstack/0.2.2/skills/control-ui/SKILL.md) | 浏览器、桌面或移动 UI 的真实运行证明。 | 实际浏览器/应用控制工具或现有测试 harness，优先项目验证技能。像用户操作，观察状态与副作用，截图后人工检查。缺能力明确报告 scenario 未验证；源码阅读、编译和单测不替代 live UI gate。 |
| [tdd](C:/Users/wjkao/.codex/plugins/cache/pstack/pstack/0.2.2/skills/tdd/SKILL.md) | 用户显式要求 TDD/回归测试，或 bug 有明显便宜的本地测试点。 | 失败测试先于产品修复，确认因正确原因失败，修复后通过，再运行邻近检查。没有合理测试点不强行搭建大 harness；先说明理由，再给最接近的可执行检查。输出 failing-before/passing-after 证据。 |
| [deslop](C:/Users/wjkao/.codex/plugins/cache/pstack/pstack/0.2.2/skills/deslop/SKILL.md) | `/deslop`、提交前清理。 | 仅作用指定 diff 与附近代码，保留契约和无关工作。去掉无价值抽象、冗余状态、重复内部校验等；怀疑 workaround 时先追因。复跑受影响检查，不自行 commit/PR；review-only 只报问题。 |
| [no-comments](C:/Users/wjkao/.codex/plugins/cache/pstack/pstack/0.2.2/skills/no-comments/SKILL.md) | `/no-comments`、审阅前注释检查。 | 使用 Comment Sicko 角色，父代理复核与修复，遵守作用域及约束注释例外。复杂 root-cause 修复先 architect 草图。输出删除数、恢复、重跑、修复、约束编码建议及未决项。宿主角色适配见下文。 |
| [typescript-best-practices](C:/Users/wjkao/.codex/plugins/cache/pstack/pstack/0.2.2/skills/typescript-best-practices/SKILL.md) | 阅读或编辑 `.ts`/`.tsx`。 | 先读 type-system-discipline 原则，使用可辨识联合、边界验证、schema 推导、合理窄化。输出是应用这些约束后的代码或审阅，不是独立项目流程。 |

## 持续改进与工作产物

| 技能与源码 | 用途、常见触发 | 前置条件与输出 |
|---|---|---|
| [setup-pstack](C:/Users/wjkao/.codex/plugins/cache/pstack/pstack/0.2.2/skills/setup-pstack/SKILL.md) | 初始化、配置角色模型、budget。 | 读用户配置再读项目配置，version 必须为 1。项目角色覆盖用户角色。无偏好保留空 roles，全继承父模型。真实模型必须宿主明确支持，原子保存并保留未知字段。输出配置路径、变动、能力限制。 |
| [show-me-your-work](C:/Users/wjkao/.codex/plugins/cache/pstack/pstack/0.2.2/skills/show-me-your-work/SKILL.md) | 长任务、自主循环、多阶段、用户稍后审阅。 | 单一 append-only TSV，列为 ts/phase/decision/why/evidence/result，默认本地；重要审计可提交。最终对照实际执行审计，再独立审查日志；输出日志路径与 Attention，诚实披露证据/独立性不足。 |
| [reflect](C:/Users/wjkao/.codex/plugins/cache/pstack/pstack/0.2.2/skills/reflect/SKILL.md) | 用户说 reflect。 | 从当前对话或授权 transcript 抽取可持续经验，用 judgment/tooling/divergent 三个视角，fresh synthesizer 检查目标技能。输出 Accepted/Rejected/Backlog 和可审阅措辞或草稿。仅 reflection 不自动持久采用；用户已要求应用才实施。不能改安装缓存作为持久来源。 |
| [create-skill](C:/Users/wjkao/.codex/plugins/cache/pstack/pstack/0.2.2/skills/create-skill/SKILL.md) | 编写或修改技能。 | 先读已有技能与调用者，优先修订。项目默认 `.agents/skills/<skill>/`，有效 YAML、名称与资源链接。验证结构、脚本、实际代表任务。release-managed 分发应修 source port 并重建，或创建另名项目技能。 |
| [automate-me](C:/Users/wjkao/.codex/plugins/cache/pstack/pstack/0.2.2/skills/automate-me/SKILL.md) | “捕捉我的工作风格”、更新个人 mode。 | 从明确偏好、例子及可选授权历史归纳，不把偶发请求变永久授权。默认生成 `.agents/skills/<handle>-mode/SKILL.md`，引用可用技能、按需验证。输出个人模式，区分直接偏好和推断，不自动应用所有未来会话。 |
| [make-bot-ui](C:/Users/wjkao/.codex/plugins/cache/pstack/pstack/0.2.2/skills/make-bot-ui/SKILL.md) | 现有 webhook 的本地控制页面、按钮。 | 需要接收端合同与授权，凭据只放服务端。无 receiver 可运行本地 mock 并标明未配置外部连接。实现 loopback 页面和转发服务，验证成功/无效/失败/缺凭据；输出 URL、启动停止命令、配置位置与实际验证。它不提供 bot 服务或调度器。 |

## 表达辅助

| 技能与源码 | 用途、常见触发 | 前置条件与输出 |
|---|---|---|
| [technical-writing](C:/Users/wjkao/.codex/plugins/cache/pstack/pstack/0.2.2/skills/technical-writing/SKILL.md) | 文档、RFC、README、PR 描述、提交信息。 | 按 tutorial/how-to/reference/explanation 定位，应用 Google/STE/Global English 风格，真实符号与路径，配合 unslop。输出便于读者理解的文档或修改建议。 |
| [unslop](C:/Users/wjkao/.codex/plugins/cache/pstack/pstack/0.2.2/skills/unslop/SKILL.md) | 任何 prose surface，技能写明始终适用。 | 扫描、重写、自审 AI 语言模式。保留意义和语气，输出干净文本，不增加事实。 |
| [bro](C:/Users/wjkao/.codex/plugins/cache/pstack/pstack/0.2.2/skills/bro/SKILL.md) | 上一条回答有行话、不够简明。 | 以上一条回答为输入，输出同一内容的简短人话版。 |

## E2E 组装的关键约束

以下是运行时契约的共同约束，不能从技能文字推断宿主已经提供能力。

1. 模型配置只给角色选择模型。`inherit-parent` 和 `auto` 表示不传 model override。努力程度与模型、执行位置是独立能力，不能把 `high`、`xhigh` 拼入模型名。该 schema 没有定义按角色保存 reasoning effort 的字段。
2. 原生多代理缺失时可按独立视角串行执行，但必须披露不具独立代理性。相同模型的多个上下文不构成跨模型多样性。要求独立证明的 shipping gate 缺失能力时必须 blocked。
3. 并发写入必须隔离文件或 worktree。worker 的 brief 包含目标、独占范围、验收条件、资源路径、报告格式。reviewer 和 synthesizer 只读，不提交、不发消息、不修改外部系统。
4. 技能本身不建立调度、后台 watcher、跨会话 hook 或关闭宿主后的继续执行。需要宿主调度器且在授权内；否则 checkpoint 到 `.pstack/state/<task>/` 并写恢复步骤，不能宣称会自动醒来。
5. transcript 仅当前对话、用户/宿主提供路径、配置且项目边界匹配的路径。不能猜私人历史目录。
6. 工具可用不等于远端发布、合并、发消息或部署已有授权。按用户请求边界执行。

共同源码：[运行时契约](C:/Users/wjkao/.codex/plugins/cache/pstack/pstack/0.2.2/skills/setup-pstack/references/pstack-runtime.md)。

`no-comments` 的步骤请求原生 `role: comment-sicko`，但该安装包顶层没有 `agents/` 目录，本次也没有发现角色注册。存在 [comment-sicko 提示文件](C:/Users/wjkao/.codex/plugins/cache/pstack/pstack/0.2.2/skills/poteto-mode/references/comment-sicko.md) 和 [poteto-agent 提示文件](C:/Users/wjkao/.codex/plugins/cache/pstack/pstack/0.2.2/skills/poteto-mode/references/poteto-agent.md)。宿主若只有通用 subagent，需要把已读提示与只读边界放入原生 brief，不能虚构 native role 已安装。这是从文件布局与技能内容得出的适配判断，尚未执行验证。

## 默认工作流建议

一次建立项目验证能力后，通常不必手动依次触发全部 51 项技能。用 `poteto-mode` 选择匹配的 playbook，让它调用需要的技能。大任务或尚不明确的任务走 `figure-it-out`。对具体变更按需要组合 `how → architect/arena → implement → real verifier → deslop/no-comments → interrogate → PR/CI → independent shipping gate`。PR 交付、合并和部署应写清授权范围；不需要发布的任务到本地产物与验证证据即可结束。

建议来源：[poteto-mode](C:/Users/wjkao/.codex/plugins/cache/pstack/pstack/0.2.2/skills/poteto-mode/SKILL.md)、[figure-it-out](C:/Users/wjkao/.codex/plugins/cache/pstack/pstack/0.2.2/skills/figure-it-out/SKILL.md)、[create-verification-skill](C:/Users/wjkao/.codex/plugins/cache/pstack/pstack/0.2.2/skills/create-verification-skill/SKILL.md)。这里的顺序是研究建议，不是宣称每个 playbook 都强制以完全相同顺序执行。
