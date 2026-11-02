# ADR-0002：v1 的配色偏好用 localStorage，v2 迁移到 Host settings

## Status

Accepted（2026-11-01）— 已知为临时方案，已规划迁移

## Date

2026-11-01

## Context

插件需要记住用户选的配色（六选一）与「减少透明效果」开关。

官方提供两条路：

**路 A：Host settings**（`ctx.configForms.get(entryId)`）
- 写入 `$DSH_HOME/cordis.patch.yml`
- 每个已认证浏览器共享同一份偏好
- 有 schema 校验、revision 冲突检测
- 官方 `ui-theme` 自己就是这么做的（`dsh-client-ui-theme/README.zh.md:100-102`）

**路 B：浏览器 `localStorage`**
- 每个浏览器独立
- 无 schema，需自己校验
- 实现成本极低

约束：
1. Host settings 需要在 **Node 半侧**声明 settings entry 与 schema，插件从"纯展示"变成"有 Host 状态"，复杂度显著上升
2. 官方`configForms` 的用法在本机只有一个第三方参考（`skin-manager`），且它**没有**用 Host settings，而是用了 `localStorage`（`skin-manager/src/client/preferences.ts:4, 106-110`）
3. v1 的目标是**尽快跑通视觉闭环**，不是做完整的偏好体系

## Decision

**v1 用 `localStorage`**，键 `dsh.go-theme.preferences.v1`，结构：

```ts
interface GoThemePreferences {
  accent: AccentId          // 'mist' | 'daiqing' | ... 默认 'mist'
  reduceMaterial: boolean   // 默认 false
}
```

读取时逐字段白名单校验：未知 accent 回落 `mist`，非布尔值回落默认；JSON 解析失败整体回落默认值，不抛异常；`localStorage` 不可用（隐私模式/被禁用）时降级为内存态并 warn。

**v2 迁移计划**：等 v1 视觉稳定后，在 Node 半侧声明 settings entry，用 `ctx.configForms.get()` 接管，并在读取时做一次 `localStorage` → Host settings 的一次性迁移。

## Alternatives Considered

### 直接用 Host settings（跳过 localStorage）

**优点**：一步到位，符合官方推荐，跨设备一致。

**缺点**：
- 需要在 Node 半侧写 schema 与 settings entry，v1 阶段这是在为"还没验证的视觉"付架构成本
- 官方 `configForms` 的第三方用法缺乏足够参考样例，踩坑成本未知
- 若视觉方案在阶段 0 被证伪，这部分工作全部作废

**结论：推迟到 v2。**

### 写插件自有 JSON（`~/.dsh/dsh-go-theme/config.json`）

**优点**：完全可控，可跨浏览器（同一 `DSH_HOME`）。

**缺点**：
- 要在 Node 半侧注册 HTTP 路由 + 原子写 + 并发控制
- 这套轮子官方 `settings` 已经造好了，自己再写一遍是重复
- 工作量介于 A 与 B 之间，收益却不如 A

**结论：拒绝，直接等 v2 上 A。**

## Consequences

**正面**
- 阶段 1 可以在一天内跑通"切换配色并记住"
- 不引入 Node 半侧状态，插件保持"纯展示"
- 视觉方案若被推翻，删掉一个文件即可

**负面（必须写进文档告知用户）**
- **偏好不跨浏览器**：同一台机器上 Chrome 与 Safari 打开会各自不同
- **偏好不跨设备**：桌面端与 Web 端如果指向同一个 `DSH_HOME`，配色仍各自独立
- 与官方"主题偏好写 Host settings"的体验**不一致**——用户可能困惑"为什么明暗能记住、配色不能"
- 清理浏览器数据会丢配色

**已记录的风险**：迁移时需重新评估 Node 半侧引入 Host 状态后的复杂度（原风险台账属内部文档，未随仓库分发）。
