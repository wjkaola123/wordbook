# Wordbloom 竞品调研

调研日期：2026-10-24。范围：浏览器查词、生词收藏与复习产品。依据当前项目源码、产品官网、官方帮助文档和 Chrome Web Store（下称 CWS）；未安装竞品做实机测试。功能描述代表官方公开能力，不等同于体验评测。

## 结论

**最值得重点研究的是 Rememberry、Readlang、Relingo、欧路翻译/欧路词典和 eJOY。** 它们与 Wordbloom 的“阅读时查词 → 收藏 → 复习”链路直接重合。Rememberry 的功能结构最接近；Readlang 强在阅读到间隔复习的闭环；Relingo 强在后续阅读中反复遇见生词；欧路覆盖中文用户的词典与生词本生态；eJOY 展示了规模更大的多内容、多端学习生态。

Mate Translate、Definer 更适合对标查词入口和交互。沉浸式翻译与 Language Reactor 分别占据网页阅读、视频学习入口，属于相邻赛道的重要替代品。Dictionariez 体量较小，适合参考 Anki 互通和开放词典设计，不列为大众热门产品。

## 当前项目基线

按本次读取的代码，Wordbloom 是偏英语学习、面向中文释义的 Chrome MV3 扩展：

- 网页划词翻译、右键收藏，保存网页来源，重复收藏时累加次数并更新最近来源：`content.js`、`background.js` 的 `saveWord`。
- 自动补全释义、词性、音标和例句，字典数据不足时尝试生成例句；有英美发音及例句朗读：`background.js`、`popup.js`、`full.js`。
- 弹窗词库、检索与编辑、全页列表和翻面卡片：`popup.*`、`full.*`。
- 语音录入、JSON 导入导出、Chrome storage 同步：`voice-input.js`、`settings.*`、`background.js`。
- 当前卡片是手动翻面阅读；本次源码检查未发现按记忆反馈安排下一次复习的 SRS 调度。Chrome 同步实现有约 100KB 总容量限制，并非独立的手机端学习账户体系。

因此，比较重点应是“个人生词学习闭环”，而不仅是翻译准确度或是否支持整页翻译。保存网页链接也不等于已经保存原句上下文。

## 热度与相似度

下列数字为本次可读取的 CWS 页面快照。`users` 是商店展示的用户数，不应当解释为月活、累计下载量、付费用户数或全平台用户数；评分人数通常被商店取整。页面缓存日期不同，不能据此计算增长率或市场份额。

| 产品 | CWS 用户规模 | 评分 / 评分数 | 与 Wordbloom 的关系 | 官方来源 |
| --- | --- | --- | --- | --- |
| Rememberry | 10 万 | 4.6 / 约 1 千 | 最直接：网页查词、制卡、间隔复习 | [CWS](https://chromewebstore.google.com/detail/rememberry-translate-and/dipiagiiohfljcicegpgffpbnjmgjcnf?hl=en) |
| Readlang Web Reader | 10 万 | 4.3 / 221 | 直接：阅读翻译、词库、SRS | [CWS](https://chromewebstore.google.com/detail/readlang-web-reader/odpdkefpnfejbfnmdilmfhephfffmfoh) |
| Relingo | 数万级 | 4.6 / 约 1 千 | 直接：生词提取、阅读中再遇、记忆 | [CWS](https://chromewebstore.google.com/detail/relingo-master-vocabulary/dpphkcfmnbkdpmgneljgdhfnccnhmfig) |
| eJOY AI Dictionary | 70 万 | 4.1 / 约 5 千 | 直接：查词、收藏、复习，多端生态更大 | [CWS](https://chromewebstore.google.com/detail/ejoy-ai-dictionary/amfojhdiedpdnlijjbhjnhokbnohfdfb) |
| 欧路翻译 / 欧路词典 | 扩展 7 万 | 3.8 / 204 | 直接：网页查词、生词本与手机端学习记录 | [CWS](https://chromewebstore.google.com/detail/欧路翻译-沉浸网页划词翻译工具/djbfechcnkppbknmlhfcaoifgnicolin) |
| Mate Translate | 40 万 | 3.4 / 约 6.6 千 | 查词和词句收藏直接重合，偏翻译工具 | [CWS](https://chromewebstore.google.com/detail/mate-translate-%E2%80%93-translat/ihmgiclibbndffejedjimfjmfoabpcke) |
| Definer | 5 万 | 4.7 / 406 | 查词入口竞品，多词典与可配置弹窗 | [CWS](https://chromewebstore.google.com/detail/definer-word-translator-a/noagjioaihamoljcbelhdlldnmlgnkon) |
| 沉浸式翻译 | 300 万 | 不作横向评分比较 | 间接：占据外语网页阅读入口 | [CWS](https://chromewebstore.google.com/detail/immersive-translate-ai-we/bpoadfkcbjbfhfodiogcnhhhpibjhbnh?pubDate=20251018) |
| Language Reactor | 200 万 | 4.2 / 约 4.3 千 | 间接：视频字幕查词和学习 | [CWS](https://chromewebstore.google.com/detail/language-reactor/hoombieeljmmljlkjmnheibnpciblicm?hl=en) |
| Dictionariez | 6 千 | 4.8 / 60 | 小众参考：词典聚合和 Anki | [CWS](https://chromewebstore.google.com/detail/dictionariez-your-diction/diojcfpekhhnndfmggknljpnfpcccbhc?hl=en-GB) |

口径差异：Relingo 本次读取的默认商店页显示 4 万用户，另一语言版本的较旧缓存显示 6 万，故只标“数万级”，不能据此判断用户流失。沉浸式翻译可读取快照约为 2026 年 9 月，Language Reactor 约为 2026 年 7 月；这些是本次可核验的公开量级，非实时仪表盘。Mate 搜索索引出现 4.3、打开正文出现 3.4，Definer 旧缓存出现 3 万而本次正文为 5 万；表格使用本次打开正文值，评分不作精确排名。eJOY 官网宣传的全平台用户数与 70 万 Chrome 用户口径不同，此处统一采用商店值。欧路的 7 万仅为扩展规模，不能代表整个欧路词典生态。

## 重点产品与可借鉴能力

### 1. Rememberry：首要功能对标

网页划词即可收藏为卡片；支持释义、词性、音标、例句、发音和词组。其学习层包括间隔复习、手动复习、文字/听力/打字练习、网页内已收藏词高亮、提醒与跨端同步，覆盖 Wordbloom 当前功能并向“真正记住”延伸。[官方商店](https://chromewebstore.google.com/detail/rememberry-translate-and/dipiagiiohfljcicegpgffpbnjmgjcnf?hl=en)、[官方功能介绍](https://www.rememberry.in/chrome)

商业模式：Basic 免费但查词、卡片与复习等有限额；Ext Lite 解锁扩展无限使用及侧边栏；Pro 增加应用、跨端同步、云备份等。官网价格在本次可读取页面中动态加载，未获得可靠金额，因此不填价格。[官方定价](https://www.rememberry.in/pricing)

对 Wordbloom 的启发：优先研究如何从翻面卡片升级到有到期队列、有反馈的短时复习，以及在真实阅读中再次提示已收藏词。

### 2. Readlang：阅读到复习的清晰闭环

网页点击翻译、自动积累词汇，再通过间隔重复闪卡练习；提供词汇导出用于 Anki，以及 AI 上下文解释。它适合对标轻量的外语阅读体验，而非复杂的课程平台。[官方功能](https://readlang.com/features)、[官方商店](https://chromewebstore.google.com/detail/readlang-web-reader/odpdkefpnfejbfnmdilmfhephfffmfoh)

商业模式：免费层包括无限单词翻译与闪卡练习，每日词组翻译及上下文解释各有 10 次额度；Premium 为 6 美元/月或 48 美元/年；Plus 为 15 美元/月或 120 美元/年。金额为本次官方页面列示，年付总额与按月订阅应区分。[官方定价](https://readlang.com/pricing)

对 Wordbloom 的启发：用少量必要动作打通阅读、收藏和每日复习；提供 Anki/CSV 互通，降低用户迁移成本。

### 3. Relingo：在日常浏览里复习

围绕阅读难度提取或标注生词，收藏词在后续阅读中再次出现时可被提示，同时提供闪卡、邮件等记忆方式；也覆盖 YouTube、Netflix、TED、Coursera 等视频内容的双语字幕。它与 Wordbloom 的差异主要在“浏览过程本身就是复习场景”。[官网](https://relingo.net/en)、[官方商店](https://chromewebstore.google.com/detail/relingo-master-vocabulary/dpphkcfmnbkdpmgneljgdhfnccnhmfig)

本次未核验其现行付费额度与价格，不将官网列出的全部能力默认视为免费。

对 Wordbloom 的启发：利用已有单词与出现次数数据，探索已收藏词再遇提示；自动难度识别则属于更大的后续投入。

### 4. eJOY：多内容、多端的成熟学习生态

网页、视频和 PDF 查词收藏，提供词义、搭配、例句、发音及视频语境；通过 10 多种练习、间隔重复和学习进度记录组织复习，浏览器、手机和网页端协同。另有 AI 解释、摘要与写作辅助，功能范围明显大于当前项目。[官方商店](https://chromewebstore.google.com/detail/ejoy-ai-dictionary/amfojhdiedpdnlijjbhjnhokbnohfdfb)

商业模式：免费 Basic，以及 Pro Dict、Pro Voca、Pro Plus 等套餐；官网将跨场景保存、复习和学习数据同步列入 Pro Voca 的重点能力。帮助中心与定价页的部分额度表述存在差异，本报告不固定免费可存词数和 AI 配额。[官网套餐说明](https://ejoy-english.com/en)、[官方价格与套餐表](https://ejoy-english.com/en/plans?medium_h=footer&source_h=homepage)

对 Wordbloom 的启发：参考真实语境和学习反馈即可，不必立即复制视频、课程和 AI 助手整套生态。

### 5. Mate Translate 与 Definer：查词入口对标

**Mate Translate** 提供网页选词、词句翻译、发音与音标、整页/PDF/Netflix 翻译、个人词句本、跨设备同步及 CSV 导出。其官方公开资料更突出翻译和词句管理，本次未核验出与 Rememberry 相同的 SRS 学习调度。免费安装，商店标明应用内购买；具体高级功能门槛未核实。[官网](https://matetranslate.com/en/chrome)、[官方商店](https://chromewebstore.google.com/detail/mate-translate-%E2%80%93-translat/ihmgiclibbndffejedjimfjmfoabpcke)

**Definer** 的优势是多来源查词、可配置触发方式与弹窗、音标发音、内置 PDF 阅读器和 AI 来源；设置同步不能直接当作生词与学习进度同步。本次未核验到完整生词复习闭环。商店标明应用内购买，但未取得可靠的现行套餐划分。[开发者说明](https://github.com/lumetrium/definer)、[官方商店](https://chromewebstore.google.com/detail/definer-word-translator-a/noagjioaihamoljcbelhdlldnmlgnkon)

对 Wordbloom 的启发：关注弹窗是否遮挡、触发是否误打扰、站点禁用与快捷键、不同词典失败时的可理解反馈。只用“更方便的划词翻译”作为定位，差异空间有限——这是基于功能重合的判断，并非用户访谈结论。

### 欧路翻译 / 欧路词典：中文用户的重要直接竞品

扩展提供网页划词、AI 上下文解释、生词高亮、字幕/PDF 等场景，并与欧路词典客户端同步学习记录。官方插件介绍列出“生词本和背单词”，更新记录说明通过浏览器采集语境及手机端同步。它的竞争力在于现有词典、词库和手机学习习惯形成的生态，而非仅扩展本身。此次未核验现行价格，不默认所有能力免费。[官方商店](https://chromewebstore.google.com/detail/欧路翻译-沉浸网页划词翻译工具/djbfechcnkppbknmlhfcaoifgnicolin)、[官方插件介绍](https://ftp.eudic.net/v4/en/app/plugins)、[官方更新记录](https://de.eudic.net/v4/en/app/history?appkey=eusoft_eudic_en)

对 Wordbloom 的启发：优先实测中文释义、原句采集和移动端复习衔接；不能只比较“是否有生词本”。

### 6. 相邻赛道与小众参考

- **沉浸式翻译**：双语网页、PDF/EPUB、视频字幕与划词翻译/发音覆盖大量阅读场景。它竞争的是外语内容入口；此次资料不足以将其视为完整生词 SRS 竞品。官网列出的全部能力不代表均免费。[官方文档](https://immersivetranslate.com/docs/)、[官方商店](https://chromewebstore.google.com/detail/immersive-translate-ai-we/bpoadfkcbjbfhfodiogcnhhhpibjhbnh?pubDate=20251018)
- **Language Reactor**：以 Netflix、YouTube 双语字幕和弹出词典为入口。官网 Pro 说明包括完整词句收藏、高亮和 Anki 导出，免费 PhrasePump 另有收藏能力，因此不应概括为“免费完全不能存词”。此次商店与官网新功能版本信息不一致，不据此认定所有新功能已在稳定扩展发布。[官方商店](https://chromewebstore.google.com/detail/language-reactor/hoombieeljmmljlkjmnheibnpciblicm?hl=en)、[官方 Pro 说明](https://www.languagereactor.com/pro-mode)
- **Dictionariez**：商店显示 6 千用户，规模较小；聚合词典、双击查词、TTS，并与 Anki 联动，适合参考开放互通路线。[官方商店](https://chromewebstore.google.com/detail/dictionariez-your-diction/diojcfpekhhnndfmggknljpnfpcccbhc?hl=en-GB)、[官网](https://dictionariez.pnl.dev/)

## 对 Wordbloom 的建议

以下为基于公开功能和当前代码的产品判断，尚未通过用户研究验证。

**建议定位：为阅读英文资料的人，把真实遇见的生词快速收藏，并用每天几分钟记住。** 目前的释义、发音、自动例句与翻面卡片已是成熟竞品常见配置，不能单独形成强差异。

| 优先级 | 建议 | 依据与验证方向 |
| --- | --- | --- |
| P0 | 保存所选词所在原句，关联来源链接；区分原文语境与生成例句 | 已有 URL/标题，但原句与生成例句是不同数据；用真实阅读样本检验收藏后能否回忆语境 |
| P0 | 加入最小 SRS：认识/模糊/不认识、下次复习时间、今日到期队列 | Rememberry、Readlang、eJOY 均已有间隔复习；观测复习完成率和次日/七日回访 |
| P1 | 已收藏词在新页面中温和高亮，支持站点开关 | Rememberry、Relingo 已覆盖；检验再遇后的回忆表现与打扰投诉 |
| P1 | CSV/Anki 导出或集成，并评估大词库同步方案 | 当前只有自有 JSON 格式与有限 Chrome sync；先验证目标用户是否已有 Anki 词库 |
| P2 | 评估手机端短时复习或 PWA | 大竞品强调跨端，但应先验证是否真有手机复习需求，再投入账户和同步服务 |

第一轮建议实测 Rememberry、Readlang、Relingo、欧路和 eJOY，使用同一篇英文文章与同一组单词，比较首次收藏耗时、原句保存、复习步骤、导出完整性、跨端一致性和免费限制触达时机。当前调研可以确定对标名单与能力差异，无法仅凭公开用户数证明付费意愿、真实留存或哪款体验最好。
