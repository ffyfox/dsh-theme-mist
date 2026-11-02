# dsh-Go-theme

把 [DSH Go](https://github.com/ccch1mneyyy/dsh-Go)（DeepSeek Harness 的 Android 客户端，Flutter）的视觉语言，移植成 DSH 桌面端 / Web 端的**客户端主题插件**。

装上之后，官方界面获得同源的设计语言：六套强调色、分层渐变表面、玻璃材质、发丝描边、连续圆角、克制的动效节奏。**信息架构保持官方三栏布局不变** —— 换的是视觉，不是交互模型。

本项目是独立重实现，不含 DSH Go 的代码、素材或字体。

## 现在的状态

阶段 0–3 已完成：令牌层与材质层可用，装上即变色；「设置 → 通用」里有「配色」与「减少透明效果」两行，六套强调色与材质降级都能在界面里完成，不需要改配置或写脚本。

阶段 4 进行中：客户端两版（`0.2.1-alpha.1` 与 `0.2.2-alpha.2`）的渲染一致性已实测通过，不需要版本分支；桌面端 Electron 窗口内的确认要等应用内安装 + 重启之后才能做。

## 安装

### 桌面端

应用内「插件 → 添加插件 → 本地目录」，选本仓库目录即可。

> 桌面端的 `desktop` profile 对 CLI 硬拒绝（`boot` / `--dump-config` / `dsh plugin` 全部不可用），只能走界面。

### Web 端

```bash
pnpm install && pnpm build          # 生成 lib/，缺了它 Host Loader 导入会失败
dsh plugin --profile <profile> add "$(pwd)"
```

包清单里声明了 `dsh.bundle`，所以 `add` 之后会被写进该 profile 的 `dsh.profile.bundles` —— 这是「能不能当层」的唯一开关，只进 `dependencies` 而不进 `bundles` 的包完全惰性。

### 卸载

```bash
dsh plugin --profile <profile> remove @dsh-external/dsh-client-ui-theme-go
```

桌面端在插件页移除。卸载会摘掉 `body` 上的主题属性、注入的样式表与事件监听；偏好本身仍留在 `localStorage`，需要的话自行清除：

```js
localStorage.removeItem('dsh.go-theme.preferences.v1')
```

## 支持的版本

开发与实测基于 **DSH 0.2.2**（`dsh-client-ui-theme` 提供 `ctx.theme.overrideTokens` 与 `ctx.theme.register` 的版本）。0.2.1 上扩展点同样存在，但令牌清单不同（202 个 vs 404 个），本主题按 0.2.2 的清单编写，在 0.2.1 上的视觉未经核对。

## 用法

明暗跟随系统。打开「设置 → 通用」，在「配色」一行里点六色块之一：雾蓝 / 黛青 / 暮紫 / 松石 / 琥珀 / 石墨。切换即时生效、无需刷新，选择写进 `localStorage`；色块本身会随明暗切换显示该配色在对应模式下的主色。

脚本或其他插件可以绕过界面直接驱动，与界面共用同一份状态，选择同样会持久化：

```js
window.dispatchEvent(new CustomEvent('dsh-go-theme:accent', { detail: 'amber' }))
window.dispatchEvent(new CustomEvent('dsh-go-theme:reduce-material', { detail: true }))
```

「减少透明效果」也有界面开关：「设置 → 通用 → 减少透明效果」。关掉后所有 `backdrop-filter` 消失，玻璃面改用近不透明的 solid 填充（实测卡片填充 alpha 0.70 → 0.97，正文对比度 15.01:1 → 15.30:1，不降反升）。

## 性能

页面上只有**一处新增的真实模糊**（输入区，`blur(18px) saturate(1.25)`）；菜单的模糊是官方材质，不是本项目加的。滚动场景的 A/B 实测（同机同 Chromium，交替跑 `glass` 与「只关掉这层模糊」）**没测到代价**：两个条件都顶到显示器刷新率上限，帧间隔分布一致。

边界要说清：这是 Chrome 而不是 Electron、是脚本滚动而不是真实滚轮、且只在这一台机器上。这个数字不能当作「所有机器都没问题」的证据。

## 文档

| 文档 | 内容 |
|---|---|
| [架构](docs/architecture.md) | 加载链、生命周期、清理契约、做不到的事 |
| [视觉规范](docs/visual-spec.md) | 设计令牌规范、`--dsw-*` 映射依据、五层遮挡与材质配方 |
| [官方 token 清单](docs/reference/token-inventory.md) | 0.2.2 运行时可用的 `--dsw-*` 全集（404 个）与可达性分级 |
| [配色表](docs/reference/palette-tables.md) | 六套配色的精确色阶（脚本生成） |
| [ADR-0001](docs/decisions/0001-layered-theme-over-dom-rewrite.md) | 为什么用「官方 token 层 + 插件 CSS」，而不是重写 DOM |
| [ADR-0002](docs/decisions/0002-preference-storage.md) | 偏好为何先放 `localStorage`，以及迁移计划 |
| [变更日志](CHANGELOG.md) | 版本变更记录 |

## 仓库结构

```
package.json                  包清单：dsh.bundle / dsh.client / exports / scripts
cordis.patch.yml              bundle 补丁层（把本包 insert 进 profile 的插件表）
icon.svg                      插件管理器展示图标
LICENSE                       MIT
CHANGELOG.md                  变更日志
locale/{en,zh}.json           插件管理器静态元数据（插件列表里的标题与描述）
build/
  tsdown.client.ts            构建预设：node 半侧 ESM + 浏览器半侧 CJS 闭包工厂
  web-platform.ts             与宿主共享的模块表（客户端 bundle 的 externals）
src/
  index.ts                    Node 半侧（空实现，纯浏览器插件）
  client/index.ts             浏览器半侧入口（inject + apply + 清理）
  client/state.ts             强调色与「减少透明效果」的状态机
  client/preferences.ts       偏好持久化（localStorage，带降级）
  client/tokens.ts            官方令牌覆盖层 + 材质变量
  client/palettes.ts          六套配色（由脚本生成，勿手改）
  client/settings.tsx         设置 → 通用里的「配色」行（槽位注册 + 组件）
  client/settings.module.css  该行的样式（只读 --dsw-* 令牌）
  client/strings.ts           该行的中英文案（ctx.locale 字典）
  client/dsh-slots.d.ts       槽位服务的类型声明（坑位契约，实测得出）
  client/dsh-locale.d.ts      翻译服务的类型声明
  client/theme.module.css     令牌之外的视觉层
  client/material.module.css  材质层：玻璃、卡片、圆角、发丝线、动效
tests/                        单元测试（令牌契约、材质规则、偏好、文案键）
tools/                        推导脚本、契约校验、e2e 与性能测量
docs/                         架构、视觉规范、ADR、参考资料
```

## 开发

```bash
pnpm install          # tsdown + lightningcss + typescript + @types/{node,react} + vitest
pnpm build            # → lib/index.js（Node 半侧）+ lib/client.js（浏览器半侧）
pnpm typecheck        # tsc --noEmit
pnpm test             # vitest 单测
pnpm verify           # build + typecheck + test + 两个契约校验
```

集成测试要真实浏览器与服务，单独跑（用法见 [tools/README](tools/README.md)）：

```bash
pnpm e2e:lifecycle --url 'http://127.0.0.1:PORT/?token=...' --profile ~/.dsh/profiles/<profile>
```

## 四条约束

1. **桌面端装插件只能走应用内界面**。官方 CLI 对 `desktop` profile 硬拒绝，没有环境变量后门。
2. **不承诺像素级克隆**。DSH Go 是 Flutter 渲染，DSH 是 Web DOM，布局引擎、字体栈、滚动模型都不同。能承诺的是「视觉语言一致」，不是「截图逐像素一致」。
3. **字体不能通过官方资源路由分发**。`/plugins/<pkg>/assets/` 只服务 `.svg .png .webp .jpg .jpeg`，**不含 `.woff2`**。所以主题只用系统字体栈。
4. **品牌与吉祥物不可复用**。DSH Go 的名称标识、Deepy 小鲸鱼、鲸娘、README 展示图不在 AGPL-3.0 授权范围内。本项目全部重绘，且不使用上游任何图形。

## 许可与来源

本仓库代码以 [MIT](LICENSE) 发布。

- 本仓库**不含** DSH Go 的代码、素材、字体或图标。视觉语言是独立重实现，不做代码移植。
- [色值底账](docs/reference/palette.json) 里的色值属于**功能性数据**，由 `tools/derive-tokens.py` 从 DSH Go 公开仓库的配色常量推导而来；脚本把数值作为常量硬编码，运行时不读取、也不分发上游源码。
- DSH Go 的品牌与美术素材（名称标识、Deepy、鲸娘、展示图等）版权归 ccch1mneyyy 所有，**不在本项目的许可范围内**，本项目也不使用它们。
