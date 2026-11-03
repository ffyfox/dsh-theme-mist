# Mist 主题 (`dsh-theme-mist`)

为 **DeepSeek Harness**（桌面端与 Web 端）打造的客户端视觉主题插件。

设计灵感源自 [DSH Go](https://github.com/ccch1mneyyy/dsh-Go)，以**低饱和东方色韵、分层纸墨表面、0.5px 发丝描边、悬浮毛玻璃与右上角单点光晕**重塑界面质感——同时**完整保留官方三栏布局与交互逻辑**，即装即用，卸载无残留。

---

## 预览 · 六套配色

主题内置六套强调色，右上角氛围光晕、主操作按钮、选中态与同色相纸墨底色随配色联动，点击图片可查看大图：

<table>
  <tr>
    <td align="center"><img src="docs/images/accents/mist.png" width="400" alt="雾蓝 Mist"><br><sub><b>雾蓝 Mist</b>（默认 · 冷白雾纸）</sub></td>
    <td align="center"><img src="docs/images/accents/daiqing.png" width="400" alt="黛青 Daiqing"><br><sub><b>黛青 Daiqing</b>（深青瓷釉）</sub></td>
    <td align="center"><img src="docs/images/accents/dusk.png" width="400" alt="暮紫 Dusk"><br><sub><b>暮紫 Dusk</b>（暮色微岚）</sub></td>
  </tr>
  <tr>
    <td align="center"><img src="docs/images/accents/turquoise.png" width="400" alt="松石 Turquoise"><br><sub><b>松石 Turquoise</b>（温润松绿）</sub></td>
    <td align="center"><img src="docs/images/accents/amber.png" width="400" alt="琥珀 Amber"><br><sub><b>琥珀 Amber</b>（暖金松脂）</sub></td>
    <td align="center"><img src="docs/images/accents/graphite.png" width="400" alt="石墨 Graphite"><br><sub><b>石墨 Graphite</b>（纯粹水墨）</sub></td>
  </tr>
</table>

---

## 特性一览

- **六套配色 × 明暗三态**：支持「雾蓝、黛青、暮紫、松石、琥珀、石墨」六套配色，并与官方「浅色 / 深色 / 跟随系统」无缝叠加；浅色采用微染冷白纸面，深色采用不刺眼的暖黑墨色，全部 12 种组合均通过 WCAG AA 对比度校验。
- **克制的强调色比例**：强调色仅用于主按钮、关键选中态与右上角柔和光晕（占比 ≤ 5%），大面积背景与卡片依靠明度层级和发丝细线拉开空间感，长时间阅读不疲劳。
- **真实毛玻璃与双档侧栏材质**：底部输入区采用悬浮毛玻璃，滚动对话时消息从输入卡背后自然透出；左侧栏提供**「玻璃」**（半透明抽屉质感 + 28px 圆角）与**「平铺」**（无底板融入背景渐变）两种材质。
- **原生设置集成 & 零残留卸载**：直接嵌入官方「设置 → 通用」面板，无需手改配置文件；禁用或卸载后，所有令牌与样式表完整还原为官方默认外观。

---

## 快速安装

**环境要求**：DeepSeek Harness `>= 0.2.1-alpha.1 < 0.3.0`（支持官方桌面端与 Web 端）。

### 方式一：桌面端（Desktop）

1. 先在本地克隆并构建产物（若已包含构建好的 `lib/` 目录可跳过构建）：
   ```bash
   git clone <仓库地址> dsh-theme-mist
   cd dsh-theme-mist
   pnpm install && pnpm build
   ```
2. 打开桌面端左侧栏 **「插件（Plugins）」→「添加插件（Add plugin）」→「本地目录」**，选择 `dsh-theme-mist` 目录即可。

> **提示**：桌面端的 `desktop` 配置环境由客户端应用独占管理，无法通过命令行 `dsh plugin` 操作，请直接使用应用内界面安装。

### 方式二：Web 端（CLI）

```bash
pnpm install && pnpm build
dsh plugin --profile web add "$(pwd)"
```

> **提示**：如果想在独立的 profile 中体验主题，请先基于 `web` 模板初始化，再安装插件：
> ```bash
> dsh my-web --from-default-profile web   # 首次启动完成初始化后按 Ctrl-C 退出
> dsh plugin --profile my-web add "$(pwd)"
> ```

---

## 个性化设置

安装启用后，打开 **「设置 → 通用（Settings → General）」**，在官方「外观」与「字号」下方即可看到新增的两项主题设置：

| 设置项 | 选项 | 说明 |
|---|---|---|
| **配色（Accent）** | `雾蓝` · `黛青` · `暮紫` · `松石` · `琥珀` · `石墨` | 点击色块即时切换，无需刷新页面；自动适配当前浅色/深色/跟随系统模式。 |
| **侧栏材质（Sidebar material）** | `玻璃`（默认） · `平铺` | **玻璃**：半透明抽屉底板配 0.5px 发丝描边与右侧大圆角；**平铺**：去除底板，让页面渐变与光晕直接贯穿三栏。 |

<details>
<summary><b>进阶：通过脚本或控制台事件切换（点击展开）</b></summary>

主题同时监听浏览器自定义事件，与设置面板共享同一份状态并自动持久化到 `localStorage`：

```js
// 切换强调色：'mist' | 'daiqing' | 'dusk' | 'turquoise' | 'amber' | 'graphite'
window.dispatchEvent(new CustomEvent('dsh-theme-mist:accent', { detail: 'daiqing' }))

// 切换侧栏材质：'sheet'（玻璃） | 'flat'（平铺）
window.dispatchEvent(new CustomEvent('dsh-theme-mist:sidebar-material', { detail: 'flat' }))
```

</details>

---

## 卸载

- **桌面端**：进入 **「插件」** 页面，找到 **Mist 主题 (`dsh-theme-mist`)** 点击移除即可。
- **Web 端（CLI）**：
  ```bash
  dsh plugin --profile web remove dsh-theme-mist
  ```

卸载后界面会立即恢复为官方默认外观。你上次选择的配色偏好保存在浏览器的 `localStorage` 中，方便重装时延续习惯；如需一并清除，可在浏览器控制台执行：

```js
localStorage.removeItem('dsh.theme-mist.preferences.v1')
```

---

## 设计边界与注意事项

1. **只换视觉，不改交互架构**：本插件将移动端参考设计的色彩、材质与圆角语言移植到桌面/Web 端，但**不改变**官方原有的三栏布局、导航结构或工具调用展示方式。
2. **尊重系统与用户字体偏好**：受限于官方插件静态资源路由策略（不支持 `.woff2` 字体分发），本主题不捆绑额外字体文件，完全沿用宿主字体栈及你在设置中选择的字号与字体。
3. **不包含桌宠与第三方品牌标识**：仅提供纯粹的界面色彩与材质主题，不含任何吉祥物挂件或外部品牌图标。
4. **避免多皮肤混用**：请勿与其他第三方视觉主题插件同时启用，以免底层 `--dsw-*` 颜色令牌相互覆盖导致配色异常。

---

## 开发与文档

```bash
pnpm install          # 安装依赖
pnpm build            # 构建 lib/index.js 与 lib/client.js
pnpm verify           # 运行全量检查（构建 + 类型检查 + 单元测试 + 配色/令牌/打包契约校验）
```

如需了解底层实现细节、令牌推导算法与端到端测试工具，可参阅仓库内文档：

- [架构设计 (`docs/architecture.md`)](docs/architecture.md)：插件加载链路、三层主题架构与清理契约
- [视觉规范 (`docs/visual-spec.md`)](docs/visual-spec.md)：OKLCH 色彩推导、对比度矩阵、五层背景穿透与玻璃材质配方
- [配色色阶表 (`docs/reference/palette-tables.md`)](docs/reference/palette-tables.md)：六套配色的浅色/深色完整色值表
- [工具集说明 (`tools/README.md`)](tools/README.md)：令牌生成脚本、双版本回归测试与预览图自动拍摄脚本
- [变更日志 (`CHANGELOG.md`)](CHANGELOG.md)：版本迭代记录

---

## 许可与致谢

本项目以 **[MIT License](LICENSE)** 开源，详细第三方致谢与洁净室实现声明见 **[NOTICE](NOTICE)**。

- **独立重实现声明**：本项目的设计灵感参考自 [DSH Go](https://github.com/ccch1mneyyy/dsh-Go)（部分早期主题语汇源自 [PiPilot](https://github.com/CikeSeven/pi_pilot)，MIT）。本仓库所有 TypeScript/CSS 代码、图标资源与 OKLCH 色彩推导脚本（`tools/derive-tokens.py`）均为独立编写，**未复制任何上游 Dart 源码，亦不包含任何 DSH Go 的品牌标识、吉祥物或美术资源**。
- **非官方声明**：本项目为第三方社区插件，与 DSH Go、DSH-TUI、ccch1mneyyy 及 DeepSeek 官方均无关联或背书关系。
