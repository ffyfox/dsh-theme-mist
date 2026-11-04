# Mist 主题 (`dsh-theme-mist`)

**简体中文** | [English](README.en.md)

为 **DeepSeek Harness**（桌面端与 Web 端）打造的客户端视觉主题插件。

设计灵感源自 [DSH Go](https://github.com/ccch1mneyyy/dsh-Go)，将移动端参考设计的色彩、材质与圆角语言移植到桌面/Web 端，以**低饱和中性色、分层的玻璃与纸墨质感、0.5px 发丝描边、悬浮毛玻璃与右上角单点光晕**重塑界面质感。

<table>
  <tr>
    <td width="50%"><img src="docs/images/hero-light.webp" width="100%" alt="浅色模式"><br><sub><b>浅色</b> · 雾蓝 · 玻璃侧栏</sub></td>
    <td width="50%"><img src="docs/images/hero-dark.webp" width="100%" alt="深色模式"><br><sub><b>深色</b> · 雾蓝 · 玻璃侧栏</sub></td>
  </tr>
</table>

---

## 预览

主题内置六套强调色，右上角氛围光晕、主操作按钮、选中态与同色相纸墨底色随配色联动。

<table>
  <tr>
    <td align="center"><img src="docs/images/accents/mist.webp" width="300" alt="雾蓝"><br><sub><b>雾蓝</b></sub></td>
    <td align="center"><img src="docs/images/accents/daiqing.webp" width="300" alt="黛青"><br><sub><b>黛青</b></sub></td>
    <td align="center"><img src="docs/images/accents/dusk.webp" width="300" alt="暮紫"><br><sub><b>暮紫</b></sub></td>
  </tr>
  <tr>
    <td align="center"><img src="docs/images/accents/turquoise.webp" width="300" alt="松石"><br><sub><b>松石</b></sub></td>
    <td align="center"><img src="docs/images/accents/amber.webp" width="300" alt="琥珀"><br><sub><b>琥珀</b></sub></td>
    <td align="center"><img src="docs/images/accents/graphite.webp" width="300" alt="石墨"><br><sub><b>石墨</b></sub></td>
  </tr>
</table>

---

## 特性

- **六套配色 × 明暗三态**：支持「雾蓝、黛青、暮紫、松石、琥珀、石墨」六套配色，并与官方「浅色 / 深色 / 跟随系统」无缝叠加；浅色采用微染冷白纸面，深色采用偏蓝的深石板色（不是纯黑），全部 12 种组合均通过 WCAG AA 对比度校验。
- **克制的强调色比例**：强调色仅用于主按钮、关键选中态与右上角柔和光晕，大面积背景与卡片依靠明度层级和发丝细线拉开空间感。
- **真实毛玻璃与双档侧栏材质**：底部输入区采用悬浮毛玻璃，滚动对话时消息从输入卡背后自然透出；左侧栏提供 **玻璃** 与 **平铺** 两种材质。
- **原生设置集成 & 零残留卸载**：直接嵌入官方「设置 → 通用设置」面板，无需手改配置文件；禁用或卸载后，所有令牌与样式表完整还原为官方默认外观。

---

## 安装

### 桌面端
1. 先在本地克隆并构建产物（若已包含构建好的 `lib/` 目录可跳过构建）：
    ```bash
   git clone <仓库地址> dsh-theme-mist
   cd dsh-theme-mist
   pnpm install && pnpm build
    ```
2. 打开桌面端左侧栏 **「插件」→「添加插件」**，输入 `dsh-theme-mist` 本地目录即可。

### Web 端

```bash
pnpm install && pnpm build
dsh plugin --profile web add "$(pwd)"
```

---

## 个性化设置

安装启用后，打开 **「设置 → 通用设置」**，即可看到新增的两项主题设置：

| 设置项 | 选项 | 说明 |
|---|---|---|
| **配色** | `雾蓝` · `黛青` · `暮紫` · `松石` · `琥珀` · `石墨` | 点击色块即时切换。 |
| **侧栏材质** | `玻璃`（默认） · `平铺` | **玻璃**：半透明抽屉底板配 0.5px 发丝描边与右侧大圆角；**平铺**：去除底板，让页面渐变与光晕直接贯穿三栏。 |

<img src="docs/images/settings.webp" width="800" alt="设置 → 通用：外观、字号、配色、侧栏材质同框">

两种侧栏材质对比（同一配色）：

<table>
  <tr>
    <td align="center"><img src="docs/images/sidebar-sheet.webp" width="300" alt="玻璃侧栏"><br><sub><b>玻璃</b>（默认）</sub></td>
    <td align="center"><img src="docs/images/sidebar-flat.webp" width="300" alt="平铺侧栏"><br><sub><b>平铺</b></sub></td>
  </tr>
</table>

---

## 卸载

- **桌面端**：进入 **「插件」** 页面，找到 **Mist 主题 (`dsh-theme-mist`)** 点击移除即可。
- **Web 端**：
  ```bash
  dsh plugin --profile web remove dsh-theme-mist
  ```

---

## 开发与文档

```bash
pnpm install          # 安装依赖
pnpm build            # 构建 lib/index.js 与 lib/client.js
pnpm verify           # 运行全量检查（构建 + 类型检查 + 单元测试 + 配色/令牌/打包契约校验）
```

如需了解底层实现细节、令牌推导算法与端到端测试工具，可参阅仓库内文档：

- [架构设计 (`docs/architecture.md`)](docs/architecture.md)：插件加载链路、三层主题架构与清理契约
- [视觉规范 (`docs/visual-spec.md`)](docs/visual-spec.md)：OKLCH 色彩推导、对比度矩阵、页面渐变与光晕、四层玻璃材质配方
- [配色色阶表 (`docs/reference/palette-tables.md`)](docs/reference/palette-tables.md)：六套配色的浅色/深色完整色值表
- [工具集说明 (`tools/README.md`)](tools/README.md)：令牌生成脚本、双版本回归测试与预览图自动拍摄脚本
- [变更日志 (`CHANGELOG.md`)](CHANGELOG.md)：版本迭代记录

---

## 许可与致谢

本项目以 **[MIT License](LICENSE)** 开源，详细第三方致谢与洁净室实现声明见 **[NOTICE](NOTICE)**。

- **独立重实现声明**：本项目的设计灵感参考自 [DSH Go](https://github.com/ccch1mneyyy/dsh-Go)（部分早期主题语汇源自 [PiPilot](https://github.com/CikeSeven/pi_pilot)，MIT）。本仓库所有 TypeScript/CSS 代码、图标资源与 OKLCH 色彩推导脚本（`tools/derive-tokens.py`）均为独立编写，**未复制任何上游 Dart 源码，亦不包含任何 DSH Go 的品牌标识、吉祥物或美术资源**。
- **非官方声明**：本项目为第三方社区插件，与 DSH Go、DSH-TUI、ccch1mneyyy 及 DeepSeek 官方均无关联或背书关系。
