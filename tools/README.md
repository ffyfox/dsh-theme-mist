# tools/

三个脚本。两个负责**算出** [`docs/visual-spec.md`](../docs/visual-spec.md) 里所有颜色数值（不是手抄），一个负责**校验**产物没有漂移。

## 1. `derive-tokens.py`

按 OKLCH 算法复刻 DSH Go 的配色推导，生成六套配色的精确令牌值。

```bash
python3 tools/derive-tokens.py
```

**输出**：
- `docs/reference/palette.json` — 6 套 × (25 浅色 + 26 深色中性色 + 16 个 accent 字段)，含 `caption` / `hairline` 派生值与全部对比度结果
- `docs/reference/palette-tables.md` — 可读表格
- `src/client/palettes.ts` — **给插件用的 TypeScript 模块**（CSS 可用颜色串）

**三条派生规则**（写进生成器，不手填）：

1. **深色 `caption`** = `mix(paperFaint, paperGhost, 0.30)`，六套结果为 `#8A8E98 / #879096 / #8F8C96 / #879190 / #928D87 / #8D8E91`
2. **浅色 `caption`** = `inkFaint`（与 `tertiary` 同色）。`inkFaint`(5.00) → `inkGhost`(2.24) 之间 t=0.25 就跌到 4.02，浅色侧没有第五级的空间
3. **`hairline`** = 四档 alpha：浅色 `0.08/0.12/0.25/0.30`（基色 `shadowInk` 的 RGB），深色 `0.09/0.15/0.28/0.34`（纯白）

**一个必须知道的格式陷阱**：Flutter 的 8 位 hex 是 `#AARRGGBB`，CSS 是 `#RRGGBBAA`。生成器在输出 TS 时换位；`palette.json` 保留 Flutter 原格式（供对照 Dart 源码）。漏了这步不会报错，只会静默显示成完全不同的颜色。

**stdout** 打印自检报告：算法自检、seed 一览、注释门槛核对、关键对比度、保护层探测、色域裁剪日志。

**临时实验**（不碰仓库）：
```bash
DSHGO_OUT_DIR=/tmp/x python3 tools/derive-tokens.py
```

**确定性**：重跑结果除 `elapsed_seconds`（运行耗时）一个字段外**字节级一致**。

**算法要点**（全部对照 `app/lib/ui/theme/` 下的 Dart 源码）：
- `oklch.dart` — sRGB ↔ OKLab ↔ OKLCH，超色域时 24 步二分降彩度（明度与色相不动）
- `palette.dart` — `NeutralTones.of(tintHue, tintChroma)` 对整条色阶做 `retint`；`baseHue = 266`
- `accent.dart` — 六套预设的 `tintHue` / `tintChroma` 与全部强调色字段
- `retint` 的 `hueShift == 0 && chromaScale == 1` 早退（所以 `mist` 逐字节等于源码常量）
- Dart 的 `round()` 半远离零语义

## 2. `check-dart-constants.py`

把脚本里硬编码的常量与 Dart 源码逐字比对，排除抄写错误。

```bash
# 需要先拿到参考源码（见下方「参考源码」）
python3 tools/check-dart-constants.py /path/to/dsh-Go/app/lib/ui/theme
```

**输出**：常量数统计 + 不一致条数 + `Verdict: PASS/FAIL`。

当前基线：`palette=51, defaults=51, accent 字段=101`，**不一致 0**。

## 3. `check-palettes.mjs`

校验 `src/client/palettes.ts` 没有被手改、派生规则没走样、颜色格式没错位。

```bash
node tools/check-palettes.mjs
```

**它查三件事**：

| 组 | 检查 | 为什么值得查 |
|---|---|---|
| 漂移 | 重跑到临时目录，与仓库里的 `palettes.ts` 逐字比对（忽略耗时字段） | 它是生成文件，手改会在下次生成时被冲掉，而且不易察觉 |
| 派生规则 | 六套深色 `caption` 的六个已知值、浅色 `caption === inkFaint`、`hairline` 八档 alpha | 这三条是"看起来像小调整、实际把对比度打穿"的位置 |
| 颜色格式 | 只有 `slateContainerDark` 允许 8 位 hex，且必须是 `#FFFFFF17` | Flutter 源是 `#17FFFFFF`；写反了浏览器不会报错 |

失败即 exit 1。

## 4. `e2e-lifecycle.mjs`

在**真实页面**上验证主题的挂载、切换与卸载。这是集成测试，需要外部环境，所以**不在** `pnpm verify` 里。

```bash
# 先起服务和 headless Chrome
dsh --profile <profile> --no-open --port 3190
google-chrome-stable --headless --no-sandbox --remote-debugging-port=9333 --user-data-dir=/tmp/x about:blank

# 再跑（URL 要带 token）
node tools/e2e-lifecycle.mjs \
  --url 'http://127.0.0.1:3190/?token=<TOKEN>' \
  --profile ~/.dsh/profiles/<profile> \
  --cycles 10
```

它通过改 profile 的 `cordis.patch.yml` 加 `disabled: true` 来启停插件（HMR 热生效，**不刷新页面**），所以验的是真实的 unload/load 路径，而不是重新加载。

**三组断言**：

| 组 | 查什么 |
|---|---|
| 基线/启用 | 禁用态无主题属性、无自带 style；启用后 6 个探针 token 全部改变，style 数恰好 2（`theme.module.css` + `material.module.css`，恰好等于 `src/client` 下的模块样式表数） |
| 六套切换 | 每套的 `data-dsh-go-accent` 正确、style 数不增长、六套 token 组合互不相同（防「切换没生效但属性变了」） |
| 卸载与泄漏 | 禁用后 6 个 token 与基线 **逐字相同**、body 内联属性数复原；N 次启停后 style 数与属性集合不变 |

**安全**：脚本拒绝操作 `~/.dsh/profiles/` 之外的路径，且退出时（含异常）恢复原始 `cordis.patch.yml`。

实测基线（2026-11-02，0.2.1-alpha.1 web）：`--dsw-alias-bg-base #fff → #F0F4FD → #fff`，六套配色互异，10 次启停零泄漏。

## 5. `perf-scroll.mjs`

**滚动代价的 A/B 测试**（阶段 2 的性能验收项，补阶段 0 遗留的空白）。必须在**有头** Chrome 里跑：headless 是软件渲染，帧率没有代表性。

```bash
google-chrome-stable --user-data-dir=/tmp/go-theme-perf --remote-debugging-port=9444 about:blank
node tools/perf-scroll.mjs --url 'http://127.0.0.1:3190/?token=<TOKEN>' --cdp-port 9444 --runs 3
```

它打开长会话、脚本化滚动、记录每帧间隔，然后**交替**跑两个条件：

| 条件 | 做法 |
|---|---|
| `glass` | 出厂状态（composer seat 上有 `blur(18px)`） |
| `no-blur` | 注入一条只把 `--dsh-go-glass-blur` 置 `none` 的样式，**填充不变**，唯一变量就是那层模糊 |

输出 fps / p50 / p95 / max / >17ms / >33ms 与主线程 `TaskDuration`。会自己展开侧栏（新 profile 默认是图标栏）并打开一个长会话，找不到可滚动的会话就报错退出。

实测结论：在当前机器上单层模糊**无可测代价**（两个条件都顶到 120 Hz）。边界是 Chrome 而非 Electron、脚本滚动而非真实滚轮、单机数据。

## 6. `e2e-degraded.mjs`

降级路径（T4.2）：把 `lib/client.js` 装进一个只有 `window.__ModuleLoader__` 桩的静态页，喂一个**没有 `overrideTokens`** 的假 context，用真浏览器验「不崩、有日志、样式部分生效」。

```bash
pnpm build
node tools/e2e-degraded.mjs            # 自带静态服务与 headless Chrome
node tools/e2e-degraded.mjs --chrome chromium --keep
```

14 条断言：装载、`apply()` 不抛、恰好一条含 `overrideTokens` 的 warn（走 `ctx.logger` 而非 console）、作用域属性与 accent 仍写入、两行设置仍注册、九个 `--dsh-go-*` 全是 `light-dark()` 对、**没有任何 `--dsw-*` 被手写**、页面渐变仍绘制、样式表已注入、无未捕获异常，以及卸载后属性 / 变量 / 渐变全部消失。

## 7. `e2e-dual-version.mjs`

双版本一致性（T4.1）：同一套探针在 0.2.1-alpha.1（CLI）与 0.2.2-alpha.2（桌面端运行时）上各跑一遍，再逐字段 diff。

```bash
pnpm build
node tools/e2e-dual-version.mjs --desktop-runtime /path/to/resources/app/dsh
# 可选 --web-profile t1verify --shots /tmp/shots --keep --chrome chromium
```

它会自己起两侧的服务：Web 侧用 `dsh` 打指定 profile；桌面侧用桌面端自带运行时（`--desktop-runtime`）配**临时 `DSH_HOME`** 和一个只声明本插件的临时 profile——**不碰真实 `desktop` profile、不重启应用**。

15 条断言：两侧都挂载、各 3 张自有样式表、设置面板可打开且六色块 + 开关齐全、两侧都能进深色、无页面异常，以及**逐字段一致**——39 个令牌 × 浅色 / 面板 / 深色三态、布局矩形、模糊清单、页面渐变、`data-dsh-go-*` 属性、六套配色的 `brand-primary` 与 `page-base`。

比对前会**强制两侧切到同一外观**（profile 里记住的深色不是版本差异），跑完恢复原样；宿主的行数与样式表总数只打印、不参与 diff。

## 8. `e2e-scenarios.mjs`

交叉场景回归（T4.3）：在真实浏览器里把主题推到几种边界状态，每个状态留一张截图。

```bash
pnpm build
node tools/e2e-scenarios.mjs --desktop-runtime /path/to/resources/app/dsh
# 可选 --profile t1verify --home `/.dsh --shots /tmp/shots --keep
```

它**只读**现有 profile 的会话：不建会话、不发消息，唯一变化是「当前打开哪个会话」。原因写在脚本头部——手写的会话日志能被服务端投影（`session/projections` 返回 ok，`session/list` 也包含它），但客户端侧栏不列它，从 UI 打不开（2026-11-02 实测）。

15 条断言：会话页上主题在、有 markdown 可看、设置弹窗能开且**插件自身不注入任何 DOM**（宿主最高 z-index 1000，插件 0）、模糊仍只有 1 处、侧栏折叠成 55px 后材质仍在、代码面取到调色板的 code well、语法高亮保留、800px 宽度无横向溢出、2x 下不破版、六套配色在内容多的页面上仍能切、全程无页面异常。

**未覆盖**（脚本会打印）：右栏、含长表格 / diff 的会话、交互式终端面板——侧栏只列每个工作区的最新会话，扫不到这些内容，需要先在应用里把这些会话打开过一次。

## 参考源码

两个脚本都不联网。需要参考源码时：

```bash
git clone --depth 1 https://github.com/ccch1mneyyy/dsh-Go.git /tmp/dsh-go
# 或固定提交（本文档引用的版本）
git -C /tmp/dsh-go fetch --depth 1 origin ca3c4202f0110a9a10311034d532eafd9ee2e290
git -C /tmp/dsh-go checkout ca3c4202f0110a9a10311034d532eafd9ee2e290
```

我们分析时用的固定提交：`ca3c4202f0110a9a10311034d532eafd9ee2e290`（`git ls-remote` 实测，2026-11-01）。

> ⚠️ **不要把参考源码提交进本仓库**。`derive-tokens.py` 只是把数值硬编码为常量以便独立运行；它**不读取** Dart 文件。只有 `check-dart-constants.py` 需要源码目录。

## 许可注意

两个脚本是**独立实现**，不复制 DSH Go 的 Dart 代码。它们读取源码仅用于**数值比对**（事实核对），这在 `docs/licensing.md` §3 有说明（内部文档，未随仓库分发）。

OKLab/OKLCH 的转换矩阵来自 Björn Ottosson 2020 年的公开域（public domain）发表，DSH Go 的 `oklch.dart:2` 也注明了同一来源。
