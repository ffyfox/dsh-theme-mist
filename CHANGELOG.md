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
- **工程与验证**：`pnpm verify` 串起构建、类型检查、单元测试、配色一致性检查与令牌契约检查；
  `tools/e2e-lifecycle.mjs` 覆盖安装 → 切换配色 → 卸载的完整生命周期。

### Notes

- 性能：玻璃层在滚动场景的 A/B 实测未测到代价（同机同 Chromium 交替跑，两个条件
  都顶到刷新率上限）。测的是 Chrome 而非 Electron、脚本滚动而非真实滚轮。
- 设置界面、双版本兼容验证、卸载清洁度审计与打包元数据仍在进行中，将在首个版本发布前补齐。
