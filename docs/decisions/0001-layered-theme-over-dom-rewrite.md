# ADR-0001：用官方 token 覆盖层实现主题，而不是重写 DOM

## Status

Accepted（2026-11-01）

## Date

2026-11-01

## Context

要把 DSH Go（Flutter 移动端）的视觉语言搬到 DSH 官方 Web/桌面端，有两条根本不同的路线：

**路线 A：重写 DOM / 布局**——用 JS 重新组织页面结构，做出接近手机 App 的界面。
**路线 B：只改视觉层**——保留官方 DOM 与交互，通过官方 token 与自有 CSS 改外观。

需要决定，因为这会决定整个项目的上限与寿命。

关键事实：

1. 官方在 0.2.2 提供了 `ctx.theme.overrideTokens(source, tokens)` 这个明确的第三方主题扩展点（`dsh-client-ui-theme/lib/client.js:2073-2101`），注释写着「the token-level analogue of slot shading: the base theme stays untouched, layers compose in seq order」。
2. 官方 token 体系覆盖 `static` 色阶 / `alias` 语义 / `specific` 组件三层，颜色、阴影、模糊、动效都有对应变量。
3. 官方 DOM 结构随版本变动，且第三方皮肤（如本机的 `orca-link`）依赖 CSS Modules 哈希类名与 `MutationObserver`，属于**不稳定的实现细节**。
4. 用户已确认的产品方向是「保留桌面信息架构，复刻视觉语言」。

## Decision

**采用路线 B：三层结构。**

```
L1 状态层  复用官方 ThemeRuntime（light/dark/system + 持久化）   不自建
L2 令牌层  ctx.theme.overrideTokens() 覆盖 --dsw-alias-* / -specific-*
L3 材质层  插件自有 CSS Modules（渐变、玻璃、发丝线、圆角）
```

配套约束：
- 全部副作用挂在 `ctx.effect()` 清理器上
- 作用域限定在 `body[data-dsh-theme-mist]`
- 选择器优先使用官方 `data-slot` 语义属性，不依赖哈希类名

## Alternatives Considered

### 路线 A：重写 DOM / 布局

**优点**
- 视觉上能更接近手机 App（底部弹层、单列会话、大圆角卡片）
- 不受官方布局约束

**缺点**
- 官方 DOM 无稳定契约；每次 DSH 升级都可能整体失效
- 需要接管焦点、快捷键、滚动锚定、拖拽、a11y 语义——每一样都是坑
- 用户已明确要「保留桌面信息架构」
- 与官方插件的 slot 系统对抗，可能破坏其他插件的挂载点

**结论：拒绝。**

### 路线 C：用 `ctx.theme.register()` 注册 12 个主题 id

**优点**
- 每个组合都是"一等主题"，可在设置里直接选
- 还能顺带替换图标（`ThemeDefinition.icons`）

**缺点（决定性）**
- 注册的 id **不会进入内置 settings schema**（`dsh-client-ui-theme/README.zh.md:44`：「第三方主题 id 仍是进程内扩展，不会跨越内置 settings schema」）
- 更致命：用户选「跟随系统」时，`buildSnapshot` 会解析到内置的 `light`/`dark` id（`client.js:2103`），**配色选择丢失**
- `register` 拒绝重复 id 与 `system`（`client.js:2057-2059`），无法覆盖内置主题

**结论：拒绝作为主方案。**（`icons` 能力因此在 v1 也不可用，见 `architecture.md` §4.3）

### 路线 D：直接写 `body.style.setProperty('--dsw-alias-*')`

**优点**
- 不依赖任何 API，最"简单"

**缺点**
- 内联样式优先级高于样式表，**卸载后不清就永久污染**
- 与官方 presenter 争抢同一批变量（`ui-layout` 的 presenter 也在写 body 内联变量，见 `dsh-client-ui-layout/README.zh.md:47`）
- 官方切换明暗时会被覆盖或覆盖别人

**结论：拒绝。** 必须走 `overrideTokens`，让官方管理内联变量的生命周期。

## Consequences

**正面**
- 官方升级时，只要 token 名不变，主题继续工作
- 卸载后逐 token 复原，因为官方持有变量所有权
- 与官方「跟随系统」、字号、字体设置**天然兼容**，不打架
- 代码量小（预计 800–1200 行含测试），维护成本低

**负面**
- 无法实现手机专属交互（底部弹层、横向推页、安全区）——已在 `architecture.md` §6 明确列为不做
- 视觉上限受官方 DOM 结构限制：某些区域没有语义化的 hook，只能靠 `data-slot` 或结构选择器，升级时可能失效（风险 R2）
- 图标替换不可用（`icons` 只走 `register`）

**后续**
- 若官方未来提供"主题 + 图标"的分离扩展点，重新评估 §4.3
- 建立 token 名单测对照官方源码，把 R2 从"运行时才发现"提前到"CI 就红"
