# DSH Go 配色令牌（脚本推导，勿手改）

由 `derive_tokens.py` 复刻 DSH Go 的 OKLCH 推导生成。中性色 = 雾蓝基线整条 `retint(hueShift = tintHue - 266, chromaScale = tintChroma)`，**明度零位移**，因此六套配色的文字对比度完全一致。

- 参考源码：`<dsh-Go 检出目录>/app/lib/ui/theme/`（公开仓库，未随本仓库分发）
- 数据性质：色值为功能性数据，由脚本从上游公开仓库的配色常量推导；本仓库不含上游的代码、素材或字体
- 算法：`oklch.dart`（sRGB <-> OKLab <-> OKLCH，超色域 24 步二分降彩度）、`palette.dart`（`NeutralTones.of`，baseHue 266）、`accent.dart`（六套预设）
- alpha 全保留：不透明写 `#RRGGBB`，半透明写 `#AARRGGBB`

## 1. 推导规模与耗时

| 项 | 值 |
|---|---|
| 脚本耗时 | 0.005 s |
| toColor 调用 | 584 次 |
| 触发色域裁剪（24 步二分降彩度） | 1 次 |
| 中性色令牌 | 6 套 x 51 = 306 个 |

## 2. 六套强调色一览

| 配色 | tintHue | tintChroma | seed | pressed | container | onContainer | bubble | glow |
|---|---|---|---|---|---|---|---|---|
| mist | 266 | 1 | `#4B67B4` | `#3D569D` | `#DEE8FF` | `#213262` | `#D9E4FD` | `#ABC3FC` |
| daiqing | 238 | 0.9 | `#236185` | `#145071` | `#DBEAF5` | `#123950` | `#D6E7F3` | `#A2CAE5` |
| dusk | 295 | 0.85 | `#726291` | `#61517D` | `#EAE5F4` | `#392F4C` | `#E6E1F1` | `#C8BDE1` |
| turquoise | 190 | 0.7 | `#34766F` | `#296760` | `#DBECE9` | `#123D39` | `#D6E8E6` | `#A3CEC8` |
| amber | 75 | 0.75 | `#8D6636` | `#7A5528` | `#F2E6D9` | `#483011` | `#EEE2D3` | `#DCBE9D` |
| graphite | 262 | 0.25 | `#2C2E32` | `#1D1F23` | `#E3E6EC` | `#2C2E32` | `#E0E3E8` | `#BBBEC3` |

| 配色 | seedDark | pressedDark | onSeedDark | containerDark | onContainerDark | bubbleDark | glowDark | haze | hazeDark |
|---|---|---|---|---|---|---|---|---|---|
| mist | `#97B1F0` | `#859EDC` | `#121C34` | `#2E3C5F` | `#D8E1F6` | `#293144` | `#51679D` | `#D5CBEB` | `#514765` |
| daiqing | `#8CB9D7` | `#79A6C4` | `#0D1F2B` | `#274152` | `#D5E3ED` | `#26333C` | `#466E88` | `#C7D0EC` | `#444C66` |
| dusk | `#B8ABD2` | `#A598BF` | `#1F1A29` | `#40394F` | `#E2DEEC` | `#332F3B` | `#6D6284` | `#E6C7D7` | `#5F4353` |
| turquoise | `#8DBEB7` | `#7BABA4` | `#0D211F` | `#274340` | `#D6E5E2` | `#263533` | `#47726D` | `#B9D7E3` | `#34525E` |
| amber | `#CCAC87` | `#B99975` | `#271A0C` | `#4C3A25` | `#EADFD3` | `#392F24` | `#7F6343` | `#EAC8C1` | `#64443D` |
| graphite | `#E5E8ED` | `#CED1D6` | `#191B1E` | `#3B3D41` | `#DEE1E7` | `#2E3034` | `#616368` | `#CED1D6` | `#4A4D52` |

## 3. 算法自检

| 检查 | 期望 | 实测 | 结论 |
|---|---|---|---|
| #4D6BFE -> OKLCH | `(0.59, 0.22, 270)` | `(0.59, 0.22, 270)` | OK |
| OKLCH(0.53,0.125,267) -> hex | `#4B67B4` | `#4B67B4` | OK |
| 白字对 mist.seed | `5.39` | `5.39` | OK |
| sRGB->OKLCH->sRGB 往返恒等（60 个常量） | `0 失败` | `失败 0: []` | OK |
| retint 早退保留 alpha (0x17FFFFFF) | `#17FFFFFF` | `#17FFFFFF` | OK |
| retint 后 alpha 仍为 0x17 | `#17` | `#17` | OK |
| retint 不变量: |dL| 最大（306 个样本） | `<= 0.0035` | `0.0020 (turquoise/shadowNight)` | OK |
| retint 不变量: 彩度绝对偏差最大（306 个样本） | `<= 0.0030` | `0.0017 (dusk/shadowNight)` | OK |
| retint 不变量: |dH - shift| 最大（8 个 c>=0.03 样本） | `<= 2.5 deg` | `2.267 deg (turquoise/shadowInk)` | OK |

## 4. 完整色阶：mist 与 graphite

### 4.1 mist

| 浅色 token | 角色 | hex | 深色 token | 角色 | hex |
|---|---|---|---|---|---|
| `mistTop` | 页面渐变顶 | `#EBF1FE` | `nightTop` | 页面渐变顶 | `#1D222C` |
| `mistBottom` | 页面渐变底 | `#F6F7FC` | `nightBottom` | 页面渐变底 | `#1B1C23` |
| `mist` | 不透明页面底 | `#F0F4FD` | `night` | 不透明页面底 | `#1C1F28` |
| `mistLowest` | 面色最低阶 | `#FBFCFF` | `nightLowest` | 面色最低阶 | `#14171E` |
| `mistLow` | 面色低阶 | `#F6F9FE` | `nightLow` | 面色低阶 | `#232730` |
| `mistContainer` | 面色容器 | `#EEF1F9` | `nightContainer` | 面色容器 | `#272C36` |
| `mistHigh` | 面色高阶 | `#E7EBF4` | `nightHigh` | 面色高阶 | `#2D323C` |
| `mistHighest` | 面色最高阶 | `#DFE4EE` | `nightHighest` | 面色最高阶 | `#343944` |
| `ink` | 主文字 | `#1E232E` | `paper` | 主文字 | `#E6E9F0` |
| `inkMuted` | 次级文字 | `#4F5562` | `paperMuted` | 次级文字 | `#B6BBC5` |
| `inkFaint` | 三级文字 | `#646974` | `paperFaint` | 三级文字 | `#9A9EA9` |
| `inkGhost` | 禁用/装饰 | `#A1A5AC` | `paperGhost` | 禁用/装饰 | `#656971` |
| `outlineLight` | 交互边界 | `#7E838D` | `outlineDark` | 交互边界 | `#737781` |
| `ruleLight` | 分割线 | `#DCE0E8` | `ruleDark` | 分割线 | `#343841` |
| `shadowInk` | 阴影基色 | `#0B152D` | `shadowNight` | 阴影基色 | `#03060D` |
| `slate` | secondary | `#545E6F` | `slateLift` | secondary | `#B3BED2` |
| `slateContainer` | secondaryContainer | `#E2E6F0` | `onSlateLift` | onSecondary | `#1A2230` |
| `inverseSurface` | inverseSurface | `#252A35` | `smoke` | 玻璃 chrome | `#292E39` |
| `onInverseSurface` | onInverseSurface | `#ECEEF4` | `sheetDark` | 弹层底 | `#232832` |
| `scrim` | 遮罩基色 | `#0B111F` | `codeWellDark` | 代码井底 | `#14171E` |
| `codeWell` | 代码井底 | `#EDF0F6` | `codeWellHeaderDark` | 代码井标题条 | `#1A1E26` |
| `codeWellHeader` | 代码井标题条 | `#E7EBF3` | `codeWellBorderDark` | 代码井描边 | `#2F333A` |
| `codeWellBorder` | 代码井描边 | `#DBDEE5` | `lineNumberDark` | 行号 | `#71747D` |
| `lineNumber` | 行号 | `#7D8088` | `commentDark` | 代码注释 | `#868C97` |
| `comment` | 代码注释 | `#636975` | `terminal` | 终端卡 | `#12151C` |
|  |  |  | `terminalKey` | 终端按键 | `#262A33` |

### 4.2 graphite

| 浅色 token | 角色 | hex | 深色 token | 角色 | hex |
|---|---|---|---|---|---|
| `mistTop` | 页面渐变顶 | `#EFF1F4` | `nightTop` | 页面渐变顶 | `#212224` |
| `mistBottom` | 页面渐变底 | `#F7F7F8` | `nightBottom` | 页面渐变底 | `#1C1C1E` |
| `mist` | 不透明页面底 | `#F3F4F6` | `night` | 不透明页面底 | `#1E1F21` |
| `mistLowest` | 面色最低阶 | `#FCFCFD` | `nightLowest` | 面色最低阶 | `#161719` |
| `mistLow` | 面色低阶 | `#F8F9FA` | `nightLow` | 面色低阶 | `#262729` |
| `mistContainer` | 面色容器 | `#F0F1F3` | `nightContainer` | 面色容器 | `#2A2C2E` |
| `mistHigh` | 面色高阶 | `#EAEBED` | `nightHigh` | 面色高阶 | `#303234` |
| `mistHighest` | 面色最高阶 | `#E2E4E6` | `nightHighest` | 面色最高阶 | `#38393C` |
| `ink` | 主文字 | `#222326` | `paper` | 主文字 | `#E8E9EB` |
| `inkMuted` | 次级文字 | `#535558` | `paperMuted` | 次级文字 | `#B9BBBD` |
| `inkFaint` | 三级文字 | `#67696C` | `paperFaint` | 三级文字 | `#9D9EA1` |
| `inkGhost` | 禁用/装饰 | `#A4A5A6` | `paperGhost` | 禁用/装饰 | `#68696B` |
| `outlineLight` | 交互边界 | `#818385` | `outlineDark` | 交互边界 | `#76777A` |
| `ruleLight` | 分割线 | `#DFE0E2` | `ruleDark` | 分割线 | `#37383A` |
| `shadowInk` | 阴影基色 | `#13161C` | `shadowNight` | 阴影基色 | `#050607` |
| `slate` | secondary | `#5B5E62` | `slateLift` | secondary | `#BABEC2` |
| `slateContainer` | secondaryContainer | `#E5E6E8` | `onSlateLift` | onSecondary | `#202225` |
| `inverseSurface` | inverseSurface | `#292A2D` | `smoke` | 玻璃 chrome | `#2D2E31` |
| `onInverseSurface` | onInverseSurface | `#EDEEF0` | `sheetDark` | 弹层底 | `#27282A` |
| `scrim` | 遮罩基色 | `#101215` | `codeWellDark` | 代码井底 | `#161719` |
| `codeWell` | 代码井底 | `#EFF0F1` | `codeWellHeaderDark` | 代码井标题条 | `#1D1E20` |
| `codeWellHeader` | 代码井标题条 | `#EAEBED` | `codeWellBorderDark` | 代码井描边 | `#323335` |
| `codeWellBorder` | 代码井描边 | `#DDDEE0` | `lineNumberDark` | 行号 | `#737476` |
| `lineNumber` | 行号 | `#7F8082` | `commentDark` | 代码注释 | `#8A8C8E` |
| `comment` | 代码注释 | `#67696C` | `terminal` | 终端卡 | `#141517` |
|  |  |  | `terminalKey` | 终端按键 | `#292A2C` |

## 5. 其余四套：强调色字段 + 代表性 8 个中性色

### 5.1 daiqing（tintHue 238 / tintChroma 0.9）

| 字段 | hex | 字段 | hex |
|---|---|---|---|
| seed | `#236185` | pressed | `#145071` |
| container | `#DBEAF5` | onContainer | `#123950` |
| bubble | `#D6E7F3` | glow | `#A2CAE5` |
| onSeed | `#FFFFFF` | seedDark | `#8CB9D7` |
| pressedDark | `#79A6C4` | onSeedDark | `#0D1F2B` |
| containerDark | `#274152` | onContainerDark | `#D5E3ED` |
| bubbleDark | `#26333C` | glowDark | `#466E88` |
| haze | `#C7D0EC` | hazeDark | `#444C66` |

| 中性色 token | 角色 | hex |
|---|---|---|
| mist | 浅·页面底 | `#EDF5FB` |
| mistLowest | 浅·面色最低 | `#FAFCFE` |
| mistContainer | 浅·面色容器 | `#ECF2F7` |
| ink | 浅·主文字 | `#1A252C` |
| inkMuted | 浅·次级文字 | `#4B575F` |
| night | 深·页面底 | `#192026` |
| nightLowest | 深·面色最低 | `#12181D` |
| paper | 深·主文字 | `#E4EAEF` |

### 5.2 dusk（tintHue 295 / tintChroma 0.85）

| 字段 | hex | 字段 | hex |
|---|---|---|---|
| seed | `#726291` | pressed | `#61517D` |
| container | `#EAE5F4` | onContainer | `#392F4C` |
| bubble | `#E6E1F1` | glow | `#C8BDE1` |
| onSeed | `#FFFFFF` | seedDark | `#B8ABD2` |
| pressedDark | `#A598BF` | onSeedDark | `#1F1A29` |
| containerDark | `#40394F` | onContainerDark | `#E2DEEC` |
| bubbleDark | `#332F3B` | glowDark | `#6D6284` |
| haze | `#E6C7D7` | hazeDark | `#5F4353` |

| 中性色 token | 角色 | hex |
|---|---|---|
| mist | 浅·页面底 | `#F4F3FB` |
| mistLowest | 浅·面色最低 | `#FCFCFE` |
| mistContainer | 浅·面色容器 | `#F2F0F7` |
| ink | 浅·主文字 | `#24212B` |
| inkMuted | 浅·次级文字 | `#55535F` |
| night | 深·页面底 | `#201E26` |
| nightLowest | 深·面色最低 | `#17161C` |
| paper | 深·主文字 | `#E9E8EE` |

### 5.3 turquoise（tintHue 190 / tintChroma 0.7）

| 字段 | hex | 字段 | hex |
|---|---|---|---|
| seed | `#34766F` | pressed | `#296760` |
| container | `#DBECE9` | onContainer | `#123D39` |
| bubble | `#D6E8E6` | glow | `#A3CEC8` |
| onSeed | `#FFFFFF` | seedDark | `#8DBEB7` |
| pressedDark | `#7BABA4` | onSeedDark | `#0D211F` |
| containerDark | `#274340` | onContainerDark | `#D6E5E2` |
| bubbleDark | `#263533` | glowDark | `#47726D` |
| haze | `#B9D7E3` | hazeDark | `#34525E` |

| 中性色 token | 角色 | hex |
|---|---|---|
| mist | 浅·页面底 | `#EEF6F5` |
| mistLowest | 浅·面色最低 | `#FAFDFD` |
| mistContainer | 浅·面色容器 | `#ECF3F3` |
| ink | 浅·主文字 | `#1B2625` |
| inkMuted | 浅·次级文字 | `#4B5857` |
| night | 深·页面底 | `#192121` |
| nightLowest | 深·面色最低 | `#121918` |
| paper | 深·主文字 | `#E4EBEA` |

### 5.4 amber（tintHue 75 / tintChroma 0.75）

| 字段 | hex | 字段 | hex |
|---|---|---|---|
| seed | `#8D6636` | pressed | `#7A5528` |
| container | `#F2E6D9` | onContainer | `#483011` |
| bubble | `#EEE2D3` | glow | `#DCBE9D` |
| onSeed | `#FFFFFF` | seedDark | `#CCAC87` |
| pressedDark | `#B99975` | onSeedDark | `#271A0C` |
| containerDark | `#4C3A25` | onContainerDark | `#EADFD3` |
| bubbleDark | `#392F24` | glowDark | `#7F6343` |
| haze | `#EAC8C1` | hazeDark | `#64443D` |

| 中性色 token | 角色 | hex |
|---|---|---|
| mist | 浅·页面底 | `#F8F3ED` |
| mistLowest | 浅·面色最低 | `#FDFCFA` |
| mistContainer | 浅·面色容器 | `#F4F1EB` |
| ink | 浅·主文字 | `#28221A` |
| inkMuted | 浅·次级文字 | `#5B544B` |
| night | 深·页面底 | `#231F18` |
| nightLowest | 深·面色最低 | `#1A1612` |
| paper | 深·主文字 | `#ECE8E4` |

## 6. 对比度自检

### 6.1 源码注释门槛（palette_contrast_test.dart 在参考源码中缺失）

> 下载的参考源码只有 `app/lib/` 与 `docs/`，**没有 `test/` 目录**，`accent.dart` 里提到的 `test/theme/palette_contrast_test.dart` 并不在包内，其断言无法逐条读取。下表改为核对 `palette.dart` / `accent.dart` 注释里写明的数值门槛，同样六套逐条跑。

先按断言类型聚合（六套取最小）：

| 断言 | 门槛 | 六套最小 | 出现在 | 通过 |
|---|---|---|---|---|
| palette.dart: ink 对所有浅色面 >= 13 | >= 13.0 | 12.23 | turquoise（ink / 最差浅色面 mistHighest） | 0/6 **FAIL** |
| palette.dart: 次级文字 >= 6.2 | >= 6.2 | 6.74 | daiqing（inkMuted / mist） | 6/6 OK |
| palette.dart: 三级文字 >= 4.6 | >= 4.6 | 4.94 | daiqing（inkFaint / mist） | 6/6 OK |
| palette.dart: 交互边界非文字 >= 3 | >= 3.0 | 3.45 | turquoise（outlineLight / mist） | 6/6 OK |
| palette.dart: paper 对深色面 >= 10.5 | >= 10.5 | 9.44 | turquoise（paper / 最差深色面 nightHighest） | 0/6 **FAIL** |
| accent.dart: 容器对 >= 7 | >= 7.0 | 8.17 | daiqing（onContainerDark / containerDark） | 12/12 OK |
| accent.dart: seed 上白字 >= 4.5 | >= 4.5 | 5.14 | amber（白字 / seed） | 6/6 OK |
| accent.dart: seedDark 上深墨字 >= 7 | >= 7.0 | 7.91 | dusk（onSeedDark / seedDark） | 6/6 OK |
| accent.dart: 气泡内主文字 >= 5.8 | >= 5.8 | 12.21 | graphite（ink / bubble） | 6/6 OK |
| accent.dart: 气泡内次级文字 >= 5.8 | >= 5.8 | 5.81 | graphite（inkMuted / bubble） | 6/6 OK |

ink 与 paper 对**整条面色阶梯**的逐面实测（带星号者为低于注释门槛）：

| 配色 | ink / mistTop | / mistBottom | / mist | / mistLowest | / mistLow | / mistContainer | / mistHigh | / mistHighest |
|---|---|---|---|---|---|---|---|---|
| mist | 13.89 | 14.70 | 14.28 | 15.33 | 14.91 | 13.92 | 13.17 | 12.34* |
| daiqing | 13.84 | 14.62 | 14.17 | 15.18 | 14.85 | 13.84 | 13.07 | 12.24* |
| dusk | 13.92 | 14.73 | 14.36 | 15.44 | 14.97 | 14.00 | 13.25 | 12.35* |
| turquoise | 13.82 | 14.54 | 14.17 | 15.20 | 14.75 | 13.83 | 13.07 | 12.23* |
| amber | 13.92 | 14.72 | 14.27 | 15.35 | 14.88 | 13.96 | 13.16 | 12.33* |
| graphite | 13.89 | 14.68 | 14.28 | 15.33 | 14.91 | 13.90 | 13.17 | 12.33* |

| 配色 | paper / nightTop | / nightBottom | / night | / nightLowest | / nightLow | / nightContainer | / nightHigh | / nightHighest |
|---|---|---|---|---|---|---|---|---|
| mist | 13.12 | 13.97 | 13.54 | 14.76 | 12.30 | 11.52 | 10.58 | 9.52* |
| daiqing | 13.14 | 13.99 | 13.57 | 14.75 | 12.33 | 11.54 | 10.60 | 9.46* |
| dusk | 13.07 | 13.97 | 13.52 | 14.76 | 12.29 | 11.48 | 10.65 | 9.60* |
| turquoise | 13.15 | 13.97 | 13.56 | 14.75 | 12.33 | 11.55 | 10.61 | 9.44* |
| amber | 13.06 | 13.93 | 13.45 | 14.76 | 12.30 | 11.47 | 10.54 | 9.50* |
| graphite | 13.11 | 14.01 | 13.58 | 14.77 | 12.31 | 11.54 | 10.60 | 9.51* |

逐条明细：

| 配色 | 方案 | 组合 | 前景 | 背景 | 实测 | 门槛 | 结论 |
|---|---|---|---|---|---|---|---|
| mist | light | ink / 最差浅色面 mistHighest | `#1E232E` | `#DFE4EE` | 12.34 | >= 13.0 | **FAIL** |
| mist | light | inkMuted / mist | `#4F5562` | `#F0F4FD` | 6.79 | >= 6.2 | OK |
| mist | light | inkFaint / mist | `#646974` | `#F0F4FD` | 5.00 | >= 4.6 | OK |
| mist | light | outlineLight / mist | `#7E838D` | `#F0F4FD` | 3.46 | >= 3.0 | OK |
| mist | dark | paper / 最差深色面 nightHighest | `#E6E9F0` | `#343944` | 9.52 | >= 10.5 | **FAIL** |
| mist | light | onContainer / container | `#213262` | `#DEE8FF` | 10.07 | >= 7.0 | OK |
| mist | dark | onContainerDark / containerDark | `#D8E1F6` | `#2E3C5F` | 8.31 | >= 7.0 | OK |
| mist | light | 白字 / seed | `#FFFFFF` | `#4B67B4` | 5.39 | >= 4.5 | OK |
| mist | dark | onSeedDark / seedDark | `#121C34` | `#97B1F0` | 7.95 | >= 7.0 | OK |
| mist | light | ink / bubble | `#1E232E` | `#D9E4FD` | 12.33 | >= 5.8 | OK |
| mist | light | inkMuted / bubble | `#4F5562` | `#D9E4FD` | 5.86 | >= 5.8 | OK |
| daiqing | light | ink / 最差浅色面 mistHighest | `#1A252C` | `#DCE5EC` | 12.24 | >= 13.0 | **FAIL** |
| daiqing | light | inkMuted / mist | `#4B575F` | `#EDF5FB` | 6.74 | >= 6.2 | OK |
| daiqing | light | inkFaint / mist | `#616B72` | `#EDF5FB` | 4.94 | >= 4.6 | OK |
| daiqing | light | outlineLight / mist | `#7B848B` | `#EDF5FB` | 3.46 | >= 3.0 | OK |
| daiqing | dark | paper / 最差深色面 nightHighest | `#E4EAEF` | `#303B42` | 9.46 | >= 10.5 | **FAIL** |
| daiqing | light | onContainer / container | `#123950` | `#DBEAF5` | 9.90 | >= 7.0 | OK |
| daiqing | dark | onContainerDark / containerDark | `#D5E3ED` | `#274152` | 8.17 | >= 7.0 | OK |
| daiqing | light | 白字 / seed | `#FFFFFF` | `#236185` | 6.73 | >= 4.5 | OK |
| daiqing | dark | onSeedDark / seedDark | `#0D1F2B` | `#8CB9D7` | 8.04 | >= 7.0 | OK |
| daiqing | light | ink / bubble | `#1A252C` | `#D6E7F3` | 12.33 | >= 5.8 | OK |
| daiqing | light | inkMuted / bubble | `#4B575F` | `#D6E7F3` | 5.87 | >= 5.8 | OK |
| dusk | light | ink / 最差浅色面 mistHighest | `#24212B` | `#E4E2EC` | 12.35 | >= 13.0 | **FAIL** |
| dusk | light | inkMuted / mist | `#55535F` | `#F4F3FB` | 6.83 | >= 6.2 | OK |
| dusk | light | inkFaint / mist | `#696771` | `#F4F3FB` | 5.04 | >= 4.6 | OK |
| dusk | light | outlineLight / mist | `#83818B` | `#F4F3FB` | 3.48 | >= 3.0 | OK |
| dusk | dark | paper / 最差深色面 nightHighest | `#E9E8EE` | `#393741` | 9.60 | >= 10.5 | **FAIL** |
| dusk | light | onContainer / container | `#392F4C` | `#EAE5F4` | 10.10 | >= 7.0 | OK |
| dusk | dark | onContainerDark / containerDark | `#E2DEEC` | `#40394F` | 8.29 | >= 7.0 | OK |
| dusk | light | 白字 / seed | `#FFFFFF` | `#726291` | 5.42 | >= 4.5 | OK |
| dusk | dark | onSeedDark / seedDark | `#1F1A29` | `#B8ABD2` | 7.91 | >= 7.0 | OK |
| dusk | light | ink / bubble | `#24212B` | `#E6E1F1` | 12.36 | >= 5.8 | OK |
| dusk | light | inkMuted / bubble | `#55535F` | `#E6E1F1` | 5.88 | >= 5.8 | OK |
| turquoise | light | ink / 最差浅色面 mistHighest | `#1B2625` | `#DDE6E5` | 12.23 | >= 13.0 | **FAIL** |
| turquoise | light | inkMuted / mist | `#4B5857` | `#EEF6F5` | 6.76 | >= 6.2 | OK |
| turquoise | light | inkFaint / mist | `#616B6B` | `#EEF6F5` | 5.00 | >= 4.6 | OK |
| turquoise | light | outlineLight / mist | `#7C8584` | `#EEF6F5` | 3.45 | >= 3.0 | OK |
| turquoise | dark | paper / 最差深色面 nightHighest | `#E4EBEA` | `#313C3B` | 9.44 | >= 10.5 | **FAIL** |
| turquoise | light | onContainer / container | `#123D39` | `#DBECE9` | 9.81 | >= 7.0 | OK |
| turquoise | dark | onContainerDark / containerDark | `#D6E5E2` | `#274340` | 8.23 | >= 7.0 | OK |
| turquoise | light | 白字 / seed | `#FFFFFF` | `#34766F` | 5.29 | >= 4.5 | OK |
| turquoise | dark | onSeedDark / seedDark | `#0D211F` | `#8DBEB7` | 8.12 | >= 7.0 | OK |
| turquoise | light | ink / bubble | `#1B2625` | `#D6E8E6` | 12.25 | >= 5.8 | OK |
| turquoise | light | inkMuted / bubble | `#4B5857` | `#D6E8E6` | 5.84 | >= 5.8 | OK |
| amber | light | ink / 最差浅色面 mistHighest | `#28221A` | `#E8E3DC` | 12.33 | >= 13.0 | **FAIL** |
| amber | light | inkMuted / mist | `#5B544B` | `#F8F3ED` | 6.76 | >= 6.2 | OK |
| amber | light | inkFaint / mist | `#6E6860` | `#F8F3ED` | 4.99 | >= 4.6 | OK |
| amber | light | outlineLight / mist | `#87827B` | `#F8F3ED` | 3.46 | >= 3.0 | OK |
| amber | dark | paper / 最差深色面 nightHighest | `#ECE8E4` | `#3E3830` | 9.50 | >= 10.5 | **FAIL** |
| amber | light | onContainer / container | `#483011` | `#F2E6D9` | 10.02 | >= 7.0 | OK |
| amber | dark | onContainerDark / containerDark | `#EADFD3` | `#4C3A25` | 8.25 | >= 7.0 | OK |
| amber | light | 白字 / seed | `#FFFFFF` | `#8D6636` | 5.14 | >= 4.5 | OK |
| amber | dark | onSeedDark / seedDark | `#271A0C` | `#CCAC87` | 7.92 | >= 7.0 | OK |
| amber | light | ink / bubble | `#28221A` | `#EEE2D3` | 12.34 | >= 5.8 | OK |
| amber | light | inkMuted / bubble | `#5B544B` | `#EEE2D3` | 5.85 | >= 5.8 | OK |
| graphite | light | ink / 最差浅色面 mistHighest | `#222326` | `#E2E4E6` | 12.33 | >= 13.0 | **FAIL** |
| graphite | light | inkMuted / mist | `#535558` | `#F3F4F6` | 6.79 | >= 6.2 | OK |
| graphite | light | inkFaint / mist | `#67696C` | `#F3F4F6` | 5.00 | >= 4.6 | OK |
| graphite | light | outlineLight / mist | `#818385` | `#F3F4F6` | 3.46 | >= 3.0 | OK |
| graphite | dark | paper / 最差深色面 nightHighest | `#E8E9EB` | `#38393C` | 9.51 | >= 10.5 | **FAIL** |
| graphite | light | onContainer / container | `#2C2E32` | `#E3E6EC` | 10.88 | >= 7.0 | OK |
| graphite | dark | onContainerDark / containerDark | `#DEE1E7` | `#3B3D41` | 8.31 | >= 7.0 | OK |
| graphite | light | 白字 / seed | `#FFFFFF` | `#2C2E32` | 13.60 | >= 4.5 | OK |
| graphite | dark | onSeedDark / seedDark | `#191B1E` | `#E5E8ED` | 14.05 | >= 7.0 | OK |
| graphite | light | ink / bubble | `#222326` | `#E0E3E8` | 12.21 | >= 5.8 | OK |
| graphite | light | inkMuted / bubble | `#535558` | `#E0E3E8` | 5.81 | >= 5.8 | OK |

### 6.2 关键对比度（任务指定）

| 配色 | 方案 | 组合 | 前景 | 背景 | 比值 | >=4.5 | >=7 |
|---|---|---|---|---|---|---|---|
| mist | light | ink 对 mistLowest | `#1E232E` | `#FBFCFF` | 15.33 | Y | Y |
| mist | light | ink 对 mist | `#1E232E` | `#F0F4FD` | 14.28 | Y | Y |
| mist | light | ink 对 mistContainer | `#1E232E` | `#EEF1F9` | 13.92 | Y | Y |
| mist | dark | paper 对 nightLowest | `#E6E9F0` | `#14171E` | 14.76 | Y | Y |
| mist | dark | paper 对 night | `#E6E9F0` | `#1C1F28` | 13.54 | Y | Y |
| mist | dark | paper 对 nightContainer | `#E6E9F0` | `#272C36` | 11.52 | Y | Y |
| mist | light | 白字 对 seed | `#FFFFFF` | `#4B67B4` | 5.39 | Y | - |
| mist | dark | onSeedDark 对 seedDark | `#121C34` | `#97B1F0` | 7.95 | Y | Y |
| daiqing | light | ink 对 mistLowest | `#1A252C` | `#FAFCFE` | 15.18 | Y | Y |
| daiqing | light | ink 对 mist | `#1A252C` | `#EDF5FB` | 14.17 | Y | Y |
| daiqing | light | ink 对 mistContainer | `#1A252C` | `#ECF2F7` | 13.84 | Y | Y |
| daiqing | dark | paper 对 nightLowest | `#E4EAEF` | `#12181D` | 14.75 | Y | Y |
| daiqing | dark | paper 对 night | `#E4EAEF` | `#192026` | 13.57 | Y | Y |
| daiqing | dark | paper 对 nightContainer | `#E4EAEF` | `#242D34` | 11.54 | Y | Y |
| daiqing | light | 白字 对 seed | `#FFFFFF` | `#236185` | 6.73 | Y | - |
| daiqing | dark | onSeedDark 对 seedDark | `#0D1F2B` | `#8CB9D7` | 8.04 | Y | Y |
| dusk | light | ink 对 mistLowest | `#24212B` | `#FCFCFE` | 15.44 | Y | Y |
| dusk | light | ink 对 mist | `#24212B` | `#F4F3FB` | 14.36 | Y | Y |
| dusk | light | ink 对 mistContainer | `#24212B` | `#F2F0F7` | 14.00 | Y | Y |
| dusk | dark | paper 对 nightLowest | `#E9E8EE` | `#17161C` | 14.76 | Y | Y |
| dusk | dark | paper 对 night | `#E9E8EE` | `#201E26` | 13.52 | Y | Y |
| dusk | dark | paper 对 nightContainer | `#E9E8EE` | `#2C2B34` | 11.48 | Y | Y |
| dusk | light | 白字 对 seed | `#FFFFFF` | `#726291` | 5.42 | Y | - |
| dusk | dark | onSeedDark 对 seedDark | `#1F1A29` | `#B8ABD2` | 7.91 | Y | Y |
| turquoise | light | ink 对 mistLowest | `#1B2625` | `#FAFDFD` | 15.20 | Y | Y |
| turquoise | light | ink 对 mist | `#1B2625` | `#EEF6F5` | 14.17 | Y | Y |
| turquoise | light | ink 对 mistContainer | `#1B2625` | `#ECF3F3` | 13.83 | Y | Y |
| turquoise | dark | paper 对 nightLowest | `#E4EBEA` | `#121918` | 14.75 | Y | Y |
| turquoise | dark | paper 对 night | `#E4EBEA` | `#192121` | 13.56 | Y | Y |
| turquoise | dark | paper 对 nightContainer | `#E4EBEA` | `#242E2D` | 11.55 | Y | Y |
| turquoise | light | 白字 对 seed | `#FFFFFF` | `#34766F` | 5.29 | Y | - |
| turquoise | dark | onSeedDark 对 seedDark | `#0D211F` | `#8DBEB7` | 8.12 | Y | Y |
| amber | light | ink 对 mistLowest | `#28221A` | `#FDFCFA` | 15.35 | Y | Y |
| amber | light | ink 对 mist | `#28221A` | `#F8F3ED` | 14.27 | Y | Y |
| amber | light | ink 对 mistContainer | `#28221A` | `#F4F1EB` | 13.96 | Y | Y |
| amber | dark | paper 对 nightLowest | `#ECE8E4` | `#1A1612` | 14.76 | Y | Y |
| amber | dark | paper 对 night | `#ECE8E4` | `#231F18` | 13.45 | Y | Y |
| amber | dark | paper 对 nightContainer | `#ECE8E4` | `#312B24` | 11.47 | Y | Y |
| amber | light | 白字 对 seed | `#FFFFFF` | `#8D6636` | 5.14 | Y | - |
| amber | dark | onSeedDark 对 seedDark | `#271A0C` | `#CCAC87` | 7.92 | Y | Y |
| graphite | light | ink 对 mistLowest | `#222326` | `#FCFCFD` | 15.33 | Y | Y |
| graphite | light | ink 对 mist | `#222326` | `#F3F4F6` | 14.28 | Y | Y |
| graphite | light | ink 对 mistContainer | `#222326` | `#F0F1F3` | 13.90 | Y | Y |
| graphite | dark | paper 对 nightLowest | `#E8E9EB` | `#161719` | 14.77 | Y | Y |
| graphite | dark | paper 对 night | `#E8E9EB` | `#1E1F21` | 13.58 | Y | Y |
| graphite | dark | paper 对 nightContainer | `#E8E9EB` | `#2A2C2E` | 11.54 | Y | Y |
| graphite | light | 白字 对 seed | `#FFFFFF` | `#2C2E32` | 13.60 | Y | Y |
| graphite | dark | onSeedDark 对 seedDark | `#191B1E` | `#E5E8ED` | 14.05 | Y | Y |

### 6.3 最差 5 组

| 配色 | 组合 | 比值 | 前景 | 背景 |
|---|---|---|---|---|
| amber | 白字 对 seed | 5.14 | `#FFFFFF` | `#8D6636` |
| turquoise | 白字 对 seed | 5.29 | `#FFFFFF` | `#34766F` |
| mist | 白字 对 seed | 5.39 | `#FFFFFF` | `#4B67B4` |
| dusk | 白字 对 seed | 5.42 | `#FFFFFF` | `#726291` |
| daiqing | 白字 对 seed | 6.73 | `#FFFFFF` | `#236185` |

### 6.4 对比度保护层探测（3:1 非文字）

| 配色 | 检查 | 前景 | 背景 | 比值 |
|---|---|---|---|---|
| mist | seed 对 mistLowest (强调色 3:1) | `#4B67B4` | `#FBFCFF` | 5.25 |
| mist | seedDark 对 nightLowest (强调色 3:1) | `#97B1F0` | `#14171E` | 8.42 |
| mist | inkGhost 对 mist (纯装饰 ~2.5) | `#A1A5AC` | `#F0F4FD` | 2.25 |
| mist | paperGhost 对 night (纯装饰 ~2.5) | `#656971` | `#1C1F28` | 2.99 |
| daiqing | seed 对 mistLowest (强调色 3:1) | `#236185` | `#FAFCFE` | 6.54 |
| daiqing | seedDark 对 nightLowest (强调色 3:1) | `#8CB9D7` | `#12181D` | 8.55 |
| daiqing | inkGhost 对 mist (纯装饰 ~2.5) | `#9FA6AA` | `#EDF5FB` | 2.24 |
| daiqing | paperGhost 对 night (纯装饰 ~2.5) | `#636A6F` | `#192026` | 3.00 |
| dusk | seed 对 mistLowest (强调色 3:1) | `#726291` | `#FCFCFE` | 5.29 |
| dusk | seedDark 对 nightLowest (强调色 3:1) | `#B8ABD2` | `#17161C` | 8.38 |
| dusk | inkGhost 对 mist (纯装饰 ~2.5) | `#A5A4AA` | `#F4F3FB` | 2.25 |
| dusk | paperGhost 对 night (纯装饰 ~2.5) | `#69686F` | `#201E26` | 2.99 |
| turquoise | seed 对 mistLowest (强调色 3:1) | `#34766F` | `#FAFDFD` | 5.18 |
| turquoise | seedDark 对 nightLowest (强调色 3:1) | `#8DBEB7` | `#121918` | 8.64 |
| turquoise | inkGhost 对 mist (纯装饰 ~2.5) | `#A0A6A5` | `#EEF6F5` | 2.25 |
| turquoise | paperGhost 对 night (纯装饰 ~2.5) | `#636B6A` | `#192121` | 3.00 |
| amber | seed 对 mistLowest (强调色 3:1) | `#8D6636` | `#FDFCFA` | 5.01 |
| amber | seedDark 对 nightLowest (强调色 3:1) | `#CCAC87` | `#1A1612` | 8.41 |
| amber | inkGhost 对 mist (纯装饰 ~2.5) | `#A8A49F` | `#F8F3ED` | 2.25 |
| amber | paperGhost 对 night (纯装饰 ~2.5) | `#6D6863` | `#231F18` | 2.98 |
| graphite | seed 对 mistLowest (强调色 3:1) | `#2C2E32` | `#FCFCFD` | 13.27 |
| graphite | seedDark 对 nightLowest (强调色 3:1) | `#E5E8ED` | `#161719` | 14.60 |
| graphite | inkGhost 对 mist (纯装饰 ~2.5) | `#A4A5A6` | `#F3F4F6` | 2.24 |
| graphite | paperGhost 对 night (纯装饰 ~2.5) | `#68696B` | `#1E1F21` | 3.00 |

### 6.5 色域裁剪

| 位置 | L | 请求彩度 | 落地彩度 | 色相 | 输出 |
|---|---|---|---|---|---|
| `daiqing/light/shadowInk` | 0.201 | 0.0452 | 0.0447 | 237.2 | `#001928` |

