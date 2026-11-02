# 官方 `--dsw-*` token 权威清单

> 数据来自 `@deepseek-ai/dsh-client-ui-theme/lib/client.js` 的 `design_platform_css_default`。
> 两版：**0.2.1-alpha.1**（CLI）与 **0.2.2-alpha.2**（桌面端）。
>
> ⚠️ **§0.5「运行时对齐」是 2026-11-02 实测结果，优先级高于本文其余部分**：源码声明的 token 有 12 个在运行时并不存在，另有 12 个的覆盖行为与源码直觉不同。实现前先读 §0.5。

## 0. 规模与差异

| 类别 | 0.2.2 | 0.2.1 |
|---|---|---|
| `--dsw-alias-*` | 108 | 101 |
| `--dsw-specific-*` | 10 | 11 |
| `--dsw-static-*` | 82 | 77 |
| `--dsw-menu-surface-fill` | 1 | 1 |
| **合计** | **202** | **191** |

**共同 token 的值差异：0 处。** 两版之间只有集合变化，没有值变化——这意味着同一份覆盖表在两版上产生同样的颜色。

### 0.2.2 新增（12）

| token | 说明 | 对主题的影响 |
|---|---|---|
| `--dsw-alias-illustration-background` | 插画背景 | 可覆盖（装饰） |
| `--dsw-alias-illustration-backing` | 插画后层 | 可覆盖（装饰） |
| `--dsw-alias-illustration-detail` | 插画细节 | 可覆盖（装饰） |
| `--dsw-alias-illustration-inset` | 插画内嵌 | 可覆盖（装饰） |
| `--dsw-alias-illustration-shadow` | 插画投影 | 可覆盖（装饰） |
| `--dsw-alias-illustration-surface` | 插画前层 | 可覆盖（装饰） |
| `--dsw-alias-state-done-primary` | **「已完成」状态色（violet）** | ⚠️ **不覆盖**：0.2.1 不存在，且语义与 DSH Go 的 `dusk`（规划）不同 |
| `--dsw-static-neutral-bluish-310` | 静态色阶 | 不覆盖（底座色阶） |
| `--dsw-static-neutral-bluish-55` | 静态色阶 | 不覆盖 |
| `--dsw-static-neutral-bluish-90` | 静态色阶 | 不覆盖 |
| `--dsw-static-violet-400` | 静态色阶 | 不覆盖 |
| `--dsw-static-violet-600` | 静态色阶 | 不覆盖 |

### 0.2.1 独有（1）

| token | 说明 | 对主题的影响 |
|---|---|---|
| `--dsw-specific-sidebar-nav-item-hover` | 侧栏导航项悬停底色 | ⚠️ **破坏性变更**：0.2.2 已移除。若覆盖它，在桌面端无效。**改用 `--dsw-alias-interactive-bg-hover` 统一表达** |

> 🔑 **关键约束**：覆盖一个当前版本不存在的 token **不会报错**（服务会为它生成 `dynamicToken`），但也**不会有任何效果**。所以"多覆盖无害、少覆盖掉效果"，但**移除型差异必须处理**——否则会出现"旧版有 hover、新版没 hover"。

## 0.5 运行时对齐（2026-11-02 实测，**本节优先级最高**）

> 上面 §0 的 202 / 191 是**源码声明数**（`design_platform_css_default` 字符串里的唯一 token 数）。
> 但实测发现：**源码声明 ≠ 运行时可用**。实现前请以本节为准，机器可读版见 `token-inventory-runtime.json`（内部底稿，未入库）。

**方法**：在 0.2.2-alpha.2 的 web 实例上枚举 `document.styleSheets`（152 张表 / 4265 条规则 / 0 张跨域阻塞），记录每个 `--dsw-*` 的**全部**声明处。

### 规模

| 指标 | 数值 |
|---|---|
| 运行时实际定义 | **404** |
| ├ 颜色类（`alias` / `specific` / `static` / `menu`） | **192** |
| └ 非颜色（`font` 182、`radius` 6、`elevation` 5、`shadow` 4、`gradient` 3、`linear` 2、`corner`/`focus`/`mask`/`hovercard` 各 1 等） | 212 |
| `design_platform_css_default` 源码声明（0.2.2） | 201 |
| `design_platform_css_default` 源码声明（0.2.1） | 190 |
| **源码声明了、运行时却没有** | **12** |

### 覆盖可达性三级（决定 `overrideTokens` 能不能真正生效）

| 级 | 定义处 | 数量 | 覆盖结果 |
|---|---|---|---|
| **A** | 全部落在 `body` / `body[data-ds-dark-theme]` / `:root` / `html` | **392** | ✅ 完全可达 —— `overrideTokens` 写 body 内联后，所有后代继承到同一值 |
| **B** | 含 `body, body *` | **4** | ❌ **必然失效** —— 每个后代元素都自己重声明，盖掉继承值 |
| **C** | 存在组件级重声明 | **8** | ⚠️ 全局生效，但这些组件保留自己的值 |

**B 级名单（4 个，全部是 `--dsw-elevation-*`）**：

```
--dsw-elevation-stroke  --dsw-elevation-panel  --dsw-elevation-prominent  --dsw-elevation-soft
```

**C 级名单（8 个）**：

| token | 重声明处数 | 典型场景 | 是否符合预期 |
|---|---|---|---|
| `--dsw-elevation-stroke-color` | 23 | 每个浮层组件各自重绑定 | ✅ 官方刻意设计（逐元素声明就是为了让组件能自选描边色） |
| `--dsw-alias-button-primary-fill` / `-hover` | 各 1 | `.X_2TxG_dangerButton` | ✅ 危险按钮必须保持红色，不该被主题改 |
| `--dsw-alias-interactive-bg-hover` | 1 | `.X_2TxG_danger` | ✅ 同上 |
| `--dsw-alias-label-shimmer` | 1 | `.EvIC1a_running` | ✅ 运行态闪烁自持 |
| `--dsw-specific-menu` | 2 | `html[data-platform="darwin"] body` | ⚠️ macOS 下菜单材质独立 |
| `--dsw-focus-ring-color` | 1 | `:focus-visible` 指针模态 | ✅ 无默认值，靠消费处回退 |
| `--dsw-hovercard-bg` | 1 | `._card_38jqx_9` | ⚠️ 悬停卡独立 |

> **C 级的含义不是"覆盖失败"，而是"这些地方官方有意不跟随全局"**。主题覆盖它们仍然是正确做法，只是不要指望危险按钮跟着变红之外的色。

### 源码有、运行时无（12 个）—— **覆盖它们不会有任何效果**

| token |
|---|
| `--dsw-alias-illustration-background` / `-backing` / `-detail` / `-inset` / `-shadow` / `-surface` |
| `--dsw-alias-state-done-primary` |
| `--dsw-static-neutral-bluish-55` / `-90` / `-310` |
| `--dsw-static-violet-400` / `-600` |

这 12 个**恰好就是 0.2.2 相对 0.2.1 新增的那 12 个**（见 §0「0.2.2 新增」表）。也就是说：**它们在 0.2.2 的源码里被声明了，但没有出现在实际注入页面的 CSS 里**。实测 `getComputedStyle(document.body).getPropertyValue()` 逐个返回空串。

原因**未查明**（不是跨域、不是 `adoptedStyleSheets`——实测为 0）。这不妨碍做主题，但那 6 个 `illustration-*` 在 §1「插画（仅 0.2.2）」表里，**不要浪费条目去覆盖**。

### 一条被推翻的旧结论

旧版本文写「`--dsw-specific-sidebar-nav-item-hover` 是 0.2.1 独有、0.2.2 已移除」。**错。** 实测 0.2.2 运行时存在，浅色值为 `#f1f3f5`（即 `neutral-bluish-75`）。

成因：该 token 在 0.2.1 的 `design_platform_css_default` 里，0.2.2 的同一字符串里没有——但运行时注入的 CSS 并不是这个字符串的完整拷贝。**这正是"以运行时为准"的原因。**
## 1. 语义 token 全表

值列里 `neutral-bluish-00` 这类写法表示该 token 原本引用 `var(--dsw-static-*)`；`#rrggbb` 是直接字面值。

### 背景 / 表面

| token | 浅色 | 深色 | 版本 |
|---|---|---|---|
| `--dsw-alias-bg-base` | `neutral-bluish-00` | `neutral-bluish-950` | 两版 |
| `--dsw-alias-bg-layer-1` | `neutral-bluish-00` | `neutral-bluish-875` | 两版 |
| `--dsw-alias-bg-layer-2` | `neutral-bluish-00` | `neutral-bluish-850` | 两版 |
| `--dsw-alias-bg-layer-3` | `neutral-bluish-00` | `neutral-bluish-800` | 两版 |
| `--dsw-alias-bg-overlay` | `neutral-bluish-150` | `neutral-bluish-700` | 两版 |
| `--dsw-alias-bg-module-platform` | `neutral-bluish-60` | `neutral-bluish-800` | 两版 |
| `--dsw-alias-bg-multi-select` | `neutral-bluish-60` | `neutral-850` | 两版 |
| `--dsw-alias-bg-document-preview` | `neutral-bluish-100` | `neutral-bluish-950` | 两版 |
| `--dsw-alias-bg-skeleton` | `#0000000a` | `#ffffff14` | 两版 |
| `--dsw-alias-bg-mask-1` | `#0000003d` | `#00000080` | 两版 |
| `--dsw-alias-bg-mask-2` | `#0000001f` | `#0003` | 两版 |
| `--dsw-alias-bg-mask-3` | `#0000007a` | `#0000007a` | 两版 |
| `--dsw-alias-bg-mask-drop` | `#ffffffb3` | `#272730b3` | 两版 |
| `--dsw-alias-bg-mask-photo` | `#000000e0` | `#000000e0` | 两版 |
| `--dsw-alias-bg-document-selection` | `color-mix(in srgb, var(--dsw-static-blue-500) 40%, transparent)` | `color-mix(in srgb, var(--dsw-static-blue-500) 40%, transparent)` | 两版 |

### 文字

| token | 浅色 | 深色 | 版本 |
|---|---|---|---|
| `--dsw-alias-label-primary` | `neutral-bluish-1000` | `neutral-bluish-50` | 两版 |
| `--dsw-alias-label-secondary` | `neutral-bluish-700` | `neutral-bluish-300` | 两版 |
| `--dsw-alias-label-tertiary` | `neutral-bluish-600` | `neutral-bluish-400` | 两版 |
| `--dsw-alias-label-caption` | `neutral-bluish-400` | `neutral-bluish-600` | 两版 |
| `--dsw-alias-label-dimmed` | `neutral-bluish-200` | `neutral-bluish-750` | 两版 |
| `--dsw-alias-label-primary-dimmed` | `neutral-bluish-950` | `neutral-bluish-100` | 两版 |
| `--dsw-alias-label-primary-bluish` | `blue-900` | `neutral-bluish-50` | 两版 |
| `--dsw-alias-label-primary-foreground` | `neutral-bluish-00` | `neutral-bluish-1000` | 两版 |
| `--dsw-alias-label-primary-inverted` | `neutral-bluish-00` | `neutral-bluish-800` | 两版 |
| `--dsw-alias-label-document-preview` | `neutral-bluish-700` | `neutral-bluish-300` | 两版 |
| `--dsw-alias-label-shimmer` | `color-mix(in srgb, var(--dsw-static-neutral-1000) 30%, transparent)` | `color-mix(in srgb, var(--dsw-static-neutral-00) 45%, transparent)` | 两版 |
| `--dsw-alias-label-deep-diving` | `color-mix(in srgb, var(--dsw-static-deepseek-500) 70%, var(--dsw-static-blue-950))` | `color-mix(in srgb, var(--dsw-static-deepseek-450) 55%, var(--dsw-static-neutral-bluish-400))` | 两版 |
| `--dsw-alias-label-deep-diving-shimmer` | `color-mix(in srgb, var(--dsw-static-deepseek-500) 30%, var(--dsw-static-blue-950))` | `color-mix(in srgb, var(--dsw-static-blue-300) 65%, var(--dsw-static-deepseek-400))` | 两版 |
| `--dsw-alias-link` | `deepseek-500` | `deepseek-400` | 两版 |
| `--dsw-alias-menu-icon` | `neutral-bluish-800` | `label-primary-dimmed` | 两版 |

### 描边

| token | 浅色 | 深色 | 版本 |
|---|---|---|---|
| `--dsw-alias-border-l1` | `#0000000a` | `#ffffff0f` | 两版 |
| `--dsw-alias-border-l2` | `#0000001a` | `#ffffff1f` | 两版 |
| `--dsw-alias-border-l2-darkmode-thin` | `#0000001a` | `#ffffff0f` | 两版 |
| `--dsw-alias-border-l3` | `#0000001f` | `#ffffff29` | 两版 |
| `--dsw-alias-border-l4` | `#00000029` | `#fff3` | 两版 |
| `--dsw-alias-border-inverted` | `#0000` | `#ffffff0f` | 两版 |
| `--dsw-alias-border-inverted2` | `#0000` | `#ffffff14` | 两版 |

### 品牌 / 按钮

| token | 浅色 | 深色 | 版本 |
|---|---|---|---|
| `--dsw-alias-brand-primary` | `neutral-bluish-1000` | `neutral-bluish-50` | 两版 |
| `--dsw-alias-brand-primary-invert` | `neutral-bluish-1000` | `neutral-bluish-50` | 两版 |
| `--dsw-alias-brand-text` | `neutral-bluish-1000` | `neutral-bluish-50` | 两版 |
| `--dsw-alias-brand-primary-new-colorprimary-new-color` | `#4176e6` | `deepseek-450` | 两版 |
| `--dsw-alias-button-primary-fill` | `brand-primary` | `brand-primary` | 两版 |
| `--dsw-alias-button-primary-hover` | `neutral-bluish-750` | `neutral-bluish-100` | 两版 |
| `--dsw-alias-button-primary-dimmed` | `neutral-bluish-100` | `neutral-bluish-750` | 两版 |
| `--dsw-alias-button-contrast-fill` | `neutral-bluish-700` | `neutral-bluish-50` | 两版 |
| `--dsw-alias-button-elevated-fill` | `neutral-bluish-00` | `neutral-bluish-750` | 两版 |
| `--dsw-alias-button-floating-fill` | `neutral-bluish-00` | `neutral-bluish-850` | 两版 |
| `--dsw-alias-button-floating-hover` | `neutral-bluish-75` | `neutral-bluish-800` | 两版 |
| `--dsw-alias-button-info-fill` | `deepseek-500` | `deepseek-400` | 两版 |
| `--dsw-alias-button-info-hover` | `deepseek-400` | `deepseek-500` | 两版 |
| `--dsw-alias-button-ghost-active-fill` | `neutral-bluish-100` | `neutral-bluish-750` | 两版 |
| `--dsw-alias-button-ghost-active-hover` | `neutral-bluish-150` | `neutral-bluish-700` | 两版 |
| `--dsw-alias-button-ghost-active-border` | `neutral-bluish-500` | `neutral-bluish-600` | 两版 |
| `--dsw-alias-button-tool-bar-fill` | `#54555780` | `#54555780` | 两版 |
| `--dsw-alias-button-tool-bar-fill-invisible` | `#1f1f1f5c` | `#1f1f1f5c` | 两版 |
| `--dsw-alias-button-tool-bar-hover` | `#54555799` | `#54555799` | 两版 |

### 交互反馈

| token | 浅色 | 深色 | 版本 |
|---|---|---|---|
| `--dsw-alias-interactive-bg-hover` | `#2631480f` | `#ffffff14` | 两版 |
| `--dsw-alias-interactive-bg-active` | `#2631481a` | `#ffffff24` | 两版 |
| `--dsw-alias-interactive-bg-hover-solid` | `neutral-bluish-75` | `neutral-bluish-800` | 两版 |
| `--dsw-alias-interactive-bg-hover-accent` | `#26314824` | `#ffffff3d` | 两版 |
| `--dsw-alias-interactive-bg-hover-danger` | `#ec13130d` | `#f25a5a26` | 两版 |
| `--dsw-alias-turn-trigger-bg` | `markdown-code-block` | `interactive-bg-hover` | 两版 |
| `--dsw-alias-turn-trigger-bg-hover` | `interactive-bg-hover` | `interactive-bg-active` | 两版 |

### 状态语义

| token | 浅色 | 深色 | 版本 |
|---|---|---|---|
| `--dsw-alias-state-business-primary` | `deepseek-500` | `deepseek-400` | 两版 |
| `--dsw-alias-state-business-tertiary` | `deepseek-100` | `deepseek-800` | 两版 |
| `--dsw-alias-state-error-primary` | `red-600` | `red-400` | 两版 |
| `--dsw-alias-state-error-secondary` | `red-400` | `red-400` | 两版 |
| `--dsw-alias-state-success-primary` | `green-500` | `green-500` | 两版 |
| `--dsw-alias-state-success-secondary` | `green-400` | `green-400` | 两版 |
| `--dsw-alias-state-success-tertiary` | `green-100` | `green-900` | 两版 |
| `--dsw-alias-state-warn-primary` | `amber-500` | `amber-500` | 两版 |
| `--dsw-alias-state-warn-secondary` | `amber-400` | `amber-400` | 两版 |
| `--dsw-alias-state-warn-tertiary` | `amber-100` | `amber-900` | 两版 |
| `--dsw-alias-state-warn-label` | `amber-600` | `amber-600` | 两版 |
| `--dsw-alias-state-idle-primary` | `neutral-300` | `neutral-600` | 两版 |
| `--dsw-alias-state-done-primary` | `violet-600` | `violet-400` | **仅 0.2.2** |

### Markdown / 代码

| token | 浅色 | 深色 | 版本 |
|---|---|---|---|
| `--dsw-alias-markdown-code-block` | `neutral-bluish-50` | `neutral-bluish-900` | 两版 |
| `--dsw-alias-markdown-code-block-banner` | `neutral-bluish-50` | `neutral-bluish-850` | 两版 |
| `--dsw-alias-markdown-inline-code` | `neutral-50` | `neutral-800` | 两版 |
| `--dsw-alias-markdown-code-segment-selected` | `neutral-bluish-00` | `neutral-bluish-800` | 两版 |
| `--dsw-alias-markdown-code-segment-unselected` | `neutral-bluish-75` | `neutral-bluish-900` | 两版 |
| `--dsw-alias-markdown-citation` | `neutral-bluish-100` | `neutral-bluish-800` | 两版 |
| `--dsw-alias-markdown-tag` | `neutral-bluish-75` | `neutral-bluish-850` | 两版 |
| `--dsw-alias-markdown-placeholder` | `neutral-bluish-60` | `neutral-bluish-850` | 两版 |
| `--dsw-alias-code-diff-added` | `green-500-a08` | `green-500-a12` | 两版 |
| `--dsw-alias-code-diff-deleted` | `red-600-a08` | `red-400-a12` | 两版 |
| `--dsw-alias-file-diff-added-bg` | `#e6f4e7` | `#1f3124` | 两版 |
| `--dsw-alias-file-diff-added-gutter` | `#edf7ed` | `#132016` | 两版 |
| `--dsw-alias-file-diff-added-marker` | `#01a241` | `#41c977` | 两版 |
| `--dsw-alias-file-diff-deleted-bg` | `#fce6e2` | `#3c1f1b` | 两版 |
| `--dsw-alias-file-diff-deleted-gutter` | `#fdece9` | `#28130e` | 两版 |
| `--dsw-alias-file-diff-deleted-marker` | `#ba2723` | `#fa423e` | 两版 |

### 滚动条 / 浮层

| token | 浅色 | 深色 | 版本 |
|---|---|---|---|
| `--dsw-alias-scrollbar-bg-l1` | `neutral-200` | `neutral-700` | 两版 |
| `--dsw-alias-scrollbar-bg-l2` | `neutral-200` | `neutral-600` | 两版 |
| `--dsw-alias-scrollbar-hover-l1` | `neutral-300` | `neutral-600` | 两版 |
| `--dsw-alias-scrollbar-hover-l2` | `neutral-300` | `neutral-550` | 两版 |
| `--dsw-alias-menu-group-header-fill` | `#f8f9faf0` | `#303136f0` | 两版 |
| `--dsw-alias-toast-bg` | `neutral-bluish-800` | `neutral-bluish-750` | 两版 |
| `--dsw-alias-toast-label` | `neutral-bluish-00` | `neutral-bluish-00` | 两版 |
| `--dsw-alias-tooltip-bg` | `neutral-bluish-850` | `neutral-bluish-750` | 两版 |
| `--dsw-alias-tooltip-key-bg` | `color-mix(in srgb, var(--dsw-alias-tooltip-bg), white 18%)` | `color-mix(in srgb, var(--dsw-alias-tooltip-bg), white 18%)` | 两版 |
| `--dsw-alias-switch-thumb` | `neutral-bluish-00` | `neutral-bluish-400` | 两版 |

### 插画（仅 0.2.2）

| token | 浅色 | 深色 | 版本 |
|---|---|---|---|
| `--dsw-alias-illustration-background` | `neutral-bluish-55` | `neutral-bluish-850` | **仅 0.2.2** |
| `--dsw-alias-illustration-backing` | `neutral-bluish-310` | `neutral-bluish-750` | **仅 0.2.2** |
| `--dsw-alias-illustration-detail` | `neutral-bluish-310` | `neutral-bluish-600` | **仅 0.2.2** |
| `--dsw-alias-illustration-inset` | `illustration-surface` | `illustration-backing` | **仅 0.2.2** |
| `--dsw-alias-illustration-shadow` | `illustration-surface` | `illustration-backing` | **仅 0.2.2** |
| `--dsw-alias-illustration-surface` | `neutral-bluish-90` | `neutral-bluish-700` | **仅 0.2.2** |

### `--dsw-specific-*`

| token | 浅色 | 深色 | 版本 |
|---|---|---|---|
| `--dsw-specific-bubble` | `deepseek-50` | `neutral-bluish-850` | 两版 |
| `--dsw-specific-bubble-highlight` | `deepseek-200` | `neutral-bluish-750` | 两版 |
| `--dsw-specific-input-major` | `neutral-bluish-00` | `neutral-bluish-850` | 两版 |
| `--dsw-specific-login-input` | `neutral-bluish-50` | `neutral-bluish-900` | 两版 |
| `--dsw-specific-menu` | `var(--dsw-menu-surface-fill` | `var(--dsw-menu-surface-fill` | 两版 |
| `--dsw-specific-selector` | `neutral-bluish-60` | `neutral-bluish-800` | 两版 |
| `--dsw-specific-sidebar-fill` | `neutral-bluish-50` | `neutral-bluish-900` | 两版 |
| `--dsw-specific-sidebar-nav-item-active` | `neutral-bluish-100` | `neutral-bluish-750` | 两版 |
| `--dsw-specific-sidebar-nav-item-active-accent` | `deepseek-100` | `neutral-bluish-800` | 两版 |
| `--dsw-specific-tip` | `neutral-bluish-60` | `neutral-bluish-800` | 两版 |

| `--dsw-specific-sidebar-nav-item-hover` | `neutral-bluish-75` | `neutral-bluish-850` | **两版**（旧版误标「仅 0.2.1」；实测 0.2.2 运行时存在，浅色 `#f1f3f5`。见 §0.5） |

### 菜单材质

| token | 浅色 | 深色 | 版本 |
|---|---|---|---|
| `--dsw-menu-surface-fill` | `#f8f9fa94` | `#43454a73` | 两版 |

> ⚠️ 官方文档明确「平台代码须保留这些 token 值」（`dsh-client-ui-theme/README.zh.md:55`）。**不要覆盖。**

## 2. 非颜色 token（不在 `design_platform_css_default` 里，由同包其余样式表定义）

`--dsw-alias-*`（108）与 `--dsw-specific-*`（10）**全部是颜色**：取值形态只有直接 hex、`color-mix(...)`、`var()` 三种，零个 length/shadow/filter/font。

非颜色 token 都在另外几张表里：

| token | 定义处 | 声明选择器 | 是否可覆盖 |
|---|---|---|---|
| `--dsw-shadow-lv1` / `lv1-blur` / `lv2` / `lv3` | `gradient_shadow_text_css_default` | `body` | ✅ 可（**R3**：复合值需整值重写） |
| `--dsw-elevation-stroke` / `-panel` / `-prominent` / `-soft` | 同上 | **`body, body *`** | ❌ **覆盖静默无效**（R1） |
| `--dsw-elevation-stroke-color` | 同上 | `body` + **23 处组件级重声明** | ⚠️ **C 级**：只能改到未自行重绑的元素 —— **不是全局描边色入口**（旧版说法已推翻，见 §0.5） |
| `--dsw-menu-backdrop-filter` / `--dsw-mask-blur` | 同上 | `body` | ❌ 禁改 |
| `--dsw-font-*`（182 个） | 同上 | `body` | ❌ 禁改（字号/字体属用户设置） |
| `--dsw-radius-xs/sm/md/lg/xl/panel` | `base_css_default` | **`:root`** | ⚠️ 可（继承生效），但全局改所有组件圆角 |
| `--dsw-corner-shape` | `corner_shape_css_default` | `:root`（`@supports` 内） | ❌ 禁改 |
| `--dsw-focus-ring-color` / `-width` | `focus_css_default` | `:root` / 指针模态下的 `:focus-visible` | ❌ 禁改（无默认值，靠消费处回退） |
| `--ds-ease-in-out`、`--ds-transition-duration{,-fast,-slow}` | `base_css_default` | `:root` | ❌ 禁改（布局动画共用） |
| `--shiki-*`（11 个） | `shiki_css_default` | `:root` | ⚠️ 可（牵动语法可读性） |
| `--dsh-hairline-width` | ui-theme client JS（DPR 监听器） | `html` 内联 | ❌ 禁改（会被 DPR 变化清掉） |
| `--dsh-scrollbar-thumb` / `-hover` / `-border` / `-track-margin` / `-width` | `scrollbar_css_default` | `body` | ⚠️ 可，但需在**自己的容器**上重绑 |
| `--dsh-content-font-size` / `-code-` / `-terminal-`、`--dsh-font-family-*` | `ui-layout` presenter 写 `body` 内联 | `body` | ❌ 禁改（用户设置出口） |
| `--dsh-chat-content-width` | `ui-conversation` 组件自声明 | 组件容器 | ❌ **覆盖无效**（R4） |
| `--dsh-frame-*`、`--dsh-windows-*` | `ui-layout` / Desktop 外壳 | `html` | ❌ 禁改（窗口 chrome 几何） |

### 2.1 为什么 `--dsw-elevation-*` 覆盖无效

```css
/* client.js:1482 的 rule#2 —— 注意选择器是 body, body * */
body, body * {
  --dsw-elevation-stroke: 0 0 0 .5px var(--dsw-elevation-stroke-color);
  --dsw-elevation-panel: var(--dsw-elevation-stroke), 0 3px 8px 0 #00000008, 0 0 16px 0 #00000005;
  /* ... */
}
```

`body *` 让**每个元素**都有自己的计算值。而 `overrideTokens` 只在 `body` 上写内联（`ui-layout/lib/client.js:576-579`），后代的 `body *` 规则会盖过从 body 继承来的值。

官方文档也印证了这是**刻意设计**：「派生 token 逐元素重声明，使表面对描边色的重绑真实生效」（`dsh-client-ui-theme/README.zh.md:90`）——逐元素声明正是为了让组件能用 `--dsw-elevation-stroke-color` 换色。

**要调高层级表面的阴影，只能走自有 CSS 在具体元素上写 `box-shadow`。**

## 3. 覆盖策略总结

| 层 | 数量 | 做法 |
|---|---|---|
| `--dsw-static-*`（82） | 0 | **完全不碰**。它是设计系统底座 |
| `--dsw-alias-*`（108） | **27** | 只覆盖 `visual-spec.md` §8.2 列出的 27 个 alias |
| `--dsw-specific-*`（10） | **7** | 气泡×2、输入、选择器、侧栏×3（与 27 个 alias 合计 **34** 个） |
| `--dsw-menu-surface-fill` | 0 | 禁改 |
| `--dsw-elevation-*`（4） | 0 | **覆盖无效** |
