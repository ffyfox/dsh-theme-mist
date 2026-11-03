# 视觉规范：DSH Go → DSH 官方 Web

本文是**实现规格**，不是设计评论。每个数值都来自 DSH Go 源码或可复现计算，每个映射目标都来自官方 `--dsw-*` token 清单。

---

## 0. 设计语言（五条原则）

DSH Go 的主题源码把设计意图写进了注释，这些原则决定了移植时**哪些可以改、哪些不能动**。

| # | 原则 | 原文依据 | 移植时怎么守 |
|---|---|---|---|
| 1 | **层次靠材质，不靠阴影** | `app_theme.dart:60-64`「页面是渐变，浮在内容上的（顶栏、输入条、弹层）是真模糊玻璃…M3 的 elevation 一律 0」 | 官方 `--dsw-elevation-*` 默认含「描边+柔光」，需把柔光调极淡；阴影只留在玻璃外沿 |
| 2 | **细线是骨架** | 同上「卡片、Chip、输入框、对话框都有 0.5–1px 的线；它比阴影安静」 | 官方 `--dsw-alias-border-l1..l4` 保持可见但低对比；不要用 `border: 0` 抹掉 |
| 3 | **连续圆角** | `app_theme.dart:67`「全部走 AppShape 的五档 + 胶囊，不手写半径」 | 官方 `corner-shape.css` 已全局应用 superellipse，**只需给对半径数值** |
| 4 | **70/25/5 色彩比例** | `palette.dart:22-27`「70% 中性面、25% 文字与细线、≤5% 强调色」 | 强调色只进主按钮/发送键/选中态/链接；**不要**给大面积表面染色 |
| 5 | **安静、短、跟手** | `motion.dart:5-11`「反馈类 ≤160ms；结构类 240–340ms；环境类 2.4s」 | 官方 `--ds-transition-duration-*` 已有刻度，映射时向下取整，不要拉长 |

> 原则 1 和 4 是这次移植**最容易做坏**的地方。官方默认视觉是「干净的白面 + 明确的主按钮蓝」，DSH Go 是「低饱和雾面 + 几乎无强调色」。照抄颜色不难，难的是**克制**。

---

## 1. 形状阶梯

| 档 | 半径 (px) | DSH Go 用途 | 官方对应 |
|---|---|---|---|
| `xs` | **6** | 行内代码、角标、进度条端头 | 无独立 token，直接写 `border-radius: 6px` |
| `sm` | **10** | Chip、工具图标块、小按钮、菜单项高亮 | 同上 |
| `md` | **14** | 卡片、代码块、输入框、菜单、主按钮 | 同上 |
| `lg` | **20** | 用户气泡、审批卡、设置分组卡 | 同上 |
| `xl` | **28** | 输入条（composer）、底部弹层、对话框 | 官方 panel 半径 = 28，**天然一致** |
| `pill` | 高度/2 | 顶栏胶囊、模型胶囊、发送键 | `border-radius: 999px` |

原文：`shapes.dart:9-28`。源码注释明确写道：「DSH 官方 Web 的阶梯是 4/8/12/16/20/28（panel = 28），这里在触屏上整体放大一点，但保留 28 作为最外层容器半径，与官方 composer 一致」。

### 1.1 ⚠️ 官方其实有半径 token（修正早先判断）

官方在 `base.css` 的 `:root` 上定义了整套半径：

```
--dsw-radius-xs    4px
--dsw-radius-sm    8px
--dsw-radius-md    12px
--dsw-radius-lg    16px
--dsw-radius-xl    20px
--dsw-radius-panel 28px
```

（证据：`dsh-client-ui-theme/lib/client.js:1464` 的 `base_css_default`）

对照 DSH Go 的 6/10/14/20/28：

| 档 | 官方 | DSH Go | 差异 |
|---|---|---|---|
| xs | 4 | 6 | +2 |
| sm | 8 | 10 | +2 |
| md | 12 | 14 | +2 |
| lg | 16 | 20 | +4 |
| xl | 20 | 28 | +8 |
| panel | 28 | — | 相同 |

**决策：不覆盖 `--dsw-radius-*`，只用局部 `border-radius`。**

理由：
1. 半径 token 声明在 `:root`，`overrideTokens` 写的是 `body` 内联——**能继承生效**，但这会**一次性改变官方全部组件的圆角**，爆炸半径不可枚举（设置卡片、菜单、对话框、终端、表格…）
2. DSH Go 的放大是**触屏可点性**需求（`shapes.dart:20` 原文：「这里在触屏上整体放大一点」），桌面鼠标不需要
3. 我们只对**少数标志性容器**（composer、用户气泡、对话框）套 DSH Go 的半径，其余保留官方尺度——这符合「统一而非全变圆」的目标

> 若后续实测发现视觉不统一，再评估"整体覆盖 radius token"作为可选预设，届时需单独做全量截图回归。

### 1.2 落地情况（T2.1，2026-11-02 实测）

六档阶梯作为**自有变量**落在 `material.module.css` 的作用域里（`--dsh-go-radius-xs/sm/md/lg/xl/pill` = 6/10/14/20/28/999），只改**两套阶梯之间**的那几级，且只在 DSH Go 里真实存在的容器上动手：

| 表面 | 官方实测 | 改成 | 是否可见 |
|---|---|---|---|
| composer 输入条 | **28** | 28（不动） | — 官方 panel 就是 28，天然一致 |
| 用户气泡 | **20** | 20（不动） | — |
| Markdown 代码块 `:global(.md-code-block)` | 16 | **14**（md） | 角部略收紧 |
| 行内代码 `:not(pre) > code` | 8 | **6**（xs） | 略收紧 |
| 菜单 `[role='menu']` | 16 | **14**（md） | 略收紧 |
| 模型胶囊 `[data-slot='conversation.input.model'] button` | 8 | **999（stadium）** | 明显：从圆角方块变胶囊 |
| 侧栏行、按钮、终端等 | 12 / 8 / … | **不动** | 官方尺寸在 DSH Go 里没有对应阶梯 |

**结论：这是"对齐阶梯"，不是"全变圆"。** 12 处里只有 4 处动，其中 3 处是 2px 级别的收紧，唯一直观的改动是把模型胶囊从 8px 方角变成 stadium。前五档官方与 DSH Go 的差值分别是 +2/+2/+2/+4/+8，但**差值最大的两级（xl、lg）恰好是官方已经等于 DSH Go 的两级**，真正需要改的反而是差值最小的三级。

**一个实测细节：`corner-shape: round` 的 computed 值是 `superellipse(1)`。** 也就是说 DSH Go 的"真圆角"（`round`）与官方的"连续圆角"（`superellipse(1.5)`）是同一属性的两个取值，而不是两套机制。给胶囊写 `corner-shape: round` 后 computed 显示 `superellipse(1)`，渲染是标准 stadium —— 与官方的发送按钮（同样 `superellipse(1)`、radius 999）完全一致。这条写进验收可以避免以后误判成"没生效"。

### 1.3 其它实现要点

- **不要重写超椭圆**：官方 `corner-shape.css` 已在 `@supports (corner-shape: superellipse(1.5))` 内对所有元素及其伪元素应用（`dsh-client-ui-theme/README.zh.md:88`）。再声明一遍 `superellipse(...)` 只会打架
- **唯一的例外是要写的那一半**：`border-radius: 50%` 的圆和 `999px` 的胶囊需要配 `corner-shape: round`，否则超椭圆会把圆弧压变形（同文档 `:88`）。T2.1 给模型胶囊就是这么做的（§1.2）
- 实测补充：`round` 的 computed 值显示为 `superellipse(1)`，别把"没看到 round"当成没生效

---

## 2. 间距阶梯

```
xxs 2 · xs 4 · sm 8 · md 12 · lg 16 · xl 20 · xxl 24 · xxxl 32
gutter 16       页面水平留白
inTurn 8        同一轮内部竖向间距
betweenTurns 24 换轮竖向间距
readingWidth 720 正文最大阅读宽度
floatInset 12   浮动控件离阅读列两边
```

原文：`shapes.dart:57-88`。源码注明 `readingWidth 720` 与官方 `--dsh-chat-content-width: 748px` 同档。

**实现要点**：官方正文宽度已由 `--dsh-chat-content-width` 控制。**不要改它**——改成 720 会让桌面端正文变窄，属于"以移动端直觉破坏桌面端阅读"。保留官方 748，差异可忽略。

---

## 3. 字阶

| 角色 | 字号 / 行高 | 字重 | 用途 |
|---|---|---|---|
| displaySmall | 28 / 1.25 | 300 | 欢迎语、空状态大字 |
| headlineMedium | 22 / 1.3 | 600 | 页面标题 |
| headlineSmall | 20 / 1.35 | 600 | 对话框标题 |
| titleLarge | 18 / 1.4 | 600 | 弹层标题 |
| titleMedium | 16 / 1.45 | 600 | 卡片/列表标题 |
| titleSmall | 14 / 1.45 | 600 | 工具行、分组名 |
| bodyLarge | 16 / 1.65 | 400 | 聊天正文 |
| bodyMedium | 14 / 1.55 | 400 | 界面正文 |
| bodySmall | 12 / 1.5 | 400 | 说明、元信息 |
| labelLarge | 14 / 1.4 | 600 | 按钮 |
| labelMedium | 12 / 1.35 | 600 | Chip、胶囊 |
| labelSmall | 11 / 1.35 | 400 | 时间戳、角标 |

原文：`typography.dart:141-191`。

**关键设计决策：不接管字号。**

理由：官方已有完整的字号设置体系——正文 10–22px 步进、代码 10–16、终端 10–20，且用户可调、可持久化（`dsh-client-ui-theme/README.zh.md:34`）。主题插件若写死字号，会**覆盖用户的字号偏好**，属于功能回退。

**只接管字重与行高**，通过自有 CSS 对少量语义选择器微调；不碰 `--dsh-content-font-size` 系列变量。

**字体族**：不打包字体（见 §7）。官方的 `--dsw-font-family` 已由用户字体设置驱动，主题不介入。

---

## 4. 动效

| 名称 | 时长 | 用途 |
|---|---|---|
| press | 90ms | 按压缩放、水波起始 |
| quick | 160ms | 淡入淡出、图标切换 |
| standard | 240ms | 小块展开收起 |
| collapse | 280ms | 思考块/工具行折叠 |
| emphasized | 340ms | 胶囊变形、抽屉落位 |
| slow | 480ms | 页面级过场 |
| breath | 2400ms | 环境呼吸（连接状态点） |

原文：`motion.dart:13-37`。

缓动：
- 标准 `cubic-bezier(0.4, 0, 0.2, 1)`（源码注明「DSH Web 的 cubic-bezier(.4,0,.2,1) 同族」）
- 进场 `emphasizedDecelerate`、退场 `emphasizedAccelerate`
- 折叠 `easeInOutCubic`
- 滑行 `cubic-bezier(0.32, 0.72, 0, 1.0)`

**实现要点**：
- 官方已发布 `--ds-transition-duration-*` 与 `--ds-ease-*`（证据：`dsh-client-ui-layout/lib/client.js:73` 的 CSS 里使用 `var(--ds-transition-duration-slow)` 与 `var(--ds-ease-in-out)`）
- **不要重定义这两个变量**——它们被侧栏开合、面板拖拽共用，改了会让布局动画与视觉不一致
- 只在自有 CSS 的局部动效（如光晕呼吸、悬停过渡）里使用固定时长
- 必须响应 `prefers-reduced-motion: reduce`——官方模板已有该媒体查询，插件同样要加

### 4.1 落地情况（T2.6，2026-11-02 实测）

**动效刻度是我们自己的变量**，不碰官方 token：

```css
body[data-dsh-go-theme] {
  --dsh-go-duration-press: 90ms;
  --dsh-go-duration-quick: 160ms;
  --dsh-go-duration-standard: 240ms;
  --dsh-go-ease-standard: cubic-bezier(0.4, 0, 0.2, 1);
}
```

**只动两处，都是我们改过材质、因而必须补交互的地方**：

| 表面 | 过渡 | 为什么 |
|---|---|---|
| 模型胶囊 `[data-slot='conversation.input.model'] button` | `background-color 160ms` | T2.4 给了它基础填充，官方 hover 是另一条规则；两者之间需要过渡才不"闪" |
| composer 卡片 `[data-composer-card]` | `background-color` + `box-shadow 240ms` | 系统级「减少透明」生效时填充从 0.70 变 0.96，缓一下比硬切自然 |

**明确不做**：页面光晕呼吸。它住在 `body` 的 `background-image` 里，动画意味着每帧重绘整个视口；而 DSH Go 的 2.4s「呼吸」本来就是给连接状态点的，不是给页面的。整份样式表**没有任何 `@keyframes`**（单测断言）。

**官方 token 实测（0.2.2）**：`--ds-transition-duration-fast = .1s`、`-slow = .3s`、`--ds-ease-in-out = cubic-bezier(.4,0,.2,1)`；但 `--ds-transition-duration-standard` 与 `--ds-ease-standard` 是**空值**。所以既不能覆盖它们（被侧栏开合、面板拖拽共用），也不能依赖它们不存在的档位——自有刻度是唯一稳的做法。

**降级实测**：`prefers-reduced-motion: reduce` 下，三个表面的 `transition-property` 全部变成 `none`、`animation-name` 为 `none`（CDP `Emulation.setEmulatedMedia` 模拟核对）。

> ⚠️ **验证坑（写下来省下一次返工）**：headless Chrome 的 `matchMedia('(hover: hover)')` 是 **false**，而官方所有 hover 规则都包在 `@media (hover:hover)` 里 —— 所以 headless 下"悬停没反应"是环境问题，不是主题的锅。
> 要确认我们的填充没有压掉官方 hover（特异性 0,3,0 vs 我们的 0,2,1），做法是临时注入一条**去掉媒体查询**的官方 hover 规则，再核对计算值：实测 hover 时背景变成 `color-mix(brand 7%, transparent)`，说明官方规则仍然赢、悬停反馈完好。

---

## 5. 颜色：六套配色

### 5.1 推导算法（决定"为什么对比度不随配色变化"）

DSH Go 不是给每套配色手写 48 个颜色，而是**只定义一套中性色 + 六个强调色**，其余由 OKLCH 推导：

```
中性色(某配色) = retint(雾蓝中性色, hueShift = 该配色色相 − 266°, chromaScale = 该配色彩度倍数)
retint 保持 L(明度) 不变，只旋转色相、缩放彩度
```

原文：`oklch.dart:100-108`（`retint`）、`palette.dart:213-218`（注释：「明度一点不动 —— 所以文字对比度、玻璃层次在每套配色里都一样」）、`palette.dart:294-295`（`baseHue = 266.0`）。

**这是整套方案的技术支点**：因为明度不变，**对比度也不变**。所以主题插件不需要为六套配色各做一遍无障碍校验，只需要校验一套。

### 5.2 六套配色的色相与彩度

| id | 名称 | tintHue | tintChroma | seed (浅色主色) | seedDark (深色主色) |
|---|---|---|---|---|---|
| `mist` | 雾蓝（默认） | 266 | 1.00 | `#4B67B4` | `#97B1F0` |
| `daiqing` | 黛青 | 238 | 0.90 | `#236185` | `#8CB9D7` |
| `dusk` | 暮紫 | 295 | 0.85 | `#726291` | `#B8ABD2` |
| `turquoise` | 松石 | 190 | 0.70 | `#34766F` | `#8DBEB7` |
| `amber` | 琥珀 | 75 | 0.75 | `#8D6636` | `#CCAC87` |
| `graphite` | 石墨 | 262 | 0.25 | `#2C2E32` | `#E5E8ED` |

原文：`accent.dart:120-256`。

### 5.3 对比度自检结果（本仓库实测）

用 Python 独立复刻 `oklch.dart` + `retint` 后，对 6 套配色 × 15 组关键前景/背景组合做 WCAG 对比度计算：

```
total checks = 90    failures = 0
```

| 配色 | 白字 / seed | onSeedDark / seedDark | 要求 |
|---|---|---|---|
| mist | 5.39 | 7.94 | 白字 ≥4.5，深墨字 ≥7 |
| daiqing | 6.73 | 8.04 | 同上 |
| dusk | 5.42 | 7.91 | 同上 |
| turquoise | 5.29 | 8.12 | 同上 |
| amber | 5.14 | 7.92 | 同上 |
| graphite | 13.60 | 14.05 | 同上 |

**结论**：直接映射即可满足 WCAG AA，**不需要额外加对比度保护层**。这一点被写进验收标准。

#### 5.3.1 一个必须诚实记录的偏差

进一步按 **DSH Go 源码注释自述的门槛**逐条核对（`palette.dart:50` 说「主文字 · 深墨蓝（对所有浅色面 ≥ 13）」、`:81` 说「主文字 · 雾白（对深色面 ≥ 10.5）」），发现**这两条自述在所有六套配色上都不成立**：

| 断言 | 自述门槛 | 实测最小值 | 打破位置 |
|---|---|---|---|
| ink 对最差浅色面 | ≥ 13 | **12.23** | turquoise / `ink` 对 `mistHighest` |
| paper 对最差深色面 | ≥ 10.5 | **9.44** | turquoise / `paper` 对 `nightHighest` |

**但不是问题**，原因：

1. `mistHighest` / `nightHighest` 是**最深/最亮的嵌套面**，不是正文背景。正文实际落在 `bg-base`（mist / night）上，那里的实测值是 **ink/mist = 14.28**、**paper/night = 13.54**，远超门槛。
2. 所有值仍**远超 WCAG AA（4.5:1）**。
3. 偏差来自上游注释的取整口径，不是我们算出错——两套独立实现（本仓库脚本与子代理脚本）在同一组数字上完全一致。

**对插件的实际要求**：`--dsw-alias-label-primary` 必须映射到 `bg-base` / `bg-layer-1` 语境（即 mist / night），而不是 `mistHighest` / `nightHighest`。映射表已按此设计。

> ⚠️ **装饰色不得承载信息**：`inkGhost` 对 `mist` 只有 **2.25:1**，`paperGhost` 对 `night` 只有 **2.99:1**。源码自己也写明「≈2.5，**不得**承载必要信息」（`palette.dart:59`）。因此 `--dsw-alias-label-caption` 映射到 `inkGhost` 是**错误**的——它会被用来显示说明文字。正确做法见 §6.1 的修正。

#### 5.3.2 两个独立实现的交叉验证

为了避免"算法实现有误导致数值全错"这种沉默失败，令牌数值由**两套互不共享代码的 Python 实现**各自复算，再比对结果：

| 验证项 | 结果 |
|---|---|
| 六套 `seed` / `seedDark` 及其对比度 | **完全一致**（5.39 / 6.73 / 5.42 / 5.29 / 5.14 / 13.60） |
| 12 条不达注释门槛的条目 | **完全一致**，且都集中在 `mistHighest` / `nightHighest` |
| 往返一致性 | 60 个常量 sRGB→OKLCH→sRGB 零误差 |
| `retint` 保明度性 | 306 个样本 |ΔL| ≤ 0.0020 |
| 与 Dart 源码常量逐字比对 | 51 个 `DshPalette` + 51 个 `NeutralTones.defaults` + 101 个 `AppAccent` 字段 → **0 不一致** |
| 色域裁剪 | 全流程 572 次转换仅 **1 次**（`daiqing/light/shadowInk`，彩度 0.0452→0.0447） |

**复现方式**：

```bash
python3 tools/derive-tokens.py                        # 生成 docs/reference/palette.json + 自检报告
python3 tools/check-dart-constants.py <源码目录>       # 对照 Dart 源码逐字校验常量
```

**确定性**：同一脚本重跑，`palette.json` 与 `palette-tables.md` **除 `elapsed_seconds`（运行耗时）一字段外字节级一致**——已实测比对确认。

产物：
- [`reference/palette.json`](reference/palette.json) — 6 套 × 26 浅色 + 27 深色中性色 + 18 个 accent 字段
- [`reference/palette-tables.md`](reference/palette-tables.md) — 可读表格

> ⚠️ **诚实声明**：DSH Go 的 `test/theme/palette_contrast_test.dart` **不在**我们取得的源码包里（该包只含 `app/lib/` 与 `docs/`），因此无法逐条对照其真实断言。§5.3.1 核对的依据是**源码注释自述的门槛**，不是测试文件。

### 5.4 雾蓝（默认）浅色完整中性色

| DSH Go token | 值 | 用途 |
|---|---|---|
| mistTop | `#EBF1FE` | 页面渐变顶 |
| mistBottom | `#F6F7FC` | 页面渐变底 |
| mist | `#F0F4FD` | 页面不透明兜底 |
| mistLowest | `#FBFCFF` | 最高亮面 |
| mistLow | `#F6F9FE` | 次级亮面 |
| mistContainer | `#EEF1F9` | 容器面 |
| mistHigh | `#E7EBF4` | 高层面 |
| mistHighest | `#DFE4EE` | 最高层 |
| ink | `#1E232E` | 主文字 |
| inkMuted | `#4F5562` | 次级文字 |
| inkFaint | `#646974` | 三级文字 |
| inkGhost | `#A1A5AC` | 禁用/装饰 |
| outlineLight | `#7E838D` | 交互边界 |
| ruleLight | `#DCE0E8` | 发丝线 |
| shadowInk | `#0B152D` | 冷墨阴影基色 |
| slate | `#545E6F` | 次要按钮 |
| slateContainer | `#E2E6F0` | 次要容器 |
| codeWell | `#EDF0F6` | 代码块底 |
| codeWellHeader | `#E7EBF3` | 代码块标题条 |
| codeWellBorder | `#DBDEE5` | 代码块描边 |

原文：`palette.dart:35-69, 298-350`。

### 5.5 雾蓝（默认）深色完整中性色

| token | 值 | 用途 |
|---|---|---|
| nightTop | `#1D222C` | 深色渐变顶 |
| nightBottom | `#1B1C23` | 深色渐变底 |
| night | `#1C1F28` | 页面底（明度 0.23–0.25，**刻意不用纯黑**） |
| nightLowest | `#14171E` | 最低面 |
| nightLow | `#232730` | 次低面 |
| nightContainer | `#272C36` | 容器面 |
| nightHigh | `#2D323C` | 高层面 |
| nightHighest | `#343944` | 最高层 |
| paper | `#E6E9F0` | 主文字（**不是纯白**） |
| paperMuted | `#B6BBC5` | 次级文字 |
| paperFaint | `#9A9EA9` | 三级文字 |
| paperGhost | `#656971` | 装饰 |
| outlineDark | `#737781` | 交互边界 |
| ruleDark | `#343841` | 发丝线 |
| smoke | `#292E39` | chrome 烟灰 |
| sheetDark | `#232832` | 弹层底 |
| codeWellDark | `#14171E` | 代码块底 |
| terminal | `#12151C` | 终端卡（浅色模式也是深底） |

原文：`palette.dart:71-88, 341-349`。源码注释强调：「纯黑底上的亮字长时间看会'晕'」「不用纯白/纯黑做大面积面色」。

---

## 6. 颜色到官方 token 的映射

### 6.1 浅色（以雾蓝为例）

| 官方 token | 取值来源 | 值 | 理由 |
|---|---|---|---|
| `--dsw-alias-bg-base` | mist | `#F0F4FD` | 渐变中值作兜底；渐变本身走自有 CSS |
| `--dsw-alias-bg-layer-1` | mistLowest | `#FBFCFF` | 最高亮面 |
| `--dsw-alias-bg-layer-2` | mistLow | `#F6F9FE` | 嵌套面 |
| `--dsw-alias-bg-layer-3` | mistContainer | `#EEF1F9` | 最深嵌套 |
| `--dsw-alias-bg-overlay` | mistHigh | `#E7EBF4` | 浮层底 |
| `--dsw-alias-label-primary` | ink | `#1E232E` | 主文字 |
| `--dsw-alias-label-secondary` | inkMuted | `#4F5562` | 次级 |
| `--dsw-alias-label-tertiary` | inkFaint | `#646974` | 三级（对 mist **5.00:1**） |
| `--dsw-alias-label-caption` | inkFaint（与 tertiary **同色**） | `#646974` | ⚠️ 刻意为之，见下方「浅色侧没有第五级」 |
| `--dsw-alias-label-dimmed` | inkGhost | `#A1A5AC` | 纯装饰/禁用，**才**用 ghost（对 mist 2.24:1，不得承载信息） |
| `--dsw-alias-label-primary-foreground` | mistLowest | `#FBFCFF` | 主色按钮/色块上的浅色前景字 |
| `--dsw-alias-border-l1` | `rgba(11,21,45,0.08)` | — | ⚠️ **见下方「描边必须用 alpha」** |
| `--dsw-alias-border-l2` | `rgba(11,21,45,0.12)` | — | 同上 |
| `--dsw-alias-border-l3` | `rgba(11,21,45,0.25)` | — | 交互边界（≥3:1） |
| `--dsw-alias-border-l4` | `rgba(11,21,45,0.30)` | — | 最强内描边（`--dsw-elevation-stroke-color` 默认源） |
| `--dsw-alias-brand-primary` | seed | `#4B67B4` | ⚠️ **见下方「brand-primary 的语义反转」** |
| `--dsw-alias-brand-text` | ink | `#1E232E` | 品牌文字用墨色，不用蓝 |
| `--dsw-alias-button-primary-fill` | seed | `#4B67B4` | 主按钮 |
| `--dsw-alias-button-primary-hover` | pressed | `#3D569D` | 按下态 |
| `--dsw-alias-state-business-primary` | seed | `#4B67B4` | 业务状态色（兼 `--dsw-focus-ring-color` 回退源） |
| `--dsw-alias-state-business-tertiary` | container | `#DEE8FF` | 业务状态浅底 |
| `--dsw-alias-interactive-bg-hover` | `color-mix(in srgb, var(--dsw-alias-brand-primary) 7%, transparent)` | — | 通用悬停反馈 |
| `--dsw-alias-interactive-bg-active` | `color-mix(in srgb, var(--dsw-alias-brand-primary) 14%, transparent)` | — | 通用按下反馈 |
| `--dsw-specific-bubble` | bubble | `#D9E4FD` | 用户气泡 |
| `--dsw-specific-bubble-highlight` | bubble 加深 | `#C7D6F8` | 气泡高亮 |
| `--dsw-specific-input-major` | mistLowest | `#FBFCFF` | 输入框底 |
| `--dsw-specific-sidebar-fill` | mistLow | `#F6F9FE` | 侧栏底 |
| `--dsw-specific-sidebar-nav-item-active` | mistContainer | `#EEF1F9` | 侧栏选中行底 |
| `--dsw-specific-sidebar-nav-item-active-accent` | container | `#DEE8FF` | 侧栏选中行强调色 |
| `--dsw-specific-selector` | mistContainer | `#EEF1F9` | 选择器 |
| `--dsw-alias-markdown-code-block` | codeWell | `#EDF0F6` | 代码块 |
| `--dsw-alias-markdown-inline-code` | codeWell | `#EDF0F6` | 行内代码 |
| `--dsw-alias-scrollbar-bg-l1` | mistHigh | `#E7EBF4` | 滚动条 |
| `--dsw-alias-scrollbar-hover-l1` | mistHighest | `#DFE4EE` | 滚动条悬停 |

`--dsw-alias-interactive-bg-hover` 与 `-active` 用 `color-mix(in srgb, var(--dsw-alias-brand-primary) 7%/14%, transparent)`——把交互反馈绑定到主色，这样**六套配色共享同一份 CSS**，不需要各写一遍。

#### 浅色侧没有第五级（实测约束，不是取舍）

DSH Go 只给 4 级文字色（ink / inkMuted / inkFaint / inkGhost），官方有 5 个文字 token。要对上就得在 `inkFaint`(5.00:1) 与 `inkGhost`(2.24:1) 之间插一个值。实测：

| 插值 | 结果 | 对 mist | 可用 |
|---|---|---|---|
| t=0.25 | `#737882` | **4.02** | ❌ 跌破 AA |
| t=0.30 | `#767B85` | 3.86 | ❌ |
| t=0.40 | `#7C818A` | 3.55 | ❌ |

**浅色背景的对比度衰减比深色快得多**：任何明显暗于 `inkFaint` 的值立刻跌破 4.5。

所以浅色侧 `tertiary` 与 `caption` **只能同色**。视觉上是「4 级 + 装饰级」，不影响功能。对比之下深色侧有空间（§6.2 用了插值）。

### 6.1.1 ⚠️ brand-primary 的语义反转（必须处理）

官方 `--dsw-alias-brand-primary` **不是蓝色**：

```
浅色  = var(--dsw-static-neutral-bluish-1000) = #0f1115   ← 近黑
深色  = var(--dsw-static-neutral-bluish-50)   = #f9fafb   ← 近白
```

也就是说，官方的主按钮、品牌色**本来就是「黑白反色」**，蓝色只出现在 `--dsw-alias-brand-primary-new-colorprimary-new-color`（`#4176e6`，那个名字重复的 token）和 `--dsw-alias-button-info-fill`（deepseek-500）里。

DSH Go 恰恰相反：主按钮是 `seed`（蓝/青/紫），不是黑白。所以映射到 `brand-primary` 是**正确且必要的**，但必须清楚这是**主动改变官方品牌色语义**：

- 官方：主按钮 = 黑白，代表"确定 / 主要动作"
- DSH Go：主按钮 = 配色主色，代表同一件事，但用彩色

这与 §0 原则 4（强调色 ≤5%）**不矛盾**——DSH Go 里主按钮确实是唯一大面积上色的地方。

**连带影响**：`--dsw-alias-button-primary-fill` 官方等于 `var(--dsw-alias-brand-primary)`，所以改 brand-primary 会自动改主按钮，无需重复覆盖。但 `--dsw-alias-button-primary-hover` **官方写死为 `neutral-bluish-750`**，不跟随，必须单独覆盖为 `pressed` / `pressedDark`。

### 6.1.2 ⚠️ 描边必须用 alpha，不能用实体灰

官方 `--dsw-alias-border-l1`…`l4` 是 **alpha 黑/白**：

| token | 浅色 | 深色 |
|---|---|---|
| l1 | `#0000000a` (4%) | `#ffffff0f` (6%) |
| l2 | `#0000001a` (10%) | `#ffffff1f` (12%) |
| l3 | `#0000001f` (12%) | `#ffffff29` (16%) |
| l4 | `#00000029` (16%) | `#fff3` (20%) |

DSH Go 的 `ruleLight`（`#DCE0E8`）与 `ruleDark`（`#343841`）是**实体灰**，两套值不同。若直接把实体色塞进 l1，会出现两个问题：

1. 描边叠在玻璃/渐变上时**不透背景**，视觉发死（DSH Go 是 Flutter 里叠在纯色面上的，DOM 里背景是渐变+光晕）
2. 深色模式下实体灰 `#343841` 与 `night` `#1C1F28` 的对比是"可见的灰线"，而官方 alpha 白是"柔和提亮"——观感不同

**正确做法**：把 DSH Go 的**相对强度**换算成 alpha，而不是抄 hex。实测对照：

| 层级 | 官方 alpha（浅） | 建议 DSH Go 主题 alpha（浅） | 理由 |
|---|---|---|---|
| l1 发丝 | 4% | **8%** | DSH Go 的线更明确（原则 2「细线是骨架」） |
| l2 | 10% | 12% | 保持层级差 |
| l3 交互边界 | 12% | **25%** | DSH Go `outlineLight` 锚定 ≥3:1，需要更高 alpha |
| l4 | 16% | 30% | 最强 |

深色侧同理，用白色 alpha：l1 6%→9%、l2 12%→15%、l3 16%→28%、l4 20%→34%。

> 这些数值需要用实际截图微调，**不是最终值**。写入实现时以 `docs/visual-spec.md` 为准并同步回填实测结果。

### 6.2 深色（以雾蓝为例）

| 官方 token | 取值来源 | 值 | 理由 |
|---|---|---|---|
| `--dsw-alias-bg-base` | night | `#1C1F28` | 深色画布底 |
| `--dsw-alias-bg-layer-1` | nightLow | `#232730` | 第一层亮面 |
| `--dsw-alias-bg-layer-2` | nightContainer | `#272C36` | 嵌套容器面 |
| `--dsw-alias-bg-layer-3` | nightHigh | `#2D323C` | 高层嵌套面 |
| `--dsw-alias-bg-overlay` | nightHighest | `#343944` | 浮层底 |
| `--dsw-alias-label-primary` | paper | `#E6E9F0` | 主文字（非纯白） |
| `--dsw-alias-label-secondary` | paperMuted | `#B6BBC5` | 次级文字 |
| `--dsw-alias-label-tertiary` | paperFaint | `#9A9EA9` | 三级文字 |
| `--dsw-alias-label-caption` | paperFaint↔paperGhost **插值 t=0.30** | `#8A8E98` | 深色侧有空间做第五级（**5.02:1**），与 tertiary 区分 |
| `--dsw-alias-label-dimmed` | paperGhost | `#656971` | 纯装饰/禁用才用 ghost（对 night **2.99:1**，不得承载信息） |
| `--dsw-alias-label-primary-foreground` | **onSeedDark** | `#121C34` | 深色主色按钮上的深墨字（≥ 7:1） |
| `--dsw-alias-border-l1` | `rgba(255,255,255,0.09)` | — | ⚠️ 对齐 §6.1.2：必须用白色 alpha，不能直接塞 `ruleDark` 实体灰 |
| `--dsw-alias-border-l2` | `rgba(255,255,255,0.15)` | — | 同上 |
| `--dsw-alias-border-l3` | `rgba(255,255,255,0.28)` | — | 交互边界（≥3:1） |
| `--dsw-alias-border-l4` | `rgba(255,255,255,0.34)` | — | 最强内描边 |
| `--dsw-alias-brand-primary` | seedDark | `#97B1F0` | 深色主色 |
| `--dsw-alias-brand-text` | paper | `#E6E9F0` | 品牌文字用暖白纸色 |
| `--dsw-alias-button-primary-fill` | seedDark | `#97B1F0` | 主按钮 |
| `--dsw-alias-button-primary-hover` | pressedDark | `#859EDC` | 按下态 |
| `--dsw-alias-state-business-primary` | seedDark | `#97B1F0` | 业务状态色（兼焦点环回退源） |
| `--dsw-alias-state-business-tertiary` | containerDark | `#2E3C5F` | 业务状态深底 |
| `--dsw-alias-interactive-bg-hover` | `color-mix(in srgb, var(--dsw-alias-brand-primary) 10%, transparent)` | — | 深色通用悬停反馈 |
| `--dsw-alias-interactive-bg-active` | `color-mix(in srgb, var(--dsw-alias-brand-primary) 18%, transparent)` | — | 深色通用按下反馈 |
| `--dsw-specific-bubble` | bubbleDark | `#293144` | 用户气泡 |
| `--dsw-specific-bubble-highlight` | containerDark | `#2E3C5F` | 气泡高亮 |
| `--dsw-specific-input-major` | nightLow | `#232730` | 输入框底 |
| `--dsw-specific-sidebar-fill` | nightLowest | `#14171E` | 侧栏底 |
| `--dsw-specific-sidebar-nav-item-active` | nightHigh | `#2D323C` | 侧栏选中行底 |
| `--dsw-specific-sidebar-nav-item-active-accent` | containerDark | `#2E3C5F` | 侧栏选中行强调色 |
| `--dsw-specific-selector` | nightContainer | `#272C36` | 选择器底 |
| `--dsw-alias-markdown-code-block` | codeWellDark | `#14171E` | 代码块 |
| `--dsw-alias-markdown-inline-code` | codeWellDark | `#14171E` | 行内代码 |
| `--dsw-alias-scrollbar-bg-l1` | nightHigh | `#2D323C` | 滚动条 |
| `--dsw-alias-scrollbar-hover-l1` | nightHighest | `#343944` | 滚动条悬停 |

> 📐 **caption 的生成规则（六套通用，别手抄 hex）**：
> `caption = mix(paperFaint, paperGhost, 0.30)`，逐配色计算。实测六套结果为
> `#8A8E98` / `#879096` / `#8F8C96` / `#879190` / `#928D87` / `#8D8E91`，
> 对各自 `night` 的对比度 **4.98–5.06**，全部 ≥ 4.5；同时与 tertiary（6.09–6.18）保持约 1.1 倍差距。
> 实现时放进 `tools/derive-tokens.py`，不要硬编码。

> ⚠️ **深色主按钮上的文字必须用 `onSeedDark`（深墨）而不是白色**。这是 DSH Go 的明确规则（`accent.dart:30`「深色主色上用同色相的深墨字（≥ 7）」）。实测 onSeedDark/seedDark 对比度 7.91–14.05，全部达标。
>
> **官方已有对应 token**：`--dsw-alias-label-primary-foreground` 浅色是 `neutral-bluish-00`（白）、深色是 `neutral-bluish-1000`（黑）——语义正是「主色之上的前景色」。映射到 `onSeedDark` 即可，**不需要**在组件里写死前景色。
> 仍待阶段 2 实测确认：官方主按钮组件是否真的读这个 token，还是硬编码 `#fff`。若硬编码，需局部 CSS 覆盖（风险 R7）。

### 6.3 已知的语义错配（必须记录）

| DSH Go 概念 | 语义 | 官方最接近的 token | 错配点 |
|---|---|---|---|
| `dusk` / `duskLift`（暮紫） | 「智能体在**规划**」——计划、目标、子代理 | `--dsw-alias-state-done-primary`（violet，表示**已完成**） | 语义不同：规划 ≠ 完成。**不要**硬套，否则"正在规划"会被读成"已完成" |
| `state-warn-*`（琥珀） | 官方用它表示警告 | DSH Go 的 amber 是**一套配色**，不是警告色 | 配色切换时**不得**动状态色，否则语义漂移 |
| `toast-bg` / `tooltip-bg` | 官方是深色反色块 | DSH Go 没有 toast/tooltip 的独立材质 | 保留官方值，只微调色相 |

**处理方式**：`dusk` 不映射到任何官方状态 token，只在自有 CSS 里用于"计划/目标"相关的局部装饰。状态色（error / success / warn / idle）**全部保留官方值不动**——这是可访问性与一致性的底线。

---

## 7. 材质：四层玻璃

DSH Go 把玻璃分四档，**只有两档真模糊**：

| 层级 | 用在哪 | 模糊 σ | 填充（浅色） | 发丝线 | 顶边高光 |
|---|---|---|---|---|---|
| `chrome` | 顶栏胶囊、圆钮、输入条、底栏 | 18 | `rgba(255,255,255,0.70)` | `rgba(11,21,45,0.08)` | `rgba(255,255,255,0.85)` |
| `sheet` | 底部弹层、菜单、抽屉 | 24 | `rgba(246,249,254,0.82)` | `rgba(11,21,45,0.07)` | `rgba(255,255,255,0.90)` |
| `card` | 设置卡、审批卡、工具组 | **0** | `rgba(255,255,255,0.62)` | `rgba(11,21,45,0.06)` | `rgba(255,255,255,0.70)` |
| `pill` | 思考胶囊、模型胶囊、状态 chip | **0** | `rgba(255,255,255,0.55)` | `rgba(11,21,45,0.07)` | `rgba(255,255,255,0.75)` |

深色对应：`chrome` 填充 `rgba(41,46,57,0.72)`、模糊 18、饱和 1.2；`sheet` 填充 `rgba(35,40,50,0.86)`、模糊 24；`card` 填充 `rgba(255,255,255,0.05)`；`pill` 填充 `rgba(255,255,255,0.06)`。

原文：`surfaces.dart:159-260`。

**为什么 card/pill 不模糊**（`surfaces.dart:17-19`）：

> 「只有 chrome / sheet 真模糊：它们背后是会滚动的内容，模糊才有意义；card / pill 背后只是静态渐变，半透明白（或白光）就已经读作'磨砂'，再上 `BackdropFilter` 只是白白烧 GPU（列表里几十个就是几十次模糊）。」

**这条对 Web 端更重要**：`backdrop-filter` 在 Chromium 里会创建合成层，几十个卡片同时模糊会显著掉帧。

### CSS 实现要点

```css
/* chrome：真模糊 */
body[data-dsh-go-theme] [data-dsh-chrome] {
  background: rgba(255, 255, 255, 0.70);
  backdrop-filter: blur(18px) saturate(1.3);
  box-shadow:
    inset 0 0 0 0.5px rgba(11, 21, 45, 0.08),
    inset 0 1px 0 rgba(255, 255, 255, 0.85),
    0 8px 24px rgba(11, 21, 45, 0.08),
    0 1px 3px rgba(11, 21, 45, 0.05);
}
/* 降级：不支持 backdrop-filter 或用户要求减少透明 */
@supports not (backdrop-filter: blur(1px)) { /* → fallbackFill */ }
@media (prefers-reduced-transparency: reduce) { /* → fallbackFill */ }
```

**必须实现的降级**（`glass.dart:29-32`、`surfaces.dart:39-41`）：
- `@supports not (backdrop-filter: blur(1px))` → 用 `fallbackFill`（近乎不透明）
- `prefers-reduced-transparency: reduce` → 同上

上游源码里还有第三条：「设置里也可以关掉」。本项目**不提供**应用内开关——实测它换掉的四样东西
（card / sheet / pill 三档填充与输入条底座模糊）都压在近白页面上，开与关的像素差最大 3/255，
看不见；而真正有透明感的浮层用的是宿主的 `--dsw-menu-surface-fill`，本就与这个开关无关。
细节见 `docs/architecture.md` §13。

`fallbackFill` 必须是**接近不透明**的值，否则没有模糊时背后的文字会透出来干扰阅读（源码原文：「必须接近不透明，否则没有模糊时背后的字会透出来干扰阅读」）。

### 页面渐变与光晕（T2.2 · 已实测落地）

`body` 上三层 `background-image`，取值**全部是 `--dsh-go-*` 变量**——变量由 `src/client/tokens.ts` 随 token 层一起写入：

```css
body[data-dsh-go-theme] {
  background-color: var(--dsh-go-page-base);   /* 不透明兜底 = 调色板页面色 */
  background-image:
    radial-gradient(120% 80% at 100% 0%, var(--dsh-go-glow), transparent 70%),   /* 右上主色光晕 */
    radial-gradient(100% 70% at 0% 100%, var(--dsh-go-haze), transparent 70%),   /* 左下邻近光晕 */
    linear-gradient(to bottom, var(--dsh-go-page-top), var(--dsh-go-page-bottom));
  background-repeat: no-repeat;
  background-attachment: fixed;
}
```

光晕来源：`surfaces.dart:166-168`（`glowPrimary = accent.glow @ 42%`、`glowSecondary = accent.haze @ 38%`；深色 28% / 24%）。

| 变量 | 雾蓝浅色 | 雾蓝深色 | 说明 |
|---|---|---|---|
| `--dsh-go-page-base` | `#F0F4FD`（mist） | `#1C1F28`（night） | 不透明兜底；也是 `bg-base` 改半透明之前的原值 |
| `--dsh-go-page-top` | `#EBF1FE`（mistTop） | `#1D222C`（nightTop） | 渐变起点 |
| `--dsh-go-page-bottom` | `#F6F7FC`（mistBottom） | `#1B1C23`（nightBottom） | 渐变终点 |
| `--dsh-go-glow` | `rgba(171,195,252,0.42)` | `rgba(81,103,157,0.28)` | 主色光晕，**alpha 已预乘** |
| `--dsh-go-haze` | `rgba(213,203,235,0.38)` | `rgba(81,71,101,0.24)` | 邻近色光晕 |

**为什么 alpha 预乘、不在 CSS 里写 42%**：`color-mix(...)` 的百分比是常量，做不到「浅色 42%、深色 28%」。把强度折进变量，一份 CSS 就能同时服务两套明暗 × 六套配色。渐变停止点因此都是普通颜色，e2e 也能逐字比对。

**为什么这些变量走 token 层**：`overrideTokens` 的入参本来就是 `{light, dark}` 对，**由主题服务挑出当前明暗的那一半**写进 `body` 内联样式，卸载时同一个 disposer 一并清掉。于是 CSS 不需要判断明暗，也不需要第二处写 `body` 内联样式再配一套清理逻辑。代价是这 5 个名字进了 token 层——用 `--dsh-go-` 前缀与官方 `--dsw-*` 隔开，代码与校验器里是两张独立的表（`TOKEN_NAMES` 34 个官方 token / `MATERIAL_VARS` 5 个自有变量）。

#### 全屏接管面必须保持不透明（`aria-modal` 守卫）

`--dsw-alias-bg-base` 一旦半透明，**所有**读它的表面都会透。实测这类声明共 39 处，其中一处是登录用的全窗口 `PlatformOverlay`（`position:fixed; inset:0; z-index:1001`）——半透明的话聊天内容会从登录页后面透出来。该节点带 `role="dialog"` 与 `aria-modal="true"`，是**语义而非哈希类名**的钩子：

```css
body[data-dsh-go-theme] [role='dialog'][aria-modal='true'] {
  --dsw-alias-bg-base: var(--dsh-go-sheet-token);
}
```

只重绑变量、不改组件自己的 `background`：本来就自己画了底的弹窗不受影响，真正全窗口的那类拿回 sheet 档填充（T5.5 起是 `mistLow`@0.82 / `sheetDark`@0.86，不再是页面实色）。

#### 页面不透光层：从「两层半透明」到「干脆不画」（T2.7 → T5.5）

**T5.5 的结论与 T2.7 相反**：bg-base 不该带 alpha，它应该**完全不画**。理由不是审美，是实测——上游 DSH Go 的页面就是背景本身（`backdrop.dart:303-333`），内容直接铺在渐变上，中间没有第三层：

| token | 浅色 | 深色 | 说明 |
|---|---|---|---|
| `--dsw-alias-bg-base` | `transparent` | `transparent` | 页面即背景，不再叠一层雾 |
| `--dsw-specific-sidebar-fill` | `mistLow` @ 0.82 | `sheetDark` @ 0.86 | 侧栏是 sheet，不是页面 |

侧栏两个数**不是拟合出来的，是上游 `sheet` 档的原值**：`surfaces.dart:216-224` 写的是 `fill: mistLow @ 0.82` / `sheetDark @ 0.86`。把它们放到页面上，与上游自己的 golden（`app/test/shell/adaptive/goldens/wide_sidebar_{light,dark}.png`）的复现误差是 1.5 / 0.6 per 255。旧值 `mistLow`@0.40 / `nightLowest`@0.42 是错的——颜色错、alpha 也错，只是因为页面 wash 在替它兜底才没被发现。

**为什么必须改成 0**：旧实现叠两层 0.36，眼睛实际看到 0.59 的不透明罩子，把光晕和竖向渐变一起压到 41%。对上游 golden 复算，六套配色在右上角的最大色差 ΔE00 只有 15.75，而上游是 28.27 —— 这就是「六套配色看不出区别」的量化来源。改成 0 之后实测像素：

| 位置 | 上游 golden 实测 | 我们（T5.5 后） | 差 |
|---|---|---|---|
| 右上角（雾蓝） | `#D3E0FD` (211,224,253) | (211,224,253) | ΔE00 0.19 |
| 右上角（琥珀） | (237,221,204) | (237,221,203) | ΔE00 0.24 |
| 侧栏（雾蓝，浅） | (244,247,254) | (246,249,254) | ΔE00 ≈1 |
| 右上角（雾蓝，深） | (41,51,71) | (41,51,71) | 0 |
| 侧栏（雾蓝，深） | (35,39,50) | (35,39,50) | 0 |

#### 侧栏是一块玻璃，不是一个色块（T5.7 / T5.8）

**症状**（2026-11-03 实测，1524×903@2x，雾蓝浅色）：侧栏底板 `245,249,254` 与聊天区 `236,236,248` 在 **1 个像素**内直接相接——没有发丝、没有高光、没有圆角。桌面端还有第二条边：标题条（`--dsh-windows-titlebar-height` = 40px）是页面渐变，底板从 y=40 才开始，横向也是一步跳变。

**根因**：上游的 `sheet` 档是五件套（`surfaces.dart:216-224`）——fill / hairline / rim / blur / shadow——我们只抄了 fill。`glass.dart` 的绘制顺序是「模糊背后 → 半透明填充 → 发丝描边 + 顶边高光 → 形状**外**的投影」；圆角来自 `sessions_drawer.dart:198-203`，只圆右侧两角，左边贴窗口边。少了这四件，玻璃就读成了贴上去的色块。

**修法**（`material.module.css`）：

- 侧栏列（层 2）不再画填充——它的盒子会把圆角切方；形状交给侧栏根节点（层 3）。
- 根节点用 `--dsh-go-sheet-token` 画 0.82 的 sheet 填充 + `border-radius: 0 28px 28px 0` + `inset 0 0 0 .5px` 发丝（`border-l1`，对应上游 ink@0.07）+ `inset 0 1px 0` 顶边高光。
- 顺带修掉一处**重复绘制**：列与根节点各画一次同一个令牌，等效 alpha 0.968；只画一次之后底板 `245,249,254 → 244,246,253`，反而比原来更贴金标准的 `244,247,254`。

**平铺变体（T5.8，默认关闭）**：上游对两列是有意区别对待的，`adaptive_scaffold.dart` 的类注释原文是「The panel is a flat column on the page (not a card), set off from the chat by a hairline. The sidebar keeps the drawer's own glass.」。把右栏的语言搬到侧栏就是平铺：三处画填充全部关掉（列、根节点、会话列表末尾 24px 的淡入），只留一根 `border-l1` 发丝。实测侧栏 `235,235,248` 与聊天区同色，发丝像素 `220,220,234`。代价是与金标准的侧栏值不再一致，所以做成偏好、不做成默认。

**偏好**：`sidebarMaterial: 'sheet' | 'flat'`，默认 `sheet`；`body` 上**始终**带 `data-dsh-go-sidebar="<值>"`（属性常在，CSS 才能给两个状态都起名字），持久化在同一份 `localStorage` 偏好里，外部可用 `window.dispatchEvent(new CustomEvent('dsh-go-theme:sidebar-material', { detail: 'flat' }))` 驱动。设置入口在「设置 → 通用 → 侧栏材质」（`order: 11.7`）。

**还没做的**：sheet 档第五件「形状外的投影」——侧栏列 `overflow: hidden` 会把它裁掉，要做只能从聊天列一侧用 inset 阴影模拟；折叠成 rail 的窄态没有截图；深色（`sheetDark @ 0.86`）走同一路径但没有实测。

#### 浮层与磨砂底座：谁挡住谁的模糊（T5.9）

**症状**：在输入框里打 `/`、`@` 弹出的浮层是一块 58% 白的半透明面板，背后的正文清晰可读、不透不糊；把本插件关掉，同一浮层表现正常（宿主玻璃）。

**机制**：浮层渲染在输入条底座**里面**，而底座上有两样东西挡在它和页面之间：

1. 底座自己的 `backdrop-filter: blur(18px)`。`backdrop-filter` 会建立 backdrop root，子孙的模糊只能采样到这个根内部——浮层自带的 `blur(40px)` 因此采样不到页面，等于没有；
2. 底座那条渐隐底带（`::before`，36px 以下完全不透明的页面色），把浮层下半部分背后的内容整片盖平。

两者叠加，浮层只剩「半透明 + 无模糊」，读起来就是透字。**浮层自己的填充用的是宿主的 `--dsw-menu-surface-fill`，本主题不碰**；能被我们改的只有它背后那层底带的遮罩与底座模糊。

**修法**：只在底座里存在打开的浮层时让开——去掉底座模糊、隐藏底带，浮层一关立刻恢复磨砂。选择器 `[data-composer-seat]:has([data-menu-material])` 命中同一个底座，特异性与基础规则相同、靠源顺序胜出，不引入 `!important`。

**实测**（web 实例，Chromium）：

| 状态 | 底座 `backdrop-filter` | 底带 |
|---|---|---|
| 浮层关闭 | `blur(18px) saturate(1.3)` | `block` |
| 浮层打开 | `none` | `none` |

#### 光晕几何：圆，不是椭圆

`backdrop.dart:314-320` 画的是**圆**：半径 `0.62 × 最长边`，圆心 `(92%, 0)`，线性淡到 0；雾罩同理，`0.55 × 最长边`，圆心 `(0, 100%)`。CSS 里 `62vmax` 就是那个半径（`vmax` = 最长边），1280×800 下 793.6px，与 Dart 侧同一个数。

旧实现是 `120% 80% at 100% 0%` 且 70% 就淡完：纵向有效半径只有 448px，页面下半截一点颜色都没有。整页平均光晕 alpha 0.052，上游 0.084；页面正中上游还有 0.065，我们是 0。

几何只吃掉其中一半，剩下的全在 wash 上：

| 配置 | 六套配色最大 ΔE00（右上角） |
|---|---|
| 上游 DSH Go | 28.27 |
| 旧：椭圆 + wash 0.36×2 | 15.75 |
| 只修几何 | 16.38 |
| 几何 + wash 0.10 | 24.42 |
| **几何 + wash 归零（现状）** | **实测 26.4（采样点在 1270,6，非圆心）** |

#### 四档玻璃，数值全部取上游 `surfaces.dart:159-259`

| 档 | 浅色填充 | 深色填充 | 降级填充（近不透明） | 模糊 |
|---|---|---|---|---|
| chrome | 白 0.70 | `smoke` 0.72 | `mistLowest` 0.96 / `smoke` 0.97 | 18px, saturate 1.3 / 1.2 |
| sheet | `mistLow` 0.82 | `sheetDark` 0.86 | 同色实体 | 24px, saturate 1.4 / 1.2 |
| card | 白 0.62 | 白 0.05 | 白 0.72 / 0.06 | 无 |
| pill | 白 0.55 | 白 0.06 | 白 0.66 / 0.07 | 无 |

**浅色玻璃是纯白**：换了配色玻璃还是玻璃（`surfaces.dart:157-158`），只有它底下的页面变。旧实现浅色用 `mistLowest`@0.70，颜色差一点点，alpha 一致。

**卡片填充换了之后才看得见**：旧实现卡片读 bg-base（mist 0.36），压在同样偏 mist 的页面上，与页面的 ΔE00 只有 **0.71** —— 等于没有卡片。上游 card 档（白 0.62）对页面是 **5.04**，差 7 倍。这是「界面发平」的第二个来源，与光晕无关。

**降级路径**：两条（`@supports not (backdrop-filter)` / `prefers-reduced-transparency`），每条同时改四个东西——`--dsh-go-glass-fill`、`--dsh-go-glass-blur`、`--dsh-go-veil-mask`，以及 card / sheet / pill 三档的 token 指针。侧栏的 sheet 填充走 `--dsh-go-sheet-token` 这一个指针，所以同一条降级会自动把它换成近不透明的 solid，不需要为它单写规则。实测同屏真模糊 1 → 0，输入条填充 0.70 → 0.96，正文对比度 15.17:1 → 15.27:1（不降反升）。

#### 输入条那条带子：重画背景，而不是填一个色（T5.5）

wash 归零后，官方那条 `linear-gradient(transparent, var(--dsw-alias-bg-base) 36px)` 变成 transparent→transparent，什么也不画。上游的解法是 `BackdropVeil`（`backdrop.dart:111-230`）：**在带子里重画同一张背景**，再把顶边羽化。我们用 `[data-composer-seat]::before` 复刻：同样的三层、同样 `background-attachment: fixed`、`mask-image` 0→1 走 36px。

必须是伪元素：直接给 seat 加 mask 会把里面的输入条卡片一起羽化。伪元素 `z-index: -1`，seat 本身已是层叠上下文（`position: sticky` + `z-index: 7`），所以它落在 seat 背景之上、卡片之下。实测 y 逐行扫描（列 x=300，跨过 mask 边界 y=672→708）：最大相邻差 **3/255**，没有硬边；`background-attachment` 实际解析为 `fixed, fixed, fixed`（seat 上的 `backdrop-filter` 没有把 fixed 背景改成相对 seat 解析）。

#### 接不住的四类

bg-base 归零后，靠它当填充的表面都要重新绑。宿主里有 24 处 `background: var(--dsw-alias-bg-base)`，其中页面级 / 遮罩级（15 处）透明正好；卡片级 9 处大多数能接语义钩子（`[data-disclosure-header]`、`[data-compaction-disclosure]`、`[data-schedule-*]`）。**剩下 4 处只有哈希类名**：cordis 业务卡、trajectory 工具目录条目、会话里的图片缩略图，以及 **AskQuestionCard**（提问卡；它是唯一一个既有 `bg-base` 填充又完全没有语义属性的卡片，确定会失去填充）。记在 README 已知限制里——接受这个缺口，不为此破例用哈希选择器。

> 订正（2026-11-03，按上游源码复核）：此前写成「要让工具行像 DSH Go 那样成卡」是误记——上游工具行**本来就是平面行**。`chat_rows.dart` 的 `toolGroupThreshold = 3` 把连续 ≥3 次调用收成一行摘要；单行外壳 `stream_row.dart:StreamRowFrame` 是 `minHeight 32` + 上下 4 + 左右 8 的 bleed + `InkWell` / `Squircle.border(sm)`，不画背景。玻璃卡 `ChatCard`（`GlassSurface(tier: card)`、圆角 20）只给审批 / 提问 / 改动 / 产物四种卡。宿主同为平面行（`[data-tool]` 根只有 `flex-direction:column`），所以 `[data-tool]` 上补背景是反方向改动；剩下的差异只有分组（上游连续 ≥3 次合并，宿主是整轮过程折叠）。

#### 桌面端多出来的那一层：窗口框底（T5.6）

网页端与桌面端不是同一棵树：Electron 给 `<html>` 加了 `data-windows-titlebar`，布局包据此把**整个窗口框**涂成侧栏令牌——

```
[data-windows-titlebar] .frame            { background: var(--dsw-specific-sidebar-fill) }
[data-windows-titlebar] .frame::before    { background: var(--dsw-specific-sidebar-fill) }  /* 拖拽条 */
[data-windows-titlebar] .centerCol        { background: var(--dsw-alias-bg-base) }         /* 已透明 */
```

本主题把该令牌映射成 sheet 档（`mistLow`@0.82 / `sheetDark`@0.86），所以整窗变成一层近不透明的雾，页面的光晕只剩 18%。**网页端没有这层包装**，这正是「浏览器验收值很好、装进应用却像没换配色」的原因：实测 1524×903@2x、雾蓝浅色、右上角 —— 网页 211,224,253，桌面 240,244,253（= 纯页面底色）。

修法（`material.module.css` 顶部）：只在 `html[data-windows-titlebar]` 下把那个窗口框及其 `::before` 的背景改回 `transparent`，把底交还给页面渐变；侧栏列自己就画同一个令牌，不受影响。结构钩子不碰哈希类名：窗口框 = `[data-slot='root']` 的子元素中**含有 `[data-slot='sidebar']`** 的那一个。修后桌面模式下右上角回到 211,224,253，拖拽条也跟着露出页面渐变（原来是一条纯色横带）。

#### card / pill 与统一的高度配方（T2.4 + T2.5）

**两档都不模糊**：背后是静态的页面渐变，不是滚动内容（`surfaces.dart:17-19`）。三件套 = 半透明填充 + 0.5px 发丝线 + 1px 顶边高光。

| 档 | 落在哪 | 填充 | 实现 |
|---|---|---|---|
| card | 用户气泡、Markdown 代码块、工具行内嵌的提问卡、披露头 | `--dsh-go-card-fill`（白 0.62 / 0.05）；气泡与代码块仍用各自的语义 token | 只补 `inset` 发丝线 + 顶边高光 |
| pill | composer 里的模型胶囊 | `--dsh-go-pill-fill`（白 0.55 / 0.06） | 填充 + 发丝线 + 高光 |
> **T2.4 当时以为 card 的填充是"免费"的**（凡是画 `--dsw-alias-bg-base` 的卡片自然半透明），这个判断在 T5.5 被推翻：那层 0.36 的 mist 压在同样偏 mist 的页面上，卡片与页面只差 ΔE00 0.71，等于没有卡片。现在 card 档有自己的填充 `--dsh-go-card-fill`（白 0.62 / 0.05），与页面的差是 5.04。

**T2.5：一条高度配方覆盖所有官方浮层。** `--dsw-elevation-*` 我们在**自己的作用域**上重绑（`body[data-dsh-go-theme], body[data-dsh-go-theme] *`），给每档加顶边高光、把中性黑的环境阴影换成调色板的冷墨：

```css
--dsw-elevation-panel:
  var(--dsw-elevation-stroke),              /* 保留各组件自选的描边色 */
  inset 0 1px 0 var(--dsh-go-highlight),    /* DSH Go 的顶边高光 */
  0 2px 8px var(--dsh-go-shadow);           /* 冷墨，7%（浅）/ 45%（深） */
```

- **为什么必须在作用域上重绑**：官方把 4 个 `--dsw-elevation-*` 声明在 `body, body *`，只写 `body` 是**静默失效**（§8.1 R1）。改完后实测解析成我们的配方，覆盖约 15 个包里的 30 处消费点。
- **描边色不动**：`--dsw-elevation-stroke-color` 的默认值来自 `border-l4`/`border-l3`，已经是我们的 alpha；部分组件（日程、会话、user-questions 等）自己挑 l1/l2/l3 —— 也都是我们的 alpha。所以"高层级表面描边更清晰一档"是**配色层已经给的**，T2.5 只需不破坏它。
- **高光与阴影各一个变量**：`--dsh-go-highlight`（白，浅 0.55 / 深 0.10）、`--dsh-go-shadow`（冷墨，浅 7% / 深 45%）。深色高光只留一点痕迹，否则暗色卡上的一条亮线读作"接缝"而不是"受光"。

##### 一个把规则变成空操作的坑

`material.module.css` 是 **CSS Modules** 文件，lightningcss 会把**每一个**类选择器都本地化成哈希。写 `.md-code-block` 编译出来是 `.xxxxx_md-code-block`，永远匹配不到真实节点——而且**不报错**（实测：气泡的发丝线生效，代码块的完全没有）。要用 `:global(.md-code-block)` 逃逸，编译后才是原样类名。同样地，模型胶囊的形状在 slot 内部的 `button` 上（8px 圆角），画在它的方形父盒上会露出四个直角。

> 已知未覆盖：底部统计条的小 pill（`epSpBW_pill` 这类）只有哈希类名，没有稳定钩子；它们目前是透明背景+圆角的文字块，观感与 pill 档接近，v1 不做。

**注意（两道 DOM/CSS 陷阱，已对 0.2.2 源码核实）**：

1. **陷阱 A：`[data-slot='...']` 全部是 `display: contents`**
   `dsh-client-ui-renderer/lib/client.js:1116-1126`（`SlotOutlet`）把所有 `[data-slot="..."]` 容器硬编码为内联 `style="display: contents"`。在 CSS 规范中，`display: contents` 不生成盒模型——**直接对 `[data-slot='sidebar']` 等选择器写 `background`、`border`、`border-radius` 或 `backdrop-filter` 100% 无效**。必须通过子代根元素（如 `[data-slot='sidebar'] > :first-child`）、父级列包装器（如 `[data-slot='root'] > div > :has(> [data-slot='sidebar'])`）或官方语义属性（`[data-composer-card]`、`[data-composer-seat]`、`[data-message-bubble]`、`[data-rightbar-col]`）命中真实盒节点。

   **实测全量确认（阶段 0）**：0.2.2 上 41 个 `[data-slot]` 元素、0.2.1 上 49 个，**全部** computed `display` 为 `contents`，无一例外。

2. **陷阱 B：`body` 之上确实有 5 层背景遮挡，但它们全部由 2 个 token 驱动**
   **阶段 0 实测（0.2.1 与 0.2.2 双版本）推翻了「必须逐层写选择器置透明」的早期判断。** 详见 `reference/phase0-findings.md`（内部底稿，未入库） §3。

   | 层 | 真实盒节点 | 驱动它的 token |
   |---|---|---|
   | 1 · AppFrame | `[id='root'] > div[data-slot='root'] > div` | `--dsw-alias-bg-base` |
   | 2 · SidebarCol | `[data-slot='root'] > div > :has(> [data-slot='sidebar'])` | `--dsw-specific-sidebar-fill`；**T5.7 起本层不再画**（见「侧栏是一块玻璃」） |
   | 3 · SidebarRoot | `[data-slot='sidebar'] > :first-child` | `--dsh-go-sheet-token`（原为 `--dsw-specific-sidebar-fill`，同一个值） |
   | 4 · ConversationRoot | `[data-slot='main.conversation'] > div` | `--dsw-alias-bg-base` |
   | 5 · ComposerSeat（仅 `[data-phase=active]`） | `[data-composer-seat]` | `--dsw-alias-bg-base`（36px 渐变的**终点色**） |

   因此：**把这两个 token 改成半透明值，5 层会一起透出，不需要写任何结构选择器。** 阶段 0 用 `rgba(255,255,255,0.30)` / `rgba(255,255,255,0.18)` 验证过「与 5 条选择器逐个 `background: transparent` 视觉等效」（对照图 `reference/phase0-assets/`）；T2.2 落地的取值改用调色板本色 + 校准过的 alpha，见上一节。

   ⚠️ **一处必须记下来的副作用**：这两个 token 同时被 39 处声明消费，其中包含全窗口接管面与 sticky 头部。前者已由 `aria-modal` 守卫处理；后者（消息流滚过时）目前会轻微透字，属于「还没有模糊」的中间态，T2.3 收口。

   ⚠️ **早期版本写的层 4 选择器 `[data-slot='main'] > :first-child` 是错的**：它命中的是 `[data-slot='main.conversation']` 这个 slot 包装层（`display: contents`、无盒、背景透明），真正的会话根是它的**下一个**子元素。若将来确实需要直选层 4，用 `[data-slot='main.conversation'] > div`。

   **结构选择器仍然保留，但只服务于「可选增强」**：给某一层单独加毛玻璃、单独换描边时才碰它。这类增强失败只降级为「没有毛玻璃」，不会让主题崩坏，所以不进正确性依赖、也不进验收硬条件。

   > 层 5 补充：`[data-composer-card]` 官方自带 `backdrop-filter: var(--dsw-menu-backdrop-filter)`，只要 `--dsw-alias-bg-base` 是半透明，输入框就能直接透出真模糊，无需额外处理。

---

## 8. 必须与禁止覆盖的 token

### 8.1 覆盖可达性：四个必须先懂的前提

`overrideTokens` **不校验 token 名**——源码 `validateOverrides`（`client.js:2185-2197`）只检查两件事：值不能是裸字符串、必须是 `{light, dark}` 对。没有白名单、没有前缀限制、没有值类型校验。

所以「能不能覆盖」不是问题。**「覆盖后有没有效果」才是。** 四类陷阱：

| # | 陷阱 | 机制 | 后果 |
|---|---|---|---|
| **R1** | **`body, body *` 上声明的变量不继承覆盖值** | `--dsw-elevation-stroke/panel/prominent/soft` 声明在 `body, body *`（`client.js:1482` rule#2），**每个元素各有一份自己的计算值**；而展示层只往 `body` 写内联（`ui-layout/lib/client.js:576-579`） | 覆盖这 4 个 = **静默失败，毫无效果** |
| **R2** | 两种色板都必须给值 | 单值直接抛 `TypeError` | 阴影/圆角这类与明暗无关的值也得写两遍 |
| **R3** | 整值替换，无回退链 | `composeActive` 里 `tokens[name] = modes[colorScheme]` 整体替换（`client.js:2125`） | 覆盖复合值时必须**自己重拼** `var(...)` 引用，否则丢掉被引用的部分 |
| **R4** | 组件就近声明压过 body | 组件在自己容器上重绑同名变量 | 往 body 覆盖这些**对具体组件无效**（例：`--dsh-chat-content-width` 被 `.body` 容器重绑） |

> ⚠️ **R1 推翻了一个直觉**：`--dsw-elevation-*` 看起来很适合用 token 调阴影，实际上通过 `overrideTokens` **完全无效**。要调高层级表面阴影，只能走自有 CSS（在具体元素上写 `box-shadow`，或用 `body[data-dsh-go-theme], body[data-dsh-go-theme] *` 重绑）。

### 8.2 必须覆盖（34 个：27 alias + 7 specific）

> **2026-11-02 运行时校验通过**：这 34 个全部在 0.2.2 运行时存在（0 个缺失、0 个被 `body *` 强制声明）。其中 **31 个是 A 级**（`overrideTokens` 完全可达），**3 个是 C 级** —— `--dsw-alias-button-primary-fill`、`--dsw-alias-button-primary-hover`、`--dsw-alias-interactive-bg-hover` 被 `.X_2TxG_dangerButton` / `.X_2TxG_danger` 重声明，**危险按钮与危险操作会保留官方红色**。这是正确行为（危险语义优于主题一致性），不要试图强行改掉。明细见 `reference/token-inventory-runtime.json`（内部底稿，未入库）。

| 分组 | token |
|---|---|
| 表面（5） | `bg-base`、`bg-layer-1`、`bg-layer-2`、`bg-layer-3`、`bg-overlay` |
| 文字（6） | `label-primary`、`label-secondary`、`label-tertiary`、`label-caption`、`label-dimmed`、`label-primary-foreground` |
| 描边（4） | `border-l1`、`border-l2`、`border-l3`、`border-l4` |
| 品牌/按钮（4） | `brand-primary`、`brand-text`、`button-primary-fill`、`button-primary-hover` |
| 业务/交互（4） | `state-business-primary`、`state-business-tertiary`、`interactive-bg-hover`、`interactive-bg-active` |
| 侧栏（3） | `specific-sidebar-fill`、`specific-sidebar-nav-item-active`、`specific-sidebar-nav-item-active-accent` |
| 气泡/输入（4） | `specific-bubble`、`specific-bubble-highlight`、`specific-input-major`、`specific-selector` |
| 代码（2） | `markdown-code-block`、`markdown-inline-code` |
| 滚动条（2） | `scrollbar-bg-l1`、`scrollbar-hover-l1` |

前缀规则：`specific-*` 为 `--dsw-specific-*`，其余全部为 `--dsw-alias-*`。完整证据见 `reference/token-audit.md`（内部底稿，未入库） §5.1。

**三条链式关系（直接影响怎么覆盖）**：

1. `--dsw-alias-button-primary-fill` 的值**就是** `var(--dsw-alias-brand-primary)`。要么两个都覆盖，要么让 `fill` 继续写 `var(--dsw-alias-brand-primary)` 以保持联动。
2. `--dsw-alias-border-l1..l4` 是**字面 alpha hex，不是色阶派生**。官方梯度实测：浅色 **3.9% / 10.2% / 12.2% / 16.1%**；深色 **5.9% / 12.2% / 16.1% / 20.0%**（深色整体高 2–4 个百分点，**不能复用浅色 alpha**）。所以 §6.1.2 的换算要按这个真实梯度校准。
3. `--dsw-specific-bubble` 浅色走 deepseek 色阶（50/200）、**深色走 neutral-bluish（850/750）**——说明气泡在深色下刻意不做品牌着色。要让两套配色都保持语气，light/dark 需各自映射。

### 8.3 禁止覆盖（会破坏功能或语义）

| token / 组 | 数量 | 为什么禁 |
|---|---|---|
| `--dsw-static-*` 全族 | 82 | 别名层大量取值是 `var(--dsw-static-*)`，改色阶会**连带改掉所有未被显式覆盖的 alias**，爆炸半径不可枚举 |
| `--dsw-elevation-stroke` / `-panel` / `-prominent` / `-soft` | 4 | **R1：覆盖静默无效**（`client.js:1482` rule#2 的 `body,body *`） |
| `--dsw-menu-surface-fill`、`--dsw-menu-backdrop-filter` | 2 | 官方原文「平台代码须保留这些 token 值」（`README.zh.md:55`） |
| `--dsw-alias-bg-mask-1`（模态遮罩） | 1 | 「模态遮罩保留黑色半透明填充，不模糊背景」——刻意的层叠契约 |
| `--dsw-alias-state-error/warn/success/idle/done-*` | 11 | 状态语义是 a11y 底线；`state-done-primary`（已完成）≠ DSH Go 的 `dusk`（规划）；且 0.2.1 无此 token |
| `--dsw-focus-ring-color` | 1 | 官方**故意不给默认值**，靠消费处回退到 `state-business-primary`；指针模态下还会被就近规则置 `transparent`（R4）。**要改焦点色请改 `state-business-primary`** |
| `--dsh-hairline-width` | 1 | 运行时按 DPR 计算并监听 `resolution` 重写，覆盖会被下次 DPR 变化清掉 |
| `--dsh-content-font-size` / `-code-` / `-terminal-` | 3 | 设置 UI 拥有（10–22 / 10–16 / 10–20），bootstrap 在脚本前就写入 |
| `--dsh-font-family-text` / `-code` / `-terminal` | 3 | 用户字体列表 |
| `--dsh-font-family-text-default` / `-code-default` | 2 | 内置字体栈本体，`--dsw-font-family` 的最终 fallback |
| `--dsh-chat-content-width` | 1 | **R4：覆盖无效**（组件在 `.body` 容器上重绑） |
| `--dsh-frame-*`、`--dsh-windows-*` | ~8 | 平台外壳几何（macOS 红绿灯、Windows 标题栏避让） |
| `--ds-transition-duration-*`、`--ds-ease-*` | 4 | 被侧栏/面板布局动画共用 |

### 8.4 灰名单（可覆盖但要谨慎）

| token | 风险 |
|---|---|
| `--dsw-shadow-lv1/lv2/lv3`、`-lv1-blur` | 声明在 `body`，可覆盖；但值是复合 shadow，**R3** 要求整值重写 |
| `--dsw-elevation-stroke-color` | 声明在 `body`，**可覆盖且有效**——这是调发丝线颜色的正确入口（4 个 `elevation-*` 本身不可覆盖） |
| `--dsw-radius-*` | 声明在 `:root`，可继承生效；但会全局改所有组件圆角（见 §1.1，v1 不用） |
| `--dsw-specific-menu` | 指向 `var(--dsw-menu-surface-fill)`，改了等于改菜单材质（禁） |
| `--shiki-token-*`（7 个硬编码 hex） | 可覆盖，但语法高亮配色牵动可读性，v1 不动 |
| `--dsh-scrollbar-thumb` / `-hover` / `-width` | 官方明示「滚动表面可重新绑定」，但要在**自己的容器**上重绑；`-width` 被 28 个消费方共用 |

### 8.5 版本差异约束（影响覆盖表）

两版 token 集合差异（详见 [`reference/token-inventory.md`](reference/token-inventory.md)）：

| 差异 | 处理 |
|---|---|
| `--dsw-alias-state-done-primary` **仅 0.2.2** | **不覆盖**。语义是「已完成」（violet），与 DSH Go 的 `dusk`（规划）不同；且在 0.2.1 上无效 |
| `--dsw-specific-sidebar-nav-item-hover` **仅 0.2.1** | **不覆盖**。0.2.2 已移除。侧栏悬停统一走 `--dsw-alias-interactive-bg-hover`，两版都生效 |
| 6 个 `--dsw-alias-illustration-*` **仅 0.2.2** | 可覆盖（装饰），但 0.2.1 上无效果，属可接受的冗余 |

> 覆盖一个当前版本不存在的 token **不报错也不生效**。所以策略是「覆盖两版交集的语义超集」：多覆盖无害，**但移除型差异必须避开**，否则会出现"旧版有反馈、新版没反馈"。

---

## 9. 响应式与桌面适配

DSH Go 是移动端优先，桌面端必须做**相反方向**的适配决策：

| 维度 | DSH Go（手机） | 桌面端应做 |
|---|---|---|
| 页面留白 gutter | 16 | **保持 16**（官方正文列已有内边距） |
| 阅读宽度 | 720 居中 | 保留官方 748，不改 |
| 侧栏宽度 | 258–326（clamp 20.2vw） | **不改**，官方 264–420 有拖拽记忆 |
| 圆角 | 触屏放大后 6/10/14/20/28 | **沿用**，桌面端 28 不显突兀（官方 panel 就是 28） |
| 玻璃模糊 | 同屏 ≤3 个真模糊 | 同屏 ≤3 个；侧栏与顶栏**只留一个**模糊层 |
| 动效时长 | 移动端触感 | 桌面端**缩短约 20%**（鼠标无触感反馈延迟） |
| hover 态 | 无（触屏） | **必须补**：官方有 `--dsw-alias-interactive-bg-hover`，DSH Go 没有对应设计 |

**hover 是必须新增的设计**，不是照搬。DSH Go 只有 `splashColor`（水波）与 `hoverColor: onSurface @ 4%`（`app_theme.dart:109-111`），桌面端需要更明确的指针反馈。建议值：`--dsw-alias-interactive-bg-hover` 用 `brand-primary @ 7%`、`-active` 用 14%（与 `orca-link` 的做法一致，且与官方 `interactive-bg-hover` 的量级吻合）。

---

## 10. 验收判据（可自动化）

| 判据 | 检查方式 |
|---|---|
| 六套配色 × 明暗 = 12 组状态都可切换 | Playwright 遍历 |
| 每组状态下正文对比度 ≥ 4.5:1 | 计算 `label-primary` 与 `bg-base` 的对比度 |
| 每组状态下主按钮文字对比度 ≥ 4.5:1 | 计算按钮前景/背景 |
| 关闭插件后所有 `--dsw-alias-*` 回到官方值 | `getComputedStyle` 快照 diff |
| 卸载后 body 无 `data-dsh-go-theme`、无残留 `<style data-plugin="...">` | DOM 断言 |
| `prefers-reduced-motion` 下无动画 | 媒体查询模拟 |
| `prefers-reduced-transparency` 下无 `backdrop-filter` | 同上 |
| 侧栏折叠 / 展开、右栏、设置弹窗、终端区无视觉断裂 | 截图基线对比 |

---

## 证据

| 结论 | 来源 |
|---|---|
| 五条设计原则 | `app/lib/ui/theme/app_theme.dart:60-67`、`palette.dart:22-27`、`motion.dart:5-11` |
| 形状/间距阶梯 | `shapes.dart:9-88` |
| 字阶 | `typography.dart:141-191` |
| 动效 | `motion.dart:13-37` |
| OKLCH 推导 | `oklch.dart:100-108`、`palette.dart:213-218, 294-295` |
| 六套配色 | `accent.dart:120-256` |
| 雾蓝浅/深中性色 | `palette.dart:35-88, 298-350` |
| 四层玻璃 | `surfaces.dart:159-260`、`glass.dart:10-36` |
| 官方 token 清单 | `dsh-client-ui-theme/lib/client.js` 的 `design_platform_css_default` |
| 官方已全局应用 corner-shape | `dsh-client-ui-theme/README.zh.md:88` |
| 官方禁改菜单 token | `dsh-client-ui-theme/README.zh.md:55` |
| 字号线由 DPR 计算 | `dsh-client-ui-theme/README.zh.md:64` |
| 列容器背景会盖住 body 渐变 | `dsh-client-ui-layout/lib/client.js:73` |

参考源码固定于提交 `ca3c4202f0110a9a10311034d532eafd9ee2e290`（`git ls-remote` 实测）。
