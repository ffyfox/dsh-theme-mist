# 变更日志

本项目的所有重要变更都记在这里。体例参考
[Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循
[语义化版本](https://semver.org/lang/zh-CN/)。

## [Unreleased]

尚未发布。以下为已完成、将随首个版本一并发布的内容。

### Added

- **主题令牌层**：以 34 个官方 `--dsw-*` 令牌的覆盖为核心。颜色、圆角、阴影、动效全部经由官方
  `ctx.theme.overrideTokens` 扩展点落地，不改动页面结构，不依赖任何哈希类名。
- **六套强调色**（雾蓝、黛青、暮紫、松石、琥珀、石墨）× 明暗两档 × 跟随系统。402 个色值由
  `tools/derive-tokens.py` 推导生成，`tools/check-palettes.mjs` 校验一致性，`palette.json`
  为唯一事实来源。
- **材质层**：页面五层遮挡改为 2 个令牌驱动的单层渐变光源；chrome 与 sheet 两档玻璃材质，全站只新增
  输入区 1 处真实模糊，菜单沿用官方既有模糊；卡片与胶囊的描边与高光（零模糊）；发丝线与阴影配方；
  圆角阶梯对齐；两处过渡。
- **降级路径**：`prefers-reduced-transparency`、`@supports (backdrop-filter)`、
  `@media (prefers-reduced-motion)` 三条独立降级，均实测生效。
- **「侧栏材质」偏好（`sheet` / `flat`）**：默认 `sheet` 是上游抽屉的玻璃（半透明白底、0.5px 发丝、
  顶边高光、右侧两角 28px 圆角）；`flat` 不画底板、页面渐变直接穿过去，只留一根发丝——那是上游
  右侧详情列的画法。设置入口在「设置 → 通用 → 侧栏材质」，也可用事件
  `dsh-theme-mist:sidebar-material` 驱动；`body` 上始终带 `data-dsh-theme-mist-sidebar` 属性，卸载时一并清掉。
- **设置入口**：「设置 → 通用」内新增「配色」行（`order: 11.5`，紧跟官方「外观」与「字号」），
  六套配色可在界面内切换，即时生效并持久化；中英文案经 `ctx.locale` 命名空间注册，
  切换界面语言时该行文案实时跟着变（无需刷新）。
- **配色选择器**：六个色块各显示该配色的 seed 主色与名称，色块随明暗自动取 `seed` / `seedDark`
  （经 `light-dark()`，跟随宿主在 `<html>` 上声明的 `color-scheme`）。选中态用「对勾 + 品牌色内描边
  + 品牌色浅底」三重表达，不单靠颜色。语义为 `role="radiogroup"` + `role="radio"` + `aria-checked`，
  整组只占一个 Tab 位，方向键在组内移动并跟随选中，Home / End 到两端。
- **能力探测与降级**：宿主没有 `ctx.theme.overrideTokens` 时不再抛错——只写自有的十五个 `--dsh-theme-mist-*`
  （`light-dark()` 对形式），官方令牌保持出厂值，作用域属性、设置行与偏好照旧，并记一条 warn。
  「官方令牌一个都不手写」这条由 e2e 断言守住。
- **卸载清洁度**：卸载后逐项复原——49 个令牌（34 官方 + 15 自有材质变量）的**计算值**、body 上整条
  内联声明（含优先级）、3 个作用域属性、作用域类名、3 个自注入 `<style>` 标签、任何带插件标记的节点，
  以及两个 window 监听器。唯一保留项是「配色 / 侧栏材质」这条偏好（有意为之：装回来时用户的选择
  还在）。`tools/e2e-uninstall.mjs` 在隔离实例上跑两轮挂载 → 卸载，并断言与基线逐字相同；
  `0.2.1-alpha.1` 与 `0.2.2-alpha.2` 两个客户端版本都跑过。
- **打包内容契约**：`tools/check-pack.mjs` 把 `npm pack --dry-run` 的清单变成 22 条断言——
  十个运行期必需项都在、十三条禁止规则一条不中（其中 `*.map` 会把整份 TypeScript 源码带进包，因为
  `sourcesContent` 里就是它）、文件数 ≤ 12、解包 ≤ 300 KB；清单字段也固定下来（`dsh.bundle.patch`、
  三项 `dsh.client.inject`、`engines.dsh`、宿主运行时只作 `peerDependencies`、`dependencies` 为空）。
  实测 9 个文件、22.6 KB 打包 / 69.3 KB 解包，无源码泄漏；脚本已进 `pnpm verify`。
- **许可与来源**：`LICENSE` 为 MIT；新增 `NOTICE`，写明设计参考 DSH Go（固定提交
  `ca3c4202f0110a9a10311034d532eafd9ee2e290`）、上游主题文件头注明部分设计源自 PiPilot（MIT，© 2026 CikeSeven）、
  OKLab/OKLCH 矩阵为 public domain，并声明「未复制任何 Dart 源码、不含任何品牌 / 吉祥物 / 展示图」以及本包
  非官方、与上游无关联。README「许可与来源」写同一组事实；`tools/check-pack.mjs` 加一条资产白名单断言——
  包里只允许 `icon.svg` 这一个图形文件。
- **README 与预览图**：六套配色的预览图由 `tools/preview-accents.mjs`（`pnpm preview:accents`）生成，
  不是手工截图；图取自全新 profile 的空状态，所以不含任何会话内容。README 补齐了支持版本（两版实测）、
  卸载行为（同时摘 `dependencies` 与 `dsh.profile.bundles`，实测）、已知限制（引架构 §6）与仓库结构。
- **工程与验证**：`pnpm verify` 串起构建、类型检查、单元测试与三个契约校验（配色一致性、令牌层、打包内容）；
  `tools/e2e-scenarios.mjs` 把主题推到折叠侧栏、设置弹窗、800px 宽度与 2x 显示四种边界。
  `tools/e2e-lifecycle.mjs` 覆盖安装 → 切换配色 → 卸载的完整生命周期；`tools/e2e-degraded.mjs`
  在真浏览器里验降级路径，`tools/e2e-dual-version.mjs` 把两个客户端版本拉起来逐字段 diff，
  `tools/e2e-uninstall.mjs` 做卸载审计。

### Changed

- **README 截图重拍（T5.14）**。旧图是 0.2.1 时代拍的空会话页，宿主升到 0.2.2-alpha.3 后侧栏、模型胶囊都对不上了，
  页面里也没有气泡、代码块、表格——主题七成的令牌没出镜。现在改成拍**一段真实渲染的演示对话**：脚本内置一个本地假模型
  服务，用 UI 真发一条消息，宿主自己画出用户气泡、代码块和表格，最后一行正好半压在毛玻璃输入框后面。六套配色图沿对角线
  合成：左上浅色、右下深色，一张图看全两种明暗。新增 `tools/preview-album.mjs`（`pnpm preview:album`），临时 home +
  `plugin add` 装本仓库，全程无真实会话、无账号信息。图片改为 WebP（2560×1600 @2x，q88）：单张 105–120 KB，
  11 张共约 1.1 MB，替换掉原来 1.9 MB 的六张 PNG。

- **页面与材质层按上游重做（T5.5）**。起因是「六套配色看不出区别」这一肉眼判断，查下来是真缺陷：
  (a) 光晕/雾罩画成了椭圆，而上游是半径 `0.62 × 最长边` 的圆（`backdrop.dart:303-333`），整页平均光晕
  alpha 只有 0.052，上游 0.084；(b) 页面上那层 `bg-base` wash 的注释写着「玻璃落地后要下调」，
  但从初始导入起一次没改，于是叠两层 0.59 不透明，把光晕与竖向渐变一起压到 41%。
  两条叠加的结果：六套配色在右上角的最大色差 ΔE00 15.75，上游 28.27。
  修法：`bg-base` 归零、几何改成 `circle 62vmax` / `circle 55vmax`、侧栏 `mistLow`@0.82 / `sheetDark`@0.86、
  四档玻璃按 `surfaces.dart:159-259` 取值（chrome 白 0.70 / sheet `mistLow` 0.82 / card 白 0.62 / pill 白 0.55，
  各配一个近不透明降级值），并把输入条那条带子改成重画背景（`BackdropVeil` 的 CSS 版）。
  修完实测与上游 golden 逐点对齐：右上角 (211,224,253)、深色 (41,51,71)、深色侧栏 (35,39,50) 全部相同。
  顺带发现两处同源问题：卡片填充与页面只差 ΔE00 0.71（等于没有卡片，上游 5.04）、侧栏填充颜色与 alpha 都不对。
  材质变量从 9 个增加到 15 个，令牌名总数 43 → 49。
- **名字定为 `dsh-Go-theme` / npm `dsh-go-theme`**。此前的 `@dsh-external/dsh-client-ui-theme-go` 是
  计划里随手起的占位名：DSH 文档没有这个约定，npm 上也没有这个 scope（同机上另一个 `@dsh-external/` 包同样是
  本地 `private: true` 的链接，同样 404）。发布到不属于自己的 scope 会在 `npm publish` 最后一步被拒。
  当时仓库名用 `dsh-Go-theme`，包名是全小写 `dsh-go-theme`——npm 从 2017 年起不接受新包名里的
  大写字母（`validate-npm-package-name` 对 `dsh-Go-theme` 报 “name can no longer contain capital letters”，
  对 `dsh-go-theme` 通过）。无 scope 也就顺带不需要 `publishConfig.access`。三个 e2e 脚本里的包名
  改从 `package.json` 读，以后改名只动两处。
- **改名为 `dsh-theme-mist`（2026-11-04）**。包名、仓库名与内部命名空间一起换掉：`dsh-go-theme` →
  `dsh-theme-mist`、`--dsh-go-*` → `--dsh-theme-mist-*`、`data-dsh-go-*` → `data-dsh-theme-mist-*`、
  事件 `dsh-go-theme:*` → `dsh-theme-mist:*`、存储键 `dsh.go-theme.preferences.v1` →
  `dsh.theme-mist.preferences.v1`、cordis 插件 id `ui-theme-go` → `dsh-theme-mist`。仓库里不再留旧名，
  唯一的例外是上游 Flutter 应用 `dsh-Go` 的引用——那是被移植的对象，不是本插件。
  未发布，所以不提供兼容层：没有旧包名、旧属性或旧存储键的迁移路径。装过旧版的 profile 要重新
  `dsh plugin add`（本机 `desktop` 与 `t1verify` 两个 profile 已同步重装，旧 `node_modules` 链接已清）。

### Fixed

- **新会话页输入框四周出现一条偏色的底带（T5.13）**。现象是「开始新对话时，输入框左右两侧与周围有明显边界，不是
  自然的渐变」，而 0.2.1 时代的截图没有。查实：T5.12 把底带改成「按视口尺寸绘制 + 右下对齐」，这只在 seat 贴底时
  等价于视口几何。新会话页的 seat 浮在页面中部（1512×982 实测 280,392 1225×238，底边 630 而视口 982），三层渐变
  整体上移 352px，取到的是页面更高处的颜色：右侧留白同一列相差 12/255、15/255、14/255，底边 y=630 上下是
  246,247,252 → 234,240,253，就是那条硬边。修法：按宿主自己的 `[data-phase='active']` 分档——贴底（会话）继续
  用视口尺寸 + 右下对齐，浮起（新会话）回到 `background-attachment: fixed`，与页面画布同一条声明。
  实测新会话页 ≤1/255（1512×982）、≤2/255（1280×800、2463×725），会话几何 ≤2/255。

- **桌面端的页面渐层被整窗一层雾盖住（T5.6）**。现象是「应用里配色几乎看不出变化，只有输入条周围有颜色」。
  查实：Electron 给 `<html>` 加了 `data-windows-titlebar`，布局包据此把整个窗口框
  （`[data-windows-titlebar] .frame`，以及它的 `::before` 拖拽条）涂成 `--dsw-specific-sidebar-fill`；
  而本主题把该令牌映射成 sheet 档 `mistLow`@0.82，于是整窗变成近不透明的薄雾，光晕只剩 18%。
  网页端没有这层包装，所以 T5.5 的验收（浏览器里到的 211,224,253）在应用里看不到。
  修法：只在 `html[data-windows-titlebar]` 下把窗口框（`[data-slot='root']` 里含侧栏槽的那一个子元素）及其
  `::before` 的背景交还给页面，侧栏列本身仍自行绘制同一令牌。
  实测 1524×903@2x、雾蓝浅色、右上角：修前 240,244,253（等于纯页面底色），修后 211,224,253（= 验收值）；
  网页端不加该属性时无变化。`tests/material.test.ts` 加了一条契约，防止这条规则被误删。

- **侧栏缺了玻璃的边（T5.7）**。现象是「左侧边栏偏白偏亮，和周围界限明显」。查实：侧栏的
  `mistLow`@0.82 取自上游 `sheet` 档，但那一档是五件套（fill / hairline / rim / blur / shadow）
  外加右侧两角 28px 圆角，本主题只抄了 fill，于是它读作一块贴在渐变上的白板——底板 245,249,254
  与聊天区 236,236,248 在 1 个像素内相接，中间没有发丝、没有高光、没有圆角。
  修法：侧栏列不再自己画填充（盒子会把圆角切方），形状交给侧栏根节点，补上发丝、顶边高光与
  右侧圆角；顺带去掉一处重复绘制（列与根节点各画一次同一令牌，等效 alpha 0.968），底板
  245,249,254 → 244,246,253，比原来更贴上游金标准的 244,247,254。

- **输入框上方弹出的浮层透出背后正文（T5.9）**。现象是「`/`、`@` 菜单是半透明面板，背后的字
  看得一清二楚，读起来费劲」，把本插件关掉则正常。查实：浮层渲染在输入条底座里面，而底座
  自己的 `backdrop-filter` 建立了 backdrop root（子孙的模糊只能采样根内部），加上底座那条
  36px 以下完全不透明的渐隐底带，把浮层自带的 `blur(40px)` 和背后的内容一起挡掉了。
  修法：只在底座里存在打开的浮层时让开——去掉底座模糊、隐藏底带，浮层一关立刻恢复磨砂。

- **输入框四周出现一条明显更深的带子（T5.12）**。现象是「DSH 更新到 0.2.2-alpha.3 之后，下方
  输入框周围的颜色明显变深」。查实：底带（`[data-composer-seat]::before`，T5.5 复刻的
  `BackdropVeil`）用 `background-attachment: fixed` 画页面那三层渐变，而 0.2.2-alpha.3 给
  `.root[data-phase=active] .composerSeat` 加了 `will-change: transform`（alpha.2 没有这条），
  底座因此成为 fixed 背景的包含块：渐变不再按视口（1524×903）展开，而是被压进底座盒子
  （1237×128），三层的颜色全部落错位置。实测同一行四个采样列，页面自身是
  237,235,248 / 238,237,248 / 252,252,254 / 241,243,252，修前是
  230,229,246 / 230,230,247 / 245,248,254 / **213,225,252**（最右端差 28/255）；alpha.2 上同一份
  CSS 是对的，把 alpha.3 的 `will-change` 覆盖掉也立刻恢复——所以问题出在这条新声明，不在配色。
  修法：不再依赖 fixed 参考系，改成把三层按视口尺寸绘制（`background-size: 100vw 100vh`）并对齐
  到底边与右边（`background-position: 100% 100%`），四个采样列在 alpha.2 与 alpha.3 上都与页面
  同色（≤1/255）。`tools/e2e-dual-version.mjs` 加了一条像素断言：把底座钉成真实会话的几何
  （贴右下、128px 高、layer-promoted）后，比对「有底带」与「隐藏底带」同一点的帧颜色，阈值
  4/255——修前 23/255 会红，修后 2/255；两个 shell 都测。

### Removed

- **「减少透明效果」开关（T5.10）**。它原本把 card / sheet / pill 三档换成实色填充、并关掉输入条
  底座的那一处模糊，实测却看不出区别：三档都压在近白页面上（页面色 235–254），62% / 70% / 82% / 96%
  的白叠出来落在同几个灰阶里——1524×903@2x、雾蓝浅色下侧栏最大像素差 3/255，消息与工具卡片区
  0/255，输入条最大 13/255 且只出现在 36px 淡出带内。真正有透明感的是宿主自己的浮层
  （58% 白 + `blur(40px)`），它用 `--dsw-menu-surface-fill` 绘制，本主题从不触碰，因此开关对它
  没有作用。开关连同 `data-dsh-theme-mist-reduce-material` 属性、`dsh-theme-mist:reduce-material` 事件、
  `reduceMaterial` 偏好字段、设置行与相关单测一并删除；`localStorage` 里残留的旧字段读取时忽略，
  不需要迁移。系统级的两条降级路径（`@supports not (backdrop-filter)`、
  `prefers-reduced-transparency`）保持不变。

### Notes

- 性能：玻璃层在滚动场景的 A/B 实测未测到代价（同机同 Chromium 交替跑，两个条件
  都顶到刷新率上限）。测的是 Chrome 而非 Electron、脚本滚动而非真实滚轮。
- 双版本渲染：`0.2.1-alpha.1` 与 `0.2.2-alpha.2` 各起隔离实例，用同一套探针比对 39 个令牌 ×
  明暗两档、六套配色、布局矩形与模糊清单，结果逐字一致，不需要版本分支；唯一差异是宿主自己的
  类名哈希。**桌面端窗口需要单独看**：它的窗口框会在页面之上多涂一层（见 Fixed 第一条），
  浏览器里的验收值不等于应用里的观感。打包元数据与许可文件仍在准备中（阶段 5）。
