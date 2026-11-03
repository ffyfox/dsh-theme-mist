# 架构：DSH Go 主题插件

本文回答一个问题：**「把 DSH Go 的视觉搬进 DSH 官方界面」在技术上究竟怎么做，哪些能做，哪些做不到。**

所有结论附证据（文件路径 + 行号 / 文档引用）。未核实的地方明确标注「未验证」。

---

## 1. 事实基线

### 1.1 两套 DSH 运行时并存

| 套件 | 版本 | 主题包位置 |
|---|---|---|
| 官方桌面端（当前会话宿主） | `@deepseek-ai/dsh-desktop-runtime` **0.2.2-alpha.2**，构建提交 `f3803c9` | `<桌面端安装目录>/resources/app/dsh/node_modules/@deepseek-ai/` |
| 全局 CLI + `dsh web` | `@deepseek-ai/dsh` **0.2.1-alpha.1** | `~/.npm-global/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/` |

**两套共用同一个 `DSH_HOME`（`~/.dsh`），但 profile 目录隔离**：桌面端用 `~/.dsh/profiles/desktop`，CLI 用 `~/.dsh/profiles/web`。

证据：
- `<桌面端安装目录>/resources/app/dsh/package.json:4` → `"version": "0.2.2-alpha.2"`
- `<桌面端安装目录>/resources/app/package.json:22` → `"dshBuildCommit": "f3803c96974ad4a94195fb97e5c637e9c2a3afe3"`
- `dsh --version` 实测输出 `0.2.1-alpha.1`

> ⚠️ 本机 `dsh-ops` 技能手册记录的基线是 0.2.1-alpha.1，**桌面端已前进到 0.2.2-alpha.2**。主题插件必须对两版都成立，见 §5。

### 1.2 桌面端与 Web 端是同一套客户端代码

桌面端**不是**一套独立的 UI。它启动同一个 `dsh-web-app` 运行时（`--port 0` 分配临时端口），再用 Electron 的 `BrowserWindow` 加载同一个前端产物，只是把 `/plugins/` 的缓存头改写成 `no-store`。

证据：
- `dsh-client-modules/README.zh.md:149`：「Desktop 转发器把每个 `/plugins/` 缓存头改写为 `no-store`」
- `dsh-client-modules/README.zh.md:12`：宿主半侧组合启动图，Web 载体通过 `/plugins` 提供 bundle，**由 shell 持有的载体则通过 `fetchBundle()` 分派完全相同的 bundle 响应**

**推论（本方案成立的根本原因）**：一个 `platform: "web"` 的客户端插件，只要能在 desktop profile 里被 Loader 装载，就能在桌面端渲染；Web 端装同一个包即可获得同样效果。**代码只写一份。**

### 1.3 客户端插件的加载链

```
package.json 的 dsh.client 声明
   ↓  (Node 半侧：ClientModuleRegistry 扫描已启用 Loader 条目)
window.__DSH_BOOT__ 启动图（WebBootEntry 行，< 已转义）
   ↓  (浏览器半侧：ClientModuleSystem，惰性 CJS)
bundle 执行 = 只注册 factory，不跑副作用
   ↓  (首次 import / 物化)
ctx = cordis context，插件 apply(ctx) 运行
   ↓
CSS 由构建注入 <style data-plugin="<pkg>" data-plugin-css="<pkg>/<file>">，
卸载时 Loader 按 data-plugin 移除
```

证据：
- `dsh-client-modules/README.zh.md:12`（概述）、`:34`（声明方式）、`:43`（惰性加载与 HMR）、`:56`（共享模块表）
- `dsh-client-modules/README.zh.md:78`：「每个模块主体副作用（包括 CSS 注入）都位于 factory 闭包中，在物化时运行」
- `dsh-client-modules/README.zh.md:94`：清理「回收模块自身样式」

**推论**：主题插件的全部副作用（DOM 属性、注入节点、样式、监听器、观察器）必须挂在 `ctx.effect()` 的清理函数上。否则热切换或卸载会留下脏状态。

---

## 2. 三层实现方案

主题由**三个相互独立、可单独取舍**的层组成。这是本方案最核心的设计。

```
┌──────────────────────────────────────────────────────────┐
│ L3  材质层   插件自有 CSS（backdrop-filter / 渐变 / 描边）  │ 可选，可关闭
├──────────────────────────────────────────────────────────┤
│ L2  令牌层   ctx.theme.overrideTokens()  ── 六套配色 × 明暗 │ 必选，官方 API
├──────────────────────────────────────────────────────────┤
│ L1  状态层   官方 ThemeRuntime（light/dark/system 持久化） │ 复用，不自建
└──────────────────────────────────────────────────────────┘
```

### L1：状态层——**复用官方，不自建**

DSH 官方 `@deepseek-ai/dsh-client-ui-theme` 已经提供并持久化：
- `light` / `dark` / `system` 三态偏好（写入 Host settings，跨浏览器共享）
- 正文字号 / 代码字号 / 终端字号
- 正文 / 代码 / 终端三套字体列表
- 首帧之前就把 `body[data-ds-dark-theme]` 与字号写到 document 上（避免闪烁）

证据：`dsh-client-ui-theme/README.zh.md:48`（插件前调色板）、`:47`（主题呈现器）、`:100-102`（偏好持久化）

**设计决策**：插件**不**注册自己的 `light`/`dark` 主题 id 去和官方抢状态。官方 `register()` 的注释明确写着「Duplicate id throws（single occupant per id；built-in pair counts；`system` is a preference, not a registrable id）」（`dsh-client-ui-theme/lib/client.js:2047-2056`）。

**关键陷阱**：如果在插件里注册 12 个主题 id（6 配色 × 明暗），用户选「跟随系统」时会解析到 `light`/`dark` 这两个**内置 id**，配色选择就丢了。这就是为什么不走 `register()`。

### L2：令牌层——`ctx.theme.overrideTokens()`

```ts
overrideTokens(
  source: string,                                   // 图层身份，用包名
  tokens: Record<string, { light: string; dark: string }>
): () => void                                       // 返回移除该层的 disposer
```

语义（源码 `dsh-client-ui-theme/lib/client.js:2073-2101`）：
- 叠加在**当前生效主题**之上，不替换基础主题
- 多层按 seq 顺序合成，后注册者逐 token 胜出
- 两层都要求 `{ light, dark }` 成对；**传裸字符串会抛 `TypeError`**（`:2186-2189`，错误文案会明确教你怎么写）
- 同名 source 再次调用会整层替换并重新排到最上层
- 移除该层后，被它覆盖的 token 恢复到下层

**这正好解决 §L1 的陷阱**：无论用户选的是浅色、深色还是跟随系统，overrideTokens 都只覆盖「颜色值」，不改「哪套主题生效」。跟随系统照常工作，配色选择也照常生效。

> ⚠️ 语义差异（必须写进实现注意）：`register()` 是「新增一个可选主题」，`overrideTokens()` 是「给当前主题换色」。我们要的是后者。

### L3：材质层——插件自有 CSS

需要 CSS 才能表达的、token 表达不了的东西：

| 效果 | CSS 手段 | 官方是否已有 |
|---|---|---|
| 页面竖向渐变纸面 | `body { background-image: linear-gradient(...) }` | 否，官方是纯色 `--dsw-alias-bg-base` |
| 角部光晕 | 伪元素 + radial-gradient | 否 |
| 真模糊玻璃（顶栏/输入条） | `backdrop-filter` | 部分：`--dsw-menu-backdrop-filter` 仅用于菜单 |
| 发丝描边 + 顶边高光 | `box-shadow` inset / 伪元素渐变 | 部分：`--dsw-elevation-stroke` 是 0.5px 描边 |
| 连续圆角（superellipse） | `corner-shape: superellipse(1.5)` | **是**，官方 `corner-shape.css` 已有全局兜底 |
| 动效节奏 | `--ds-transition-duration-*` / `--ds-ease-*` | 是，官方已发布 |

证据：`dsh-client-ui-theme/README.zh.md:88`（corner-shape 全局应用）、`:90`（elevation stroke 与 backdrop-filter）、`:55`（菜单材质 token）

**注意**：`corner-shape` 已经在官方样式表里对所有元素生效（同文档 `:88`：「通过通配选择器应用到所有元素及其 `::before`/`::after`」）。所以**"连续圆角"这一项主题插件不需要重做**，只需要设置正确的 `border-radius` 数值即可继承连续曲率。这是一个容易被误判为"必须自己实现"的点。

#### 已落地：页面渐变与表面透明化（T2.2 / T2.7）

两个实现决定值得记在这里，因为它们都偏离了「材质层只管 CSS」的直觉。推导、取值与像素证据见 [visual-spec.md](visual-spec.md) §7。

1. **渐变挂在 `body`，列容器用 token 变半透明**，不写任何结构选择器。阶段 0 的结论：`body` 之上那 5 层遮挡全部由 `--dsw-alias-bg-base` 与 `--dsw-specific-sidebar-fill` 驱动，改这两个 token 即可。
   副作用要认：两个 token 共 39 处消费声明，其中全窗口接管面（登录 / 引导）会因半透明而透出聊天内容。
2. **渐变的每个参数都是 `--dsh-go-*` 变量**，由 `tokens.ts` 随 token 层一起交给 `overrideTokens`。这是对 `overrideTokens` 的刻意扩展（它接受任意名字）：换来的是明暗由主题服务挑、卸载由同一个 disposer 收，CSS 里不需要判断明暗，也不需要第二份清理逻辑。官方 34 个 token（`TOKEN_NAMES`）与自有 5 个变量（`MATERIAL_VARS`）在代码与校验器里是两张独立的表。

配套守卫：`[role='dialog'][aria-modal='true']` 内把 `--dsw-alias-bg-base` 重绑回不透明页面色，只重绑变量、不改组件自己的 `background`。

---

## 3. 作用域与清理契约

### 3.1 作用域标记

插件在 `document.body` 上打一个自有属性：

```ts
body.dataset.dshGoTheme = ''          // → <body data-dsh-go-theme>
```

所有自有 CSS 一律以 `body[data-dsh-go-theme]` 为前缀。这不是风格问题，是**安全边界**：

- 卸载时属性一删，全部自有样式立刻失效
- 不会污染其他皮肤或官方组件
- 便于用 `document.body.hasAttribute(...)` 判断"哪个皮肤在生效"

这种做法在本机已有的第三方皮肤里被验证过（`orca-link` 用 `data-dsh-orca-link`，见 `skin.json:16` 的 `bodyAttr` 字段）。

#### 3.1.1 ⚠️ 与官方规范的一处张力（必须记录，不能装作不存在）

官方插件开发规范写着（`practices.md:36`，逐字）：

> 「Contribute through slots: `ctx.slots.inject(ownerKey, () => ctx.slots.register(...))`…
> **Do not write DOM outside your component or append to `document.body`.**」

而本方案要在 `body` 上打一个 `data-dsh-go-theme` 属性——**字面上违反了这条**。

**判断**：这条规范的适用对象是「贡献 UI 的业务插件」，不是「主题插件」。理由与取舍：

| 事实 | 说明 |
|---|---|
| 主题类插件本质上必须触及全局 | 官方自己的 `@deepseek-ai/dsh-client-ui-theme` 也向 `body` 写内联变量（`ui-layout/lib/client.js:568-576`）、向 `head` 注入 8 张样式表（`installThemeStyles`） |
| 但官方是「内核包」，我们是「外部插件」 | 不能用「官方也这么干」直接正当化 |
| **决定性取舍：不 append 任何节点** | 光晕与渐变用 `body` 的 `background-image` **纯 CSS** 实现，不创建装饰 DOM。这样唯一的全局写入就是 **1 个不可见属性** |
| 属性不参与布局 | `data-*` 属性无盒模型、无 a11y 语义、无渲染成本，是「作用域标记」而非「UI 注入」 |

**因此本方案的自我约束（写进验收）**：
1. **不向 `body` 或 `head` append 任何元素**（`<style>` 由构建预设的 `data-plugin` 机制注入，不是我们手动 append）
2. 全局 DOM 写入**仅限** `body` 上的 1 个 `data-dsh-go-theme` 属性
3. 设置界面走官方 slot，不自建挂载点
4. 若未来必须增补装饰节点，**改为通过 slot 组件渲染**并接受 React 生命周期管理，而不是 `document.body.append()`

> 📌 这条张力应在 README 与插件说明里对用户透明，不要隐藏。它是「主题插件」与「业务插件」规范适用范围不同的一个真实边界。

### 3.2 清理契约（**必须逐项还原**）

> ⚠️ **阶段 0 实测结论：`apply(ctx)` 的返回值不是 disposer。** 插件从 `apply` 里 `return () => {...}` 的清理函数**不会被调用**（实测停用后 `body` 属性与自建 DOM 节点全部残留）。清理**只能**通过 `ctx.effect(() => () => {...}, 'label')` 注册。orca-link 用的正是这种写法（`src/client/index.ts:250`）。
>
> 与之相对，插件注入的 `<style data-plugin="<id>">` 由宿主 `removeOwnedStyles(id)` 独立回收，**实测在插件完全不写删除逻辑时也生效**（1 → 0，样式效果同步消失）。

每个被修改的状态都要在 `ctx.effect()` 的 disposer 里还原到**修改前的精确值**，不是"删掉"完事。

参考 `orca-link/src/client/index.ts:250-292` 的做法：进入时先快照 `body.style.getPropertyValue(...)`，退出时用 `setProperty(原名, 原值)` 还原、原值为空串才 `removeProperty`。

必须覆盖的清理项：

| 资源 | 清理方式 |
|---|---|
| `body[data-dsh-go-theme]` | `delete body.dataset.dshGoTheme` |
| 注入的 DOM 节点（光晕层等） | `.remove()` |
| `MutationObserver` / `ResizeObserver` | `.disconnect()` |
| `setTimeout` / `requestAnimationFrame` | 逐个 `clearTimeout` / `cancelAnimationFrame` |
| `ctx.theme.overrideTokens()` 的返回 disposer | 调用它 |
| 自有 CSS | 由 Loader 按 `data-plugin` 自动回收，**不要手动删 `<style>`** |
| `matchMedia` 监听 | `removeEventListener` |

**反面案例**：直接 `body.style.setProperty('--dsw-alias-bg-base', ...)` 而不记录原值——这是错的。内联样式优先级高于样式表，卸载后不清就会永久污染。必须走 `overrideTokens()`，让官方去管理内联变量的生命周期。

**实测结论（T4.4，2026-11-02）**：隔离实例上「挂载 → 换一次配色 → 卸载」两轮，全部复原，可重跑的脚本是 `tools/e2e-uninstall.mjs`（23 条断言；单元侧是 `tests/uninstall-audit.test.ts` 的 9 条）。量到的数字：

| 项 | 挂载前 | 挂载后 | 卸载后 |
|---|---|---|---|
| body 内联声明 | 1 条（宿主自己写的 1 个令牌） | 44 条 | 1 条，值与优先级逐字相同 |
| 全站 `<style>` | 149 | 152（+3 张自有样式表） | 149 |
| 探测到的 `--dsw-*` / `--dsh-go-*` 计算值 | 基线 | 58 / 62 变化 | 与基线逐字相同 |
| 作用域属性 / 类名 / 标记节点 | 无 | 3 属性 + 1 类名 + 1 节点 | 全无 |

同一套断言在 0.2.2-alpha.2（桌面端自带的运行时，`--dsh` 指过去即可）上也跑过一遍：基线 body 内联 3 条 / 156 个 `<style>`，挂载后 46 条 / 159 个，卸载后回到 3 条 / 156 个，同样两轮零差异。数字不同只是因为宿主自己多写了两个令牌、多了几个样式表。

两个必须写下来的边界：

1. **自有 `<style>` 是宿主回收的，不是我们删的。** 三个模块样式表由构建产物在 factory 里注入，插件自己没有删除逻辑；实测卸载后从 152 回到 149，靠的是宿主的 `removeOwnedStyles`。这意味着**如果宿主某天不再回收，它会泄漏**——脚本里那条断言就是为了让这一天立刻显形。
2. **`localStorage['dsh.go-theme.preferences.v1']` 有意保留。** 配色与「减少透明效果」是用户的选择，不是插件的状态；装回来时应当还在。除此之外没有任何残留（监听器、属性、类名、变量全部清空）。

### 3.3 生命周期边界

| 事件 | 行为 |
|---|---|
| 插件启用 | `apply(ctx)` 运行，注册 token 层 + 注入 CSS + 打属性 |
| 插件停用 | 所有 `ctx.effect` disposer 逆序运行，状态还原 |
| 插件热更新（HMR） | 旧实例完整 dispose 后新实例 apply；**不能有状态残留** |
| 页面刷新 | 全部重建；需要持久化的偏好必须存在 `localStorage` 或 Host settings |

证据：`dsh-client-modules/README.zh.md:47`（「停用会移除条目，并在其异步 effect 完成清理后回收未使用的模块与样式。再次启用会加载一个带样式的实例」）

---

## 4. UI 扩展点

### 4.1 设置页入口（区分两个官方 Slot）

官方设置页有两个层级不同的扩展点，切勿混淆。已核实的证据：
- `settings.general.item`：官方主题包在 `dsh-client-ui-theme/lib/client.js:2336-2343`（外观，order 10）与 `:2344-2349`（字号，order 11）注册
- `settings.section`：`dsh-client-ui-settings-general/lib/client.js:1590-1599` 自带 `general` 分区，且**声明了 children**
- 槽位类型定义：同文件 `:1555-1558`（`settings.section` 为 `kind: "list"`, `scope: "root"`）

| Slot 名 | 位置与语义 | 官方已有项 | 适用形态 |
|---|---|---|---|
| **`settings.general.item`**（推荐首选） | 「设置 → 通用（General）」面板内的**设置行** | 外观（浅/深/跟随系统）`order: 10`、字号 `order: 11` | `order: 11.5`，紧跟在官方「外观」与「字号」下方——用户在同一页即可同时切换「浅色/深色/跟随系统」与「6 套 DSH Go 配色 + 减少透明效果」 |
| **`settings.section`**（备选） | 设置弹窗**左侧一级导航标签页** | 通用 `order: 0`、`skin-manager` `order: 115` | `order: 116`，作为左侧独立标签页紧跟在「皮肤管理」之后 |

```ts
export const inject = ['slots', 'theme', 'locale']

export function apply(ctx) {
  const t = ctx.locale.register(NS, { zh, en })

  // 方案 A（推荐）：嵌入「设置 → 通用」面板，紧跟官方「外观」(10) 与「字号」(11)
  ctx.slots.inject('settings.general.item', () => ctx.slots.register({
    name: 'settings.general.item',
    id: 'dsh-go-theme',
    order: 11.5,
    locale: NS,
    inject: () => ({ /* 配色列表、当前值、setAccent、reduceMaterial */ }),
  }, DshGoThemeGeneralRow))

  // 方案 B（备选，若做成左侧独立导航页）：
  // 必须 label: () => t('section.label') 且声明 locale: NS。
  // 依据：官方 general 分区自己就是这么写的（settings-general/lib/client.js:1594
  // 的 label: () => t("general.nav")），而 :1446 用 resolveSlotLabel(e.options.label)
  // 求值 —— 传静态字符串时切语言不会重算。
}
```

**实测记录（T3.1，2026-11-02）**：

T3.1 落地时逐行核对了在册项，发现**原计划的 `order: 12` 已被占用**——`transcript-view`（ui-chat）就是 12。渲染端按 `(a.order ?? 0) - (b.order ?? 0)` 排序，平局退回注册先后，所以撞号的落点是「看谁先激活」，不可依赖。

0.2.1-alpha.1 与 0.2.2-alpha.2 的在册 order **完全一致**：

| order | 条目 | 来源 |
|---|---|---|
| -20 | permission | permission-presets |
| 0 | language | locale |
| 10 | appearance | ui-theme |
| 11 | font-size | ui-theme |
| **11.5** | **本插件的配色行** | 本项目（T3.1/T3.2） |
| **11.6** | **本插件的「减少透明效果」开关** | 本项目（T3.4） |
| 12 | transcript-view | ui-chat |
| 15 | developer-tools | settings-general |
| 16 | shortcuts | shortcuts |
| 17 | link-opening | ui-chat |
| 20 | composer-enter | conversation |
| 30 | performance-usage | ui-chat |
| 90 | session-log | settings-session-log |
| 100 | current-version | settings-general |

取小数 `11.5` 而不是给现有条目重新编号：语义恰好是「紧贴字号之下」，且不动任何官方条目。0.2.1 上实测渲染顺序为 `#3 Font size → #4 配色 → #5 Work details`。

另两点实测：行容器带 `data-slot="settings.general.item"` 且 `display: contents`，**所有行都是它的子元素**（所以「第几行」要数它的 `children`，不是数 `[data-slot]` 节点）；末行底边由 `>:last-child{border-bottom:none}` 剥掉，因此行必须自画 `.5px solid var(--dsw-alias-border-l2)`。
另一点对主题插件有用的实测：宿主在 `<html>` 上写了 `style="color-scheme: light|dark;"`（由「跟随系统」解析后的结果，不是偏好值）。
这意味着**任何需要按明暗取不同颜色的插件 CSS 都不必自己监听 `theme/change`**：把一对值交给 CSS，用 `light-dark()` 让引擎按继承的 `color-scheme` 选。T3.2 的六个色块就是这样实现的（`--go-seed-light` / `--go-seed-dark` 内联在按钮上），既没有新增全局属性，也没有新增事件监听。

**控件自包含约束**（官方明文规定）：

出处：`@deepseek-ai/dsh-agent-preset/skills/cordis-plugin-development/references/practices.md:35`
（路径 `<桌面端安装目录>/resources/app/dsh/node_modules/@deepseek-ai/dsh-agent-preset/skills/cordis-plugin-development/references/practices.md`）。

原文要点（逐字）：
> 「Do not `require('@deepseek-ai/dsh-client-ui-primitives')` or load any other Harness Client package
> as a module; `dsh.client.inject` entries only order activation and stay allowed. They change without
> notice, a plain-JS plugin has no type check, and a throwing component blanks your slot entry…
> Write your own controls and match the host instead… Rename copied classes under your plugin's prefix,
> keep only `--dsw-alias-*` token references, and keep the behavior that users rely on, such as
> Modal focus and Escape handling, `role="switch"` with `aria-checked`, and Tooltip placement.」

三条可直接落地的结论：
1. **禁止**把任何 Harness Client 包当模块加载；`dsh.client.inject` 只排激活顺序，**仍然允许**（这两件事别混）。
2. 照抄宿主控件时，**类名要加自己的前缀**，只保留 `--dsw-alias-*` token 引用。
3. 必须保住用户依赖的行为：Modal 焦点与 Esc、`role="switch"` + `aria-checked`、Tooltip 定位。

构建期还有一道硬门禁佐证（社区脚手架预设，**非官方文件**）：
`orca-link/build/tsdown.client.ts:189-198` 的 `dsh-client-bundle-purity` 对不在 `CLIENT_EXTERNALS` 里的 `@deepseek-ai/*` 值导入直接抛 build error。

**locale 与图标**（官方明文规定）：

出处：同目录 `host-plugin.md:31-51`。要点：
- 插件管理器与设置页**在不激活插件**的前提下，从导出的 locale JSON 读 `meta.title` / `meta.description`，从导出的资源读图标。
- 文件形状：`{ "meta": { "title": "...", "description": "..." } }`（`host-plugin.md:40-42`）。
- 必须导出 `./locale/*.json` 与 `./icon`，且把 patch、locale、icon 与所有运行时文件都列进 `files`。
- 图标可为 SVG / PNG / JPEG / WebP，**≤ 256 KiB**，必须在包内（绝对路径、URL、越界软链被拒）。

宿主解析运行时（`dsh-app-boot/lib/index.js:2306-2337` 的 `readPluginMeta` + `:2258-2277` 的 `dictionariesOf`）有两条**会静默失效的硬规则**：

| 规则 | 证据 | 后果 |
|---|---|---|
| **`locale/en.json` 是目录锚点** | `:2310` 先求 `optionalResourcePath(`${specifier}/locale/en.json`)`；为 `undefined` 时 `dictionaries` 直接是空 Map | 没有 `en.json`，**整个 `locale/` 目录被跳过**，`zh.json` 写了也没用 |
| 文件名必须是合法语言 id | `:2264` `LANGUAGE_ID.test(language)` 失败即 `throw` | 文件名写成 `zh-CN.json` / `zh_CN.json` 会抛错而非静默 |

补充：缺失字段回退到 `package.json` 的 `name` / `description`（`:2314-2315`）；包根插件的顶层 `icon` 优先于 `./icon`（`:2292`）。

另外，UI 文案本身仍要走 `ctx.locale.register(ns, { zh, en })`，`zh` 与 `en` 两个基础 locale 必须齐全（`dsh-client-locale/README.zh.md:40`）——这与上面的静态元数据是**两套东西**，都要做。

### 4.2 偏好持久化

两个可选方案：

| 方案 | 位置 | 优点 | 缺点 | 结论 |
|---|---|---|---|---|
| Host settings | `ctx.configForms.get(entryId)` → `$DSH_HOME/cordis.patch.yml` | 官方推荐，跨浏览器共享，有 schema 校验 | 需要在 Node 半侧声明 settings entry 与 schema；复杂度高 | **v1 不用** |
| `localStorage` | 浏览器本地 | 简单，无 Node 半侧依赖 | 不跨浏览器/不跨设备 | **v1 采用** |
| 插件自有 JSON | `~/.dsh/dsh-go-theme/config.json` | 可控 | 要自己写路由与原子写 | 备选 |

**v1 决策**：`localStorage`，键 `dsh.go-theme.preferences.v1`，结构 `{ accent: 'mist', reduceMaterial: false }`。读取时逐字段做类型与取值白名单校验（未知 accent 回落 `mist`），对齐 `skin-manager/src/client/preferences.ts:45-70` 的规范化做法。

> ⚠️ 已知代价：`localStorage` 不跨设备。这与官方主题偏好（写 Host settings、跨已认证浏览器共享）不一致。记录在 [`docs/decisions/0002-preference-storage.md`](decisions/0002-preference-storage.md)，v2 再迁移到 `configForms`。

### 4.3 图标

官方 `ThemeDefinition.icons` 可以替换产品图标（映射 ui-primitives `ICON_SYMBOLS` 的 id），但有严格校验（`dsh-client-ui-theme/lib/client.js:2207-2226`）：

- 必须是合法 SVG 命名空间文档，带 `viewBox`
- **不得包含 `<style>` 或 `<script>`**
- 元素 `id` 必须以 `<symbol id>-` 开头
- 未知 id 直接抛 `TypeError`

**但这条路只有 `register()` 支持，`overrideTokens()` 不支持。**

**v1 决策**：**不做图标替换**。原因：
1. `register()` 会引入 §L1 的「跟随系统」缺陷
2. DSH Go 的图标是 Phosphor 子集（`app/pubspec.yaml` 的 `DshIcons` 字体），本质是字体，不是 SVG；网页端重现需要自绘整套 SVG，工作量远超主题本身
3. 官方文档明确「只有产品图标可替换；文件类型、插件、站点与品牌图稿仍渲染固定的内联 SVG」（`dsh-client-ui-theme/README.zh.md:139`）——即使做了也只能覆盖一部分

**v2 候选**：如果官方后续允许 `overrideTokens` 之外的方式叠加图标，再评估。

---

## 5. 版本适配层

插件必须在 **0.2.1-alpha.1（CLI）** 与 **0.2.2-alpha.2（桌面端）** 上都工作。

已核实两版**共同具备**的扩展点：
- `ctx.theme.overrideTokens(source, tokens)`：0.2.2 在 `:2089`，0.2.1 在 `:1474`
- `ctx.theme.register(definition)`：0.2.2 在 `:2057`，0.2.1 在 `:1446`
- `dsh.client` 声明 + `/plugins` 资源路由 + `__DSH_BOOT__`

已核实的**token 层差异**（用脚本解析两版 `design_platform_css_default` 得到）：

| 指标 | 0.2.2 | 0.2.1 |
|---|---|---|
| `--dsw-alias-*` | 108 | 101 |
| `--dsw-specific-*` | 10 | 11 |
| `--dsw-static-*` | 82 | 77 |
| **合计** | **202** | **191** |
| **共同 token 的值差异** | **0 处** | |

新增 12 个（0.2.2）：6 个 `illustration-*`、`state-done-primary`、5 个 static 色阶。
移除 1 个（0.2.2 不再有）：`--dsw-specific-sidebar-nav-item-hover`。

**这组数字对方案有三点直接意义**：

1. **共同 token 零值差异** → 同一份覆盖表在两版上产生**完全相同**的颜色，不需要版本分支
2. **移除型差异只有 1 个** → 侧栏悬停必须改用 `--dsw-alias-interactive-bg-hover`（两版都有），否则桌面端会缺 hover 反馈
3. **新增的 `state-done-primary` 不能用于 `dusk`** → 语义是「已完成」不是「规划」，且在 0.2.1 上无效

完整清单见 [`reference/token-inventory.md`](reference/token-inventory.md)。

### 5.1 覆盖 API 本身两版 100% 兼容

逐行比对两版 `ui-theme/lib/client.js`：

| 函数 | 0.2.2 | 0.2.1 | 差异 |
|---|---|---|---|
| `validateOverrides` | L2185 | L1540 | **逐字相同** |
| `composeActive` | L2122-2130 | L1506-1514 | **逐字相同** |
| `register()` 的图标替换 | 有 `validateIcons()` L2207 | **无**（原样入表） | 0.2.1 静默忽略 `icons` |
| presenter 字号变量 | text/code/terminal 三个（L530） | 只有 `--dsh-content-font-size`（L515） | 0.2.1 少两个 |
| presenter 字体族变量 | text/code/terminal 三个（L536） | **不存在** | 0.2.1 无 |

**所以不兼容的只有两件事：图标替换、字体族设置。** 而本方案两件都不做（见 §4.3 与 §6）。

### 5.2 版本适配层的最小实现

```
token 表全量下发（幂等，两版通用）
+ 2 个能力探测（icons / font-family，都只在 v2 需要）
```

具体判断：
- **7 个新增 alias**（6 个 `illustration-*` + `state-done-primary`）：0.2.1 无消费者，写入是**无害 no-op** → 不做探测
- **1 个删除的 specific**：0.2.2 无消费者 → 不写即可，不需要存在性探测
- **5 个新增 static**：只在 alias 内部被 `var()` 引用，插件不碰色阶 → 无关

其余非 token 差异：
- 0.2.2 的 `dsh.client.inject` 多了 `@deepseek-ai/dsh-client-shortcuts`（`package.json:36`）；0.2.1 没有
- **两版都导出 `./brand-font.css`**（`exports` 均含该字段）

**适配策略**：

```ts
// 能力探测，而不是版本号嗅探
const canOverride = typeof ctx.theme?.overrideTokens === 'function'
if (!canOverride) {
  // 降级：只用自有 CSS 打属性作用域，不覆盖 token
  ctx.logger?.warn?.('dsh-go-theme: theme service lacks overrideTokens; material layer only')
}
```

**不要**读 `ctx.theme` 的版本号做分支——官方没有暴露版本。用**能力探测 + try/catch**，这是唯一稳定的做法。

落地形态（T4.2）：探测与写入都在 `src/client/writer.ts`。宿主有 `overrideTokens` 时原样转发；没有时只写自有的十五个 `--dsh-go-*`（以 `light-dark(light, dark)` 对写入——`light-dark()` 按 `<html>` 上的 `color-scheme` 解析，所以不需要自己监听 `theme/change`），官方令牌一个都不碰，作用域属性、设置行与偏好照旧，并记一条 `ctx.logger.warn`。`ctx.theme` 的读取本身也包在 try/catch 里：未注入的服务一读就抛，能力探测不该把插件带下去。

**token 存在性**：`overrideTokens` 允许注册**任意** token 名（源码 `:1950-1951` 的 `exportInspectTokens` 会为未内建的 token 生成 `dynamicToken`），所以覆盖一个 0.2.1 不存在的 token **不会报错**——但也**不会生效**（没有消费方读它）。这意味着：**多覆盖无害，少覆盖会掉效果**。策略是覆盖一个跨版本超集，接受旧版冗余。

### 5.3 双版本渲染实测（T4.1）

2026-11-02 用同一套探针在两版客户端外壳上各跑一遍，逐字段比对。两侧都是**隔离实例**：0.2.1 用全局 CLI 起临时 profile；0.2.2 直接调用桌面端自带运行时（`resources/app/dsh/node_modules/@deepseek-ai/dsh/lib/bin.js`）配独立 `DSH_HOME`，全程不碰真实 profile、不重启桌面应用。

> 已脚本化：`node tools/e2e-dual-version.mjs --desktop-runtime <桌面端 resources/app/dsh>`。脚本自己起两侧服务、比对前强制两侧切到同一外观、15 条断言，跑完恢复原状。

| | 0.2.1-alpha.1（CLI） | 0.2.2-alpha.2（桌面端运行时） |
|---|---|---|
| 页面版本戳 | 品牌文字锁定（无版本串） | `0.2.2-alpha.2-f3803c9` |
| 插件注入的样式表 | 3 张（宿主共 151 张） | 3 张（宿主共 158 张） |
| 「通用」面板行数 | 13 | 15 |
| 我们的两行位置 | Font size 之后、Work details 之前 | 同左 |

比对项与结论：

| 比对项 | 结果 |
|---|---|
| 39 个被覆盖 / 被引用的令牌 × 明暗两档 | **逐字一致** |
| 六套配色的 `--dsw-alias-brand-primary` 与 `--dsh-go-page-base` | 六套 × 2 字段**逐字一致** |
| 输入区座位 / 输入卡布局矩形 | 一致（1153×238 @ 280,280；774×114 @ 469,372） |
| 全站 `backdrop-filter` 清单 | 都是 1 处、`blur(18px) saturate(1.25)` |
| `body` 上的主题属性 | 一致（`data-dsh-go-theme` / `data-dsh-go-accent`） |
| 页面背景图（`background-image`） | 一致 |

**唯一的差异是宿主自己的类名哈希前缀**：输入区座位在 0.2.1 是 `div.wSkVaW_composerSeat`、在 0.2.2 是 `div.e3z7WW_composerSeat`。我们的规则挂在 `[data-composer-seat]` / `[data-slot=…]` 上，不读这类哈希名，所以不受影响——这条差异正好从反面印证了「不依赖哈希类名」那条约定。

**结论：零兼容性修复。** 两版共用同一份令牌表与材质层，没有版本分支。

宿主侧的口径差异（不是插件差异，但影响复现步骤）：

- **设置入口位置变了**：0.2.1 在侧栏底部齿轮（渲染 `settings.trigger`）；0.2.2 没有这个 slot，入口在账户菜单「更多 → Settings」。两者打开后的「通用」面板都是 `settings.general.item` 容器，插件只依赖后者。
- 0.2.2 的「通用」面板多了左侧分类导航与两行新的官方条目，我们的两行相对位置不变。
- 0.2.2 的 `ui-settings` 配置项 `enabled` 默认 `true`（`Schema.boolean().default(true)`），桌面端 profile 里那行 `enabled: true` 是显式重复，不是开关闸门。

### 5.4 Electron 窗口 chrome 的交叉面

桌面端窗口是 `titleBarStyle: "hidden"` 的 Electron 窗口，chrome 由宿主自己的 CSS 与 preload 注入的 shadow DOM 菜单构成。逐项核对：

- **插件不碰任何 chrome 钩子**：自有 CSS / TS 里搜不到 `-webkit-app-region`、`data-platform`、`data-windows-titlebar`、`--dsh-frame-*`、`--dsh-windows-*`。
- **Linux 分支**：在 0.2.2 客户端里手工加 `data-platform="linux"`，`--dsh-frame-top-clearance: 48px` 与 `--dsh-frame-overlay-top: calc(48px + 20px)` 随即出现，渲染与未加该属性时一致。
- **Windows 分支**（本机不触发，仅模拟）：加 `data-windows-titlebar` 与 `--dsh-windows-titlebar-height: 40px` 后，40px 拖拽条用 `--dsw-specific-sidebar-fill` 上色——正是我们做成半透明的那个令牌，于是标题条与侧栏同色同透、内容整体下移 20px，无错位。
- **未做**：真机 Electron 窗口内的确认。要在桌面端看到本插件必须先应用内安装并重启（会断开当前会话），这一步留给维护者。

---

## 6. 明确做不到的事

诚实列出边界，避免交付时被当成 bug。

| 想做的事 | 为什么做不到 | 替代 |
|---|---|---|
| 逐像素复刻 DSH Go 截图 | Flutter 与 DOM 的布局/字体/滚动模型不同 | 复刻「视觉语言」（色彩、材质、节奏、形状） |
| iOS 式横向推页转场 | 桌面端是面板切换，不是页面栈 | 保留官方转场，只统一缓动曲线 |
| 边缘右滑返回手势 | 桌面端无此交互模型 | 不做 |
| 底部弹层 / 大圆角 sheet | 桌面端用对话框与菜单 | 给对话框/菜单套同一套材质 |
| 安全区 / 状态栏适配 | 桌面端无安全区 | 不做 |
| 桌宠（Deepy / 鲸娘） | 素材不在 AGPL 授权内；且是移动端交互 | v1 不做；如需要，做**自绘**独立插件 |
| 壁纸模糊取色 | 需要壁纸 + 取色管线；桌面端无壁纸概念 | 不做（六套预设 + 未来自定义色相） |
| 打包中文字体 | 官方资源路由不支持 `.woff2`（见下） | 用系统字体栈 |
| 替换品牌字标 | 官方「品牌图稿仍渲染固定的内联 SVG」 | 不做 |

### 字体约束的细节（重要）

官方插件资源路由 `/plugins/<package>/assets/` 的扩展名白名单是 `.svg .png .webp .jpg .jpeg`，**不含字体格式**。

证据：`dsh-client-modules/README.zh.md:39`：「无法解析的路径、扩展名不是 `.svg`、`.png`、`.webp`、`.jpg` 或 `.jpeg` 的已解析文件…都返回 404」

推论：
- **不能**通过官方资源路由分发 `.woff2`
- 备选 a：CSS 里 base64 内嵌——拉丁子集（如 JetBrains Mono Regular 的 ASCII 子集约 20–40 KB）可接受；**中文子集不可行**（单字重 10–20 MB）
- 备选 b：直接用系统字体栈

DSH Go 本身的选择恰好是 (b)：它**刻意不打包中文字体**，理由是国产 ROM 的系统字体质量好且自带拉丁字形（`typography.dart:6-14`）。所以**主题插件用系统字体栈，反而与参考实现的设计意图一致**，不是妥协。

---

## 7. 与既有第三方皮肤的共存

本机 `web` profile 已安装两个皮肤（`maid-atelier`、`orca-link`），但**都不在 `bundles` 里**，即未启用（`~/.dsh/profiles/web/package.json:7-8, 19-27`）。桌面端未安装。

共存原则：

1. **作用域隔离**：本插件只写 `body[data-dsh-go-theme]` 下的样式，不碰 `body[data-dsh-orca-link]` 等他人属性。
2. **token 层冲突**：`overrideTokens` 的 source 用包名，各皮肤互不覆盖对方的层，但**后注册者胜出**。若两个皮肤同时启用，视觉会叠加——这是用户选择，不做强行互斥（互斥属于"皮肤管理器"的职责，不是主题的职责）。
3. **不读取他人 `skin.json`**：那是 `skin-manager` 的私有协议，不是 DSH 核心契约。

---

## 8. 未验证事项

> 会话夹具的边界（2026-11-02 实测）：**手写的会话日志可以被服务端投影**（`session/projections` 返回 ok、`session/list` 也列得出来），但客户端侧栏不会把它列进工作区，所以从 UI 打不开。因此 T4.3 的场景扫描走「只读现有会话」的路线，长表格 / diff / 终端面板这几个需要特定内容的场景仍未覆盖。真要做确定性夹具，得先弄清侧栏的会话列表到底从哪来。

诚实标注，需要实现阶段实测：

- [ ] 桌面端 `Plugins → 添加插件` 安装本地目录插件时，是否与 CLI 一样需要 `dsh.bundle.patch` 才进 `bundles`（推断是，同 `reconcile()` 逻辑，但桌面端走了 UI 封装）
- [ ] 桌面端 Electron 的 `no-store` 缓存改写是否影响 HMR 增量更新体验
- [ ] `backdrop-filter` 在 Electron（Chromium）与 Linux WebKitGTK（如用户用 Safari/WebKit 打开 Web 端）上的性能与视觉差异
- [ ] 大量 `overrideTokens` 条目（预计 34 条，不是 120–200）对首帧渲染的实际开销
- [ ] `corner-shape: superellipse` 在非 Chromium 的降级表现
- [ ] **主题插件的 `body` 属性写入在桌面端是否被其他机制干扰**（见 §3.1.1 的规范张力；已在 0.2.2 web 实例上验证无干扰，桌面端 Electron 未验）

### 8.1 已从「未验证」转为「已核实」的项

记录于此，避免后人重复排查：

| 曾经的疑问 | 结论 | 证据 |
|---|---|---|
| `./locale/*.json` 的字段形状 | `{ "meta": { "title", "description" } }`，且 `en.json` 是目录锚点 | `host-plugin.md:31-51`；`dsh-app-boot/lib/index.js:2310, 2258-2277` |
| 是否禁止导入 `dsh-client-ui-primitives` | **官方明文禁止**（不是社区约定） | `cordis-plugin-development/references/practices.md:35` |
| `[data-slot]` 能否直接写盒属性 | **不能**，全部是内联 `display: contents` | `dsh-client-ui-renderer/lib/client.js:1116` |
| `settings.section` 与 `settings.general.item` 的区别 | 前者是左侧导航页，后者是「通用」面板内的行 | `ui-settings-general:1590-1599`；`ui-theme:2336-2349` |
| `ctx.theme.overrideTokens` 是否生效 | **生效**，0.2.1 与 0.2.2 双版本实测通过 | `reference/phase0-findings.md`（内部底稿，未入库） §1 |
| 客户端插件如何拿到 `ctx.theme` | 产物必须导出 `exports.inject = ["theme"]`，否则抛 `cannot get property "theme" without inject` | 同上 §1.2 |
| `overrideTokens` 是否校验 token 名 | **不校验**，编造的名字被静默接受 | 同上 §1.3 |
| `overrideTokens` 写入位置 | `document.body` 内联样式（`ui-layout/lib/client.js` `ThemePresenter.apply`） | 同上 §1.4 |
| 内置主题的 token 是否在 `snapshot.active.tokens` 里 | **不在**，该对象为空；内置值由基础样式表承载 | 同上 §1.5 |
| `[data-slot]` 是否全是 `display: contents` | **是**，0.2.2 41/41、0.2.1 49/49，实测无例外 | 同上 §3.2 |
| 5 层背景遮挡链是否必须逐层写选择器 | **不必**：全部由 `--dsw-alias-bg-base` 与 `--dsw-specific-sidebar-fill` 驱动 | 同上 §3.3 |
| `apply()` 返回值能否当 disposer | **不能**，必须用 `ctx.effect()` | 同上 §2.3 |
| `corner-shape: superellipse(1.5)` 是否生效（Chromium） | 生效，插件自建元素同样有效 | 同上 §4 |
| 两版渲染是否一致 | **一致**：39 个令牌 × 明暗、六套配色、布局矩形、模糊清单逐字相同；唯一差异是宿主自己的类名哈希 | 本文 §5.3；截图在 `reference/t41-preview/`（未入库） |
| 围栏 `diff` 代码块没有红绿 | **宿主行为，与主题无关**：在桌面端把本插件停用后渲染完全相同 | 2026-11-02 用户实测；代码面只碰 `.md-code-block` 的圆角与底色，未改任何 `--shiki-*` |
| 右栏与交互式终端 | **能开且正常**：右栏入口是 `aria-label="Open right sidebar"`，启动面板给 Workspace files / New terminal / More tools；终端是 xterm（38 行渲染、`bash` 提示符），终端面自身不透明、不串字，全站真模糊仍 1 处 | 2026-11-02 隔离实例实测；截图 `reference/t43-preview/14-terminal-live.png`（未入库） |
| 卸载是否真的干净 | **干净，两个版本都是**：62 个令牌名的计算值、body 整条内联声明（含优先级）、3 个 `data-dsh-go-*` 属性、作用域类名、3 张自有 `<style>`、任何带插件标记的节点、两个 window 监听器，全部复原；两轮循环零差异。0.2.1：1 → 44 → 1 条内联、149 → 152 → 149 个样式表；0.2.2：3 → 46 → 3 条、156 → 159 → 156 个 | `tools/e2e-uninstall.mjs`（23 条断言 × 两版本）；单测 `tests/uninstall-audit.test.ts`（9 条）；本文 §3.2 |
| 自有 `<style>` 由谁回收 | **宿主回收**：插件自身没有删除逻辑，实测卸载后全站 `<style>` 从 152 回到 149 | 同上；宿主 `removeOwnedStyles` 实测 |
| 卸载后还留下什么 | **只有一条配色偏好**（`localStorage` 的 `dsh.go-theme.preferences.v1`），有意为之：装回来时用户的选择还在 | 同上 |
| 交叉场景脚本能否重跑 | **能，但工作区要有内容**：默认展开的工作区若只剩空白会话，markdown / 代码面两条断言会红；用 `--workspace <片段>` 指一个有真实对话的工作区 | 2026-11-02 实测；`tools/e2e-scenarios.mjs` |
| 兼容门禁到底看什么 | **`engines.dsh` 单独决定**；没有它时只检查 `@deepseek-ai/dsh` / `@deepseek-ai/dsh-*` 的 peer（每个都得满足），其它 peer 名字一律跳过；比较用 `{ includePrerelease: true }`，所以 0.2.1-alpha.1 与 0.2.2-alpha.2 都算在 `>=0.2.1-alpha.1 <0.3.0` 里，而 0.2.0 不算 | `dsh-app-boot/lib/index.js` 的 `unmetRequirements` / `evaluatePluginCompatibility`；`tools/check-pack.mjs` 固定这两个字段 |

**阶段 0 已完成**（2026-11-02），完整结论见 `reference/phase0-findings.md`（内部底稿，未入库）。


## 9. 视觉复核：为什么六套配色「看不出区别」（T5.5）

2026-11-03 的复核，起因是一句主观判断：界面上的配色变化比 DSH Go 本身小很多。结论是两条真缺陷 + 一条测试盲区。

### 9.1 基准怎么来的

上游是真源，不是印象：取 `ccch1mneyyy/dsh-Go` HEAD 的 `app/lib/ui/theme/backdrop.dart`、`surfaces.dart`，以及上游自己的 golden `app/test/shell/adaptive/goldens/wide_sidebar_{light,dark}.png`（2560×1600 = 1280×800@2x）。

用上游的绘制算法复算那张 golden，用来校准我方的分析模型：

| 采样点 | golden 实测 | 复算 | 差 |
|---|---|---|---|
| 右上角（浅） | (211,224,253) | (208,222,253) | ≤3/255 |
| 页面中心（浅） | (235,240,252) | (236,241,253) | ≤1/255 |
| 右上角（深） | (41,51,71) | (42,51,72) | ≤1/255 |

模型可信之后，剩下的都是量化对比。

### 9.2 两条真缺陷

| # | 缺陷 | 证据 | 代价 |
|---|---|---|---|
| 1 | 光晕/雾罩画成椭圆（`120% 80%` 收到 70%），上游是圆（半径 `0.62 × 最长边`） | `backdrop.dart:303-333` | 整页平均光晕 alpha 0.052 vs 0.084；页面正中 0 vs 0.065 |
| 2 | 页面 wash 从未按注释下调（`tokens.ts` 旧注释写着 "Re-tune downwards together with that glass"），`PAGE_ALPHA` 自 `b47aec2` 起没改过 | `git log -S PAGE_ALPHA` 只有一个提交 | 叠两层 0.59 不透明，光晕与竖向渐变压到 41% |

两条叠起来，六套配色在右上角的最大色差 ΔE00 只有 15.75，上游是 28.27（56%）。

顺带两个同源问题：卡片填充（`mist`@0.36）与页面的 ΔE00 只有 0.71，等于没有卡片（上游 card 档 5.04）；侧栏填充颜色与 alpha 都不对（`mistLow`@0.40 / `nightLowest`@0.42，应分别是 `mistLow`@0.82 / `sheetDark`@0.86）。

### 9.3 一条测试盲区

`e2e:dual` 比的是 39 个令牌的**值**、布局矩形与模糊清单，因此「两版一致」始终成立；但它没有比**合成结果**。两版其实都叠两层（我核对过 0.2.1 的 `layout` 与 `conversation` 包，`.frame` 与 `.root` 两版都画 bg-base），所以这次没有版本漂移——可真要是有，现有断言看不出来。补足方式：预览脚本现在按配色逐张采样像素，与 golden 的期望值对表。

### 9.4 修法（已落地）

1. 光晕与雾罩改成 `circle 62vmax at 92% 0%` / `circle 55vmax at 0% 100%`，stop 收到 100%（`62vmax` 在 1280×800 下是 793.6px，与 Dart 侧同数）。
2. bg-base 归零（`transparent`）：页面就是背景，不再叠雾。
3. 侧栏 `mistLow`@0.82 / `sheetDark`@0.86。
4. 四档玻璃取上游数值：chrome 白 0.70（深 `smoke` 0.72）、sheet `mistLow` 0.82（深 `sheetDark` 0.86）、card 白 0.62（深 0.05）、pill 白 0.55（深 0.06），每档配一个近不透明降级值。
5. 输入条那条带子改成重画背景（`BackdropVeil` 的 CSS 版），因为 wash 归零后官方那条渐变的终点已经是透明。

**验收（实测像素，非推算）**：右上角雾蓝 (211,224,253) = golden；琥珀 (237,221,203) vs golden (237,221,204)；深色右上角 (41,51,71) = golden；深色侧栏 (35,39,50) = golden；六套配色右上角最大色差 26.4（上游 28.27，差距是采样点不在圆心）。

### 9.5 这次修法接不住的地方

bg-base 归零后，靠它当填充的表面必须在语义钩子上重绑。宿主 14 个包里有 24 处 `background: var(--dsw-alias-bg-base)`：页面级与遮罩级 15 处透明正好；卡片级 9 处多数有语义钩子（`[data-disclosure-header]`、`[data-compaction-disclosure]`、`[data-schedule-*]`）；**4 处只剩哈希类名**（cordis 业务卡、trajectory 工具目录条目、会话图片缩略图、AskQuestionCard 提问卡），会失去填充。接受这个缺口，不为此引入哈希选择器。

**一处已订正的说法（2026-11-03，按上游源码复核）**：此前把「工具行没有卡片底色」记成需要新决策的偏离，错在把上游想成了卡。上游 HEAD 的事实是：

- `app/lib/ui/chat/chat_rows.dart`：`toolGroupThreshold = 3`——**连续 ≥3 次**调用收成一行 `ToolGroupRow`，不足 3 次各占一行 `ToolCallRow`；`_gapBefore` 让相邻过程行之间的间距为 0。
- `app/lib/ui/chat/widgets/stream_row.dart`：单行外壳 `StreamRowFrame` = `minHeight 32` + 上下各 4 + 左右各 8 的 bleed + `InkWell` + `Squircle.border(AppShape.sm)`，**不画背景**；展开的内容挂在 `StreamThread`（左侧 1px 细线）下。
- `app/lib/ui/chat/widgets/chat_card.dart`：玻璃卡 `ChatCard`（`GlassSurface(tier: card)`、圆角 20）**只用于**审批卡 / 提问卡 / 改动卡 / 产物卡。

宿主这边 `[data-tool]` 根只有 `flex-direction:column`、`[data-chat-call-id]`（`.callRow`）只有 `radius-sm`，同样不画底色——**两边同构**。因此「在 `[data-tool]` 上补背景」是反方向的改动：它会把密集调用画成一摞小方块，而上游是把它们收成一行。真正的差异只剩分组模型：上游按「连续 ≥3 次」合并，宿主是整轮过程折叠（`data-turn-process` / `data-step-process`），条目粒度 CSS 接不到，记录为接受的缺口。

另：`[data-tool]` / `[data-chat-call-id]` 上把 `--dsw-alias-bg-base` 重绑到 card 档的规则**并非空操作**——AskQuestionCard 渲染在 `[data-tool="ask_user_question"]` 内并声明 `background: var(--dsw-alias-bg-base)`，按继承应已拿到该填充。所以上文「4 处只剩哈希类名」里的**提问卡一项待实景复核**，验过之前不要当作确定缺口。


## 10. 桌面端与网页端不是同一棵树（T5.6）

2026-11-03 用户反馈「整体色彩还是没变化，颜色很浅，只有输入框两侧的颜色变化、变深、界限明显」。这句话推翻的是 T5.5 的验收口径，不是它的结论——T5.5 的像素基线全部取自**浏览器**，而桌面端多了一层。

### 10.1 怎么定位的

1. 应用窗口截图实测：右上角 (240,244,253)，而 T5.5 的验收值是 (211,224,253)；中心 (244,247,254) vs 基准 (235,240,252)。整页接近纯 `mist`。
2. 同一份插件集、同一个桌面运行时、同样 1524×903@2x，在 Chromium 里重放：右上角 **(211,224,253)**，与验收值一致 → CSS 没问题，差在应用这一侧。
3. 在插件里临时把计算值写进 `document.title`（诊断代码已撤除），从窗口标题读回应用自己的 DOM 事实：
   - `body` 的 `background-image` 计算值正确（`radial-gradient(62vmax at 92% 0%, rgba(171,195,252,0.42) …)`），`background-attachment` = `fixed, fixed, fixed`；
   - 窗口不滚动（`scrollY 0`，`scrollHeight` = `innerHeight` = 903），`body` 的祖先里没有任何 transform / filter；
   - **窗口右上角命中的是一个 `background: rgba(246,249,254,0.82)` 的 `div`** —— 正是我们的 sheet 档填充，直接盖在 `body` 之上。
4. 该颜色的来源在宿主 `dsh-client-ui-layout`：`[data-windows-titlebar] .frame { background: var(--dsw-specific-sidebar-fill) }`，`<html>` 上的 `data-windows-titlebar` 由 Electron 环境加上。给浏览器重放页手工加这个属性，右上角立刻从 (211,224,253) 变成 (240,245,254)，与应用一致——机理确认。

0.82 的雾正好解释数值：`0.82 × mistLow(246,249,254) + 0.18 × 页面渐变` ≈ (240,245,254)，与实测逐通道吻合；页面正中 (244,247,254) 同理。

### 10.2 修法

只把**窗口框**的底交还给页面，其余不动：

```css
html[data-windows-titlebar] body[data-dsh-go-theme] [data-slot='root'] > :has([data-slot='sidebar']),
html[data-windows-titlebar] body[data-dsh-go-theme] [data-slot='root'] > :has([data-slot='sidebar'])::before {
  background: transparent;
}
```

- 选中的是 `.frame`（`[data-slot='root']` 的唯一子元素，且含有 `[data-slot='sidebar']`），不碰哈希类名；
- 侧栏列自己就画 `--dsw-specific-sidebar-fill`，所以列的颜色不变；
- `::before` 是那条拖拽横带，原来涂的是同一令牌，现在露出页面渐变；
- 只作用于 `html[data-windows-titlebar]`，网页端零变化。

**实测**：桌面模式下右上角 (211,224,253)（= T5.5 验收值），页面左侧 (236,240,251)，左下 (247,249,254)（雾罩）；网页端不加该属性时仍为 (211,224,253)。`tests/material.test.ts` 新增一条契约，锁住「这条规则存在且只写 `background: transparent`、不碰侧栏」。

### 10.3 教训

**验收基线必须来自被测环境本身。** T5.5 的像素值取自浏览器预览脚本，`e2e:dual` 比的是 39 个令牌的**值**与布局矩形——两者都绕过了「桌面端在页面之上多涂一层」这件事。今后凡改页面材质，桌面端的验收要在**应用窗口里**取像素，或在重放页上显式加上 `data-windows-titlebar` 再比。
