# 每周话题三维课题宇宙

维护日期：2026-10-01。页面位于 `/reading/weekly/`，公开展示 10 个 toy model，无需账号密码。页面不请求旧 R2 私人课题接口；该接口仍保留独立认证。

## 本地启动

```bash
npm install
npm run build
npm run preview:research-universe
```

打开 `http://127.0.0.1:4173/reading/weekly/`，无需登录或附加查询参数。这是只绑定回环地址、挂载仓库合成 fixture 的预览服务器；端口可通过 `READING_PORT` 指定。页面 HTML/RSC 使用公开访问规则，只有旧 `/reading/weekly/data/` 接口继续使用 Basic Auth。

普通 `npm run dev` 可用来开发界面，但不提供 Cloudflare Functions 与 R2 接口。测试完整访问边界时使用上述静态构建预览。DEMO 是公开默认来源；旧浏览器保存的 `private` 来源偏好会迁移到 `demo`，已有本地进度和导入备份不会删除。`?demo=1` 仍可显式返回演示来源。

## 三维对象与操作

- Three.js PerspectiveCamera、OrbitControls 和 Raycaster 管理透视观察、拖动缩放与点击拾取。
- 课题名称沿字体轮廓挤出 0.16 个世界单位的厚度，带真实侧壁及前后表面；中英文均从同一字形掩膜生成，保留字腔。正面纹理保持清晰，侧面接受场景照明，轻微倾斜展示厚度。词云父组绕 y 轴转动，文字子组抵消父组姿态并朝向相机；展示模式添加有限摇摆。
- 八块 Mannel 教学黑板在桌面分上下两排、每排四块，第二排向右错开两列，其第一块对齐第一排第三块，默认低亮度。所有板等大，宽高比为 1.25，行缝 14px；按可用画布宽度排版并留边距，桌面单板宽度最多 280px，高度也受视口限制；两个方向始终等比缩放。折叠课题索引后，新增空间分给八块板，不用竖向拉伸或单独放大第四板补齐空白。背景随相机保持构图，公式按各 SVG 的自然比例缩放。窄于 600px 的场景改为两列四排，完整推导仍在弹窗中阅读。顶部保留 01–08 简洁编号入口，完整标题通过无障碍名称和悬停提示提供。点击实体黑板（Raycaster）或编号，可打开高亮的大幅教学板书；原生 dialog 压暗其余页面、隔离键盘焦点，点击外部空白或 Esc 关闭并恢复焦点。
- 右侧 Topic Index 默认折叠；工具栏保留展开/收起按钮。桌面折叠释放侧栏宽度给场景，移动端展开时覆盖画布；原生 hidden 排除隐藏按钮的 Tab 焦点，栏内 Escape 收起并回焦到开关。
- 探测器参考 BESIII 官网结构图、官方收录科普视频及已发表的 GDML/Unity 可视化。八边形磁轭由钢板与 RPC 间隙组成；内部包括漂移室线层、双层 TOF、分块量能器、螺线管和双端盖，保留开放剖切。五个子系统分别显隐，模型和 toy model 径迹属于同一个局部坐标系。通过“放大探测器”可独立观察，Reset View 返回课题全景。
- 只有数据明确给出的 `relatedTopicIds` 才绘制连线。位置由 ID 稳定生成，布局距离和默认字号不表示科研相关度或重要性评分。
- 拖动改变相机；暂停只停止自动动画。悬停课题、打开详情、操作相机都会暂缓自动旋转；悬停背景黑板不暂停对撞。关闭详情保留相机及用户旋转设置。页面隐藏时停止渲染循环。
- 原生 dialog 管理焦点隔离与 Esc；键盘课题索引可以打开同一弹窗。低画质限制像素比，尊重减少动态效果。WebGL 不可用时显示明确提示，列表及状态编辑仍可用。
- 场景最多同时绘制 60 条课题，全部记录仍在列表和搜索中；输入最多 500 条，单文件上限 8 MB。

## 数据来源与字段映射

公开页面只加载源码中的 10 个合成 toy model，或用户主动导入到本地浏览器的数据；不提供远程私人来源。旧数据适配函数继续保留，供维护与格式兼容检查使用，不再由公开页面调用。私人 canonical 不编入 JavaScript、public 或截图。

| 既有 Weekly 字段 | 新界面字段 |
| --- | --- |
| `id` | 稳定 `id` |
| `locales.*.title.focus` | `shortTitle` |
| `title.before/focus/after` | 完整 `title` |
| `eyebrow` | `category` |
| `question` / `why_now` | `summary` / `motivation` |
| `scope` / `plan` / `guardrail` | `startingPoint` / `workPlan` / `checks` |
| `deliverable` | `nextSteps`（预期产出，不当作已有结果） |
| `reference_ids` | 公开文献索引中的 `references` |
| `phase` | 标签；不推断完成状态 |

原始 `generated_on` 是数据生成时间，不冒充课题日期。没有给定的进度默认为 `unknown`，完成时间、结果、笔记均保留为空。没有自动生成器、自动排期或提醒任务。

DEMO 集在 `src/lib/reading/universe/demo.ts`，有 10 个明确标记的 toy model。两条示例完成状态用于展示徽章，没有伪造完成时间。页头展示 Howard Georgi 名言，不再展示课题总数和完成数。

## 新增话题与备份恢复

1. 点击“课题模板”下载版本化 JSON，填写自己的研究问题。
2. 保持 ID 永久稳定；私人记录使用 `datasetKind: "private"`、`isDemo: false`。
3. Markdown 与 `$…$` / `$$…$$` 数学写入文本字段。缺失字段可留空，不需要改三维组件。
4. 引用和成果采用 `{id,title,url}`，外链仅接受不含账号密码的 HTTPS URL；站内文献链接可使用 `/reading/#paper-ID`。
5. `relatedTopicIds` 必须指向同一数据集中的其他课题。
6. 导入后会显示记录数和重复 ID 数；明确选择保留已有、替换重复项，或打开独立工作区。同一文件中重复 ID 会被拒绝，DEMO 与私人数据不能合并。
7. “导出备份”包含当前数据、用户修改后的状态、笔记和完成时间。恢复用相同的导入入口。导出文件可能含私人研究内容，请自行保管。

当前网站已有 Markdown 文本内容，但旧每周话题源是受校验 JSON，没有每周 Markdown 记录工作流；因此本版用 JSON 承载 Markdown 字段，没有另建不兼容的文件解析流程。

## 保存位置与边界

- 公开页面不读取 R2 私人课题；旧数据接口仍保留认证和 `private, no-store` 响应头。
- 用户更新的状态与笔记保存到 `prism-research-universe:v1:<demo|private>:<datasetId>`。
- 用户主动导入的数据集保存到 `prism-research-universe:import:v1`；一次保留一个导入工作区，替换前可先导出备份。
- 这是当前浏览器、当前站点来源内的保存，不是云同步或设备间同步。隐私模式、清除网站数据、浏览器配额及浏览器故障都可能导致丢失；失败会显示提示，定期导出。
- 完成时间来自用户操作的设备时间；重新打开课题会清空 `completedAt`。更改状态不声称验证了研究成果。
- 不执行 Markdown 中的 HTML 或脚本；图片不加载；KaTeX 使用 `trust: false` 并限制展开量。外链需要主动点击，并使用 no-referrer。
- 页面及静态索引入口取消认证，旧数据 API 的认证与 R2 对象保持原样。不上传本地笔记到第三方服务。

## 代码入口

| 路径 | 职责 |
| --- | --- |
| `src/components/reading/WeeklyUniverse.tsx` | 既有路由的兼容入口 |
| `src/components/reading/universe/ResearchUniverse.tsx` | 页面、搜索筛选、导入审核与设置 |
| `ResearchScene.tsx`、`scene/` | 相机、词云拾取、三维几何与资源释放 |
| `TopicDetailModal.tsx` | 可访问详情、数学、笔记及进度 |
| `KnowledgeBoard.tsx` | 八块黑板的展开、步骤、自检、页码与焦点管理 |
| `src/lib/reading/universe/collision.ts` | 教学事例四动量、Lorentz boost、直线飞行方向和阶段定义 |
| `scene/collision.ts` | 两束入射、共振、D 对、两侧衰变与末态的时间演化 |
| `useWorkspace.ts` | 公开演示、导入切换、旧偏好迁移与本地保存 |
| `src/lib/reading/universe/model.ts` | 规范模型、旧数据适配、状态与布局 |
| `validate.ts`、`demo.ts` | 导入校验、冲突合并、示例与模板 |
| `knowledge.json` | 知识板公式、约定和来源 |
| `scripts/build-universe-formulas.mjs` | 构建公式 SVG，不处理私人内容 |

## 物理内容与替换方式

教材依据用户提供的 `Lecture-Mannel.pdf`（Thomas Mannel，*Effective Field Theories for Heavy Quarks: Heavy Quark Effective Theory and Heavy Quark Expansion*）。只读取指定教材；没有将完整 PDF 放入公开网站。八块板是依照讲义整理并补写中间步骤的中文教学稿：

1. 路径积分、重夸克动量分解与速度投影：§2.1，印刷页 3–5，PDF 8–10，式 (2.1)–(2.10)。
2. Grassmann 配方、非局域作用量、局域展开、动能与色磁算符、RPI：印刷页 5–6、15–16，PDF 10–11、20–21，式 (2.10)–(2.18)、(2.55)–(2.57)。
3. 自旋/味对称性、Isgur–Wise 函数与零反冲归一化：§2.2，印刷页 8–14，PDF 13–19。明确指出这些重到重关系不能直接照搬到 D → K。
4. 完备性、光学定理、OPE、没有独立 1/mQ 非微扰总宽度修正：§3.1–3.4、3.6，印刷页 27–38、46，PDF 32–43、51。区分完整去相位 Qv 与静态 hv，也说明端点与粲尺度的适用边界。

5. 匹配、红外相消、RG 方程与 6/25 指数：§2.3，印刷页 21–24，PDF 26–29，式 (2.74)–(2.89)。
6. 动能、色磁参数与首个幂次修正：§3.4，印刷页 38–40，PDF 43–45，式 (3.49)–(3.58)。
7. 五次方质量依赖、方案转换、renormalon 与 1S 示例：§3.5，印刷页 40–46，PDF 45–51，式 (3.59)、(3.66)–(3.80)。
8. 端点尺度、传播子重求和、形状函数及矩：§3.6，印刷页 46–49，PDF 51–54，式 (3.81)–(3.94)。形状函数采用 δ(ω−in·D)，与讲义 f 的自变量相反，卷积符号配套改变；说明树级矩与重整化尾部的区别。

约定跟随 Mannel：`g=(+,-,-,-)`、`D=∂+igₛA`、`[Dμ,Dν]=igₛGμν`、`δm=0`。色磁项的显式负号跟随这一约定。展开板中配方和 Dirac 代数是教学补写；完整推导、结论、自检与来源页码存于 `knowledge.json`。当前八板标题、背景提纲、36 个完整教学步骤、自检及弹窗界面统一为英文，不随网站语言切换。原中文稿保存在 `knowledge.zh.json`，暂不导入客户端，留待后续三语更新。数学片段保留原式，仅将公式内“静态阶”说明翻为 static limit。背景黑板不计入 10 个 toy model，也不计入完成统计。

探测器保留 BESIII 的五层几何，采用深灰金属实体、明确的剖切开口、少量冷白边线与机械支座；移除密集透明线框、扫描平面和雾状投影锥。参考资料：

- [BESIII 官方纵截面结构图](https://english.ihep.cas.cn/bes/co/pvg/swb/202201/t20220127_300408.html)。
- [BESIII 设计综述](https://arxiv.org/abs/0911.4960)。
- [Huang 等，GDML → Unity，图 7–9](https://arxiv.org/abs/2206.10117)。
- [高能所收录的《科学重器·北京正负电子对撞机》](https://ihep.cas.cn/kxcb/spdh/201510/t20151016_4439808.html)。
- [Li、You：Visualizing BESIII Events with Unity，ACAT 2024](https://indico.cern.ch/event/1330797/papers/5796833/files/13914-ACAT2024_Proceeding__Visualizing_BESIII_Events_with_Unity.pdf)，电子正电子碰撞与事例动态展示的方法参考，非本站动画原文件。

用户确认所指机构为 SCNT（南方核科学理论研究中心）。已检索近代物理所、相关会议及公开视频结果，找到了[机构官方介绍](https://www.impcas.ac.cn/sndt2017/202305/t20230509_6750827.html)，**未能确认用户所指的 D Dbar 宣传图/动画原件**。当前模型不标作 SCNT 官方素材；可在取得确切链接后进一步核对。没有从搜索结果猜测或重标素材归属。

教学事例采用 `e⁺e⁻ → ψ(3770) → D⁰D̄⁰`，信号侧为 `D⁰ → X e⁺νₑ`。画面仅显示一个青色 X 合动量方向、一个金色正电子和中微子缺失动量虚线，三者来自同一个 D 衰变顶点；不指定 X 的内部粒子或具体排他通道。X 表示整个强子系统，而非一种新粒子。D、X、e⁺ 和 νₑ 的示意向量采用同一动量比例，完整绘制时满足 `p_D = p_X + p_e + p_ν`；动画过程和淡出时仍沿直线延长。另一侧作为淡化的标记背景，隐藏其具体粒子标签。质心能量取 3.773 GeV，X 的教学系统不变质量取 1.1 GeV；这是一个守恒的运动学示例，不是 inclusive 衰变率、随机事例生成器或探测器响应模拟。

- 五阶段默认 4× 速度、约 4.8 秒循环（内部教学时钟周期 19.2 秒，可调 1–6×）：入射 → 碰撞/共振 → D 对 → 次级衰变 → 末态。默认节奏为 0.4 秒入射、0.1 秒碰撞短闪、0.8 秒 D 对分离、2.2 秒次级衰变展开；随后继续前行 0.2 秒，用 1 秒平滑淡出，最后留 0.1 秒空场。粒子头沿原直线继续运动，径迹、标签和顶点一起淡出，不切换为固定的末端点，也不把径迹收缩成点。阶段按钮与动画共享时间常量。
- 质心系近似忽略束流交叉角；按用户要求，所有末态轨迹按动量方向直线延伸，省略磁场偏转，展示文案同步注明直线示意。D 为中性，使用虚线飞行段；中微子只有缺失动量虚线，没有击中。
- D 飞行距离与时间显著放大以区分次级顶点，页面就地标注。带电末态使用锐利直线段和移动的几何粒子标记，不生成静止 hit 方块或 shower。教学径迹在剖面上方绘制，使旋转中的实体不会遮掉衰变链；这些是直线飞行方向示意，不是探测器响应模拟。
- 探测器使用左下方独立的透明画布和相机，在自己的展示区域内居中；拖动、滚轮或触控只旋转和缩放探测器，不改变课题与黑板视角。按结构包围范围适配尺寸，束流的延长段不参与模型大小计算。下方事例说明默认折叠，展开和收起不移动模型；放大模式扩展独立视图区，退出后恢复原位。绕 y 轴以 0.03 rad/s 缓慢自转（约 3.5 分钟一周），独立于课题和对撞速度；可单独调速和关闭。几何、束流与事例同步旋转；入射束团从独立视图区两侧边界沿束流轴射入，起点随镜头缩放与旋转自适应。所有探测器设置（自转、对撞速度、阶段、分层、放大、来源）归入右侧 Scene controls；下方仅保留事例说明开关。独立画布可用方向键旋转、加减号缩放、Home 复位。
- 阶段按钮可定格观察，“循环”恢复自动演示；暂停、打开黑板/课题、后台页停止推进。减少动态默认停在完整末态，可手动选阶段。WebGL 不可用时黑板及课题仍能通过 DOM 按钮阅读。
- 探测器相机使用正交光学缩放，滚轮与双指放大没有应用上限，不会因镜头推进而穿过衰变顶点；指针指向的位置保持为缩放中心。右键拖动、双指拖动或 Shift 加方向键可以平移检查局部，Home 恢复居中和初始倍率，调整视图区尺寸保留当前倍率。X 的合动量方向以青色显示，正电子用亮金色与冷白核心突出，标记侧淡化；父 D 和中微子维持虚线。线宽、顶点与粒子标签按屏幕尺寸绘制，近距离放大时不会膨胀遮挡分叉。

## 验证命令

```bash
npm run typecheck
npm run lint
npm run build
npm run test:research-universe
npm run test:reading:weekly:functions
npm run test:reading:weekly:validator
npm run test:reading:weekly:leaks
npm run test:i18n:locale
READING_WEEKLY_QA_OUTPUT_DIR="$PWD/.artifacts/research-universe" npm run test:reading:weekly:browser
```

浏览器脚本只用虚构 fixture，检查真实 WebGL 场景的旋转、拾取、拖动、暂停、弹窗焦点、刷新保留、重开课题、导入导出、10 个 toy model、三种语言、390px 布局、减少动态和 WebGL 降级。截图保存到指定目录；未设置时保存到系统临时目录。实际验收结果以本次运行输出及截图为准。

## 本次实际验收

2026-10-01：`typecheck` 与 production `build` 已通过，`lint` 无错误，仅保留原有 `tailwind.config.mjs` 默认导出警告。数据/导入/进度的 27 项检查、3 项实体几何检查通过；新增顶点能动量守恒、末态质量、直线飞行方向、循环阶段与教学公式检查。

浏览器整体验收于 2026-10-01 13:06 UTC 通过：默认折叠索引、键盘开关与焦点恢复、折叠后的画布扩宽、网站切到中文后板书仍全英文；八板实体点击、键盘入口、连续翻板、空白关闭、Esc、焦点恢复、390px、减少动态、WebGL 降级。校验八块黑板等大、横向比例、四周留边、14px 行缝、上排第三板与下排第一板对齐；探测器外轮廓尺寸适中且锚定左下角。前景课题优先响应点击，黑板露出区域仍可拾取。保留立体字、直线轨迹、慢速自转、默认 4× 对撞循环及原有导入导出、进度、三语言与认证边界回归，页面无 JS 或控制台错误。

定向浏览器复验检查 1840px 下拖动和缩放后背景及探测器继续固定在画面内，展开/收起索引后八板保持比例，新增宽度确实分配给黑板；1440px、2560px 与 390px 均无裁切或横向溢出。人工查看了实际截图；这些比例断言用于防止拉伸、裁切和极端尺寸回归，不代表审美评价。Production build、typecheck、lint 与 diff 检查通过（lint 保留原有 1 条默认导出警告）。218 段教学数学、能动量守恒和直线方向检查通过。

Apple M4 / macOS arm64，Chrome 154.0.8037.58，无头 SwiftShader，活动采样 21.8 FPS / 430 draw calls；仅为软件渲染抽样，不代表硬件显卡保证。

报告保存于 `.artifacts/research-universe-english-collapsed/verification.json`；最终截图为 `20-final-overview.png`、`21-final-scene.png`、`22-chinese-3d-titles.png` 和 `23-final-mobile.png`，同目录保留五阶段与所有黑板截图。只使用合成 fixture，不访问生产私人数据。此前各版验证保留在 `.artifacts/research-universe-staggered/`、`.artifacts/research-universe-full-wall/` 等目录。

2026-10-01 14:14 UTC 深度缩放复验通过：实际滚轮从超过 30 倍继续放大至超过 60 倍，镜头没有向模型内部推进；右键平移、窗口调整后保留倍率、键盘缩放与 Home 复位均通过，操作未改变主场景相机或黑板位置。已查看完整末态、约 5.6 倍衰变全貌与约 38.7 倍次级顶点截图，高亮直线和固定尺寸顶点保持可辨。报告为 `.artifacts/research-universe-deep-zoom/verification.json`，近景截图为 `21-decay-closeup.png`、`22-secondary-vertex-closeup.png`。本轮 build、typecheck、物理与公式检查通过；lint 无错误，仅保留既有警告。

2026-10-01 14:41 UTC，D⁰ → X⁻e⁺νₑ 改造的完整浏览器交互回归通过，报告在 `.artifacts/research-universe-inclusive/verification.json`。随后调整了固定相空间点的方向，避免默认视角下两条强子径迹重合；重新通过电荷、质量壳、X 总四动量与两侧衰变顶点守恒测试及 production build。14:44 UTC 最终定向验图通过，已查看小视窗、放大视图和约 38.7 倍顶点近景；三条青色强子与金色正电子清晰分开，标签沿各自径迹保留在顶点附近。最终截图与报告保存在 `.artifacts/research-universe-inclusive-final/`，没有浏览器运行错误。

2026-10-01 14:59 UTC，快入射、慢衰变与渐隐收尾的完整浏览器回归通过。自动循环实测透明度依次约为 0.963、0.401、0.038，同时粒子飞行进度从 1.144 增至 1.348、1.492，确认到达原末端后仍持续前行。已检查 `24-decay-fade.png`，完整径迹和标签共同变淡，没有留下固定末端方块。报告与截图在 `.artifacts/research-universe-slow-fade/`。Production build、typecheck、物理/时序/淡出测试和 218 段公式检查通过；lint 仅保留既有默认导出警告。

2026-10-01 15:09 UTC，合并 X 表示的完整浏览器回归通过。信号侧只显示青色 X 合动量、金色正电子与中微子缺失动量；说明及教学步骤不再列出具体强子组成。已查看默认小视窗、放大视图、约 38.7 倍顶点近景和渐隐截图。超过 60 倍缩放、独立旋转与平移、快入射慢衰变、持续运动中淡出均通过。纯模型验证保持原 X 总四动量，并满足 D → X e⁺νₑ 的四动量守恒；217 段公式、production build、typecheck 与 lint 检查通过，lint 仅保留既有警告。报告与截图在 `.artifacts/research-universe-aggregate-x/`；本地 4173 预览返回 HTTP 200。

2026-10-01 15:51 UTC，公开入口的完整浏览器回归通过：匿名访问不带查询参数的 `/reading/weekly/`，默认加载 10 个 toy model，整个页面生命周期没有私人 API 请求或认证 challenge；旧 `private` 来源迁移后保留已保存的 DEMO 进度。八块黑板、探测器独立交互、慢衰变渐隐、导入导出、三语界面、手机与降级检查通过。服务端函数及本地安全测试确认 HTML/RSC 公开、旧数据 API 仍鉴权。报告在 `.artifacts/research-universe-public-release/`。Build、typecheck、物理/公式/数据检查、locale 检查及泄漏扫描通过；lint 仅有原有默认导出警告。
