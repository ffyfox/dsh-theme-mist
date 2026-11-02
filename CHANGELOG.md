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
- **「减少透明效果」偏好**：可在不改变配色的前提下关闭透明材质；偏好保存在 `localStorage`，
  卸载后不留残留。
- **设置入口**：「设置 → 通用」内新增「配色」行（`order: 11.5`，紧跟官方「外观」与「字号」），
  六套配色可在界面内切换，即时生效并持久化；中英文案经 `ctx.locale` 命名空间注册，
  切换界面语言时该行文案实时跟着变（无需刷新）。
- **配色选择器**：六个色块各显示该配色的 seed 主色与名称，色块随明暗自动取 `seed` / `seedDark`
  （经 `light-dark()`，跟随宿主在 `<html>` 上声明的 `color-scheme`）。选中态用「对勾 + 品牌色内描边
  + 品牌色浅底」三重表达，不单靠颜色。语义为 `role="radiogroup"` + `role="radio"` + `aria-checked`，
  整组只占一个 Tab 位，方向键在组内移动并跟随选中，Home / End 到两端。
- **「减少透明效果」开关**：独立一行（`order: 11.6`），原生 `role="switch"` + `aria-checked`，
  尺寸与官方开关一致（36×20）。开启后所有 `backdrop-filter` 消失、玻璃面换近不透明填充、
  输入区渐隐底改为实色；偏好持久化，卸载后可清理。
- **能力探测与降级**：宿主没有 `ctx.theme.overrideTokens` 时不再抛错——只写自有的九个 `--dsh-go-*`
  （`light-dark()` 对形式），官方令牌保持出厂值，作用域属性、设置行与偏好照旧，并记一条 warn。
  「官方令牌一个都不手写」这条由 e2e 断言守住。
- **工程与验证**：`pnpm verify` 串起构建、类型检查、单元测试、配色一致性检查与令牌契约检查；
  `tools/e2e-scenarios.mjs` 把主题推到折叠侧栏、设置弹窗、800px 宽度与 2x 显示四种边界。
  `tools/e2e-lifecycle.mjs` 覆盖安装 → 切换配色 → 卸载的完整生命周期；`tools/e2e-degraded.mjs`
  在真浏览器里验降级路径，`tools/e2e-dual-version.mjs` 把两个客户端版本拉起来逐字段 diff。

### Notes

- 性能：玻璃层在滚动场景的 A/B 实测未测到代价（同机同 Chromium 交替跑，两个条件
  都顶到刷新率上限）。测的是 Chrome 而非 Electron、脚本滚动而非真实滚轮。
- 双版本渲染：`0.2.1-alpha.1` 与 `0.2.2-alpha.2` 各起隔离实例，用同一套探针比对 39 个令牌 ×
  明暗两档、六套配色、布局矩形与模糊清单，结果逐字一致，不需要版本分支；唯一差异是宿主自己的
  类名哈希。桌面端 Electron 窗口内的确认与卸载清洁度审计、打包元数据仍在进行中。
