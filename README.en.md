# Mist Theme (`dsh-theme-mist`)

[简体中文](README.md) | **English**

A hot-pluggable client theme plugin for **DeepSeek Harness** (Desktop & Web).

Inspired by the visual language of [DSH Go](https://github.com/ccch1mneyyy/dsh-Go), Mist brings **low-saturation Eastern palettes, depth-layered paper & ink surfaces, 0.5px hairline borders, frosted glass chrome, and a single corner accent glow** to the official three-column interface — **without altering the host layout or interaction model**.

<table>
  <tr>
    <td width="50%"><img src="docs/images/hero-light.webp" width="100%" alt="Light appearance"><br><sub><b>Light</b> · Mist · glass sidebar</sub></td>
    <td width="50%"><img src="docs/images/hero-dark.webp" width="100%" alt="Dark appearance"><br><sub><b>Dark</b> · Mist · glass sidebar</sub></td>
  </tr>
</table>

Same conversation, same layout, only the appearance changes: user bubble, code well, table hairlines, and the message scrolling out from behind the composer card.

---

## Preview · Six Accent Palettes

Mist includes six curated accent palettes. The top-right ambient glow, primary action buttons, active indicators, and hue-tinted paper/night surfaces adapt automatically to the selected accent (click any image to enlarge). Each image is cut along one diagonal: **light at the top left, dark at the bottom right**, so a single frame shows both appearances.

<table>
  <tr>
    <td align="center"><img src="docs/images/accents/mist.webp" width="31%" alt="Mist"><br><sub><b>Mist 雾蓝</b> (Default · Cool Mist Paper)</sub></td>
    <td align="center"><img src="docs/images/accents/daiqing.webp" width="31%" alt="Daiqing"><br><sub><b>Daiqing 黛青</b> (Deep Celadon Glaze)</sub></td>
    <td align="center"><img src="docs/images/accents/dusk.webp" width="31%" alt="Dusk"><br><sub><b>Dusk 暮紫</b> (Twilight Haze)</sub></td>
  </tr>
  <tr>
    <td align="center"><img src="docs/images/accents/turquoise.webp" width="31%" alt="Turquoise"><br><sub><b>Turquoise 松石</b> (Warm Pine Teal)</sub></td>
    <td align="center"><img src="docs/images/accents/amber.webp" width="31%" alt="Amber"><br><sub><b>Amber 琥珀</b> (Warm Rosin Gold)</sub></td>
    <td align="center"><img src="docs/images/accents/graphite.webp" width="31%" alt="Graphite"><br><sub><b>Graphite 石墨</b> (Monochrome Ink)</sub></td>
  </tr>
</table>

---

## Highlights

- **Six Accents × Light / Dark / System**: Seamlessly layers Mist, Daiqing, Dusk, Turquoise, Amber, and Graphite over the host's Light, Dark, and System appearance modes. Cool-white paper surfaces in light mode and warm-ink night surfaces in dark mode pass WCAG AA contrast checks across all 12 combinations.
- **Restrained Accent Budget (≤ 5%)**: Saturated color is reserved strictly for primary actions, active selections, and the subtle top-right glow. Depth is defined through luminance steps and 0.5px hairlines for fatigue-free long sessions.
- **Frosted Glass & Dual Sidebar Materials**: The floating composer bar blurs scrolling messages underneath in real time, while the left sidebar offers a one-click choice between **Glass** (translucent drawer with 28px outer corners) and **Flat** (borderless canvas sharing the page gradient).
- **Native Settings Integration & Clean Teardown**: Integrates directly into **Settings → General**. Disabling or uninstalling the plugin restores every host token and stylesheet with zero DOM residue.

---

## Quick Start

**Requirements**: DeepSeek Harness `>= 0.2.1-alpha.1 < 0.3.0` (Desktop & Web).

### Option 1: Desktop App

1. Clone and build the plugin locally (skip `pnpm build` if `lib/` is already present):
    ```bash
   git clone <repo-url> dsh-theme-mist
   cd dsh-theme-mist
   pnpm install && pnpm build
    ```
2. In the Desktop app, open **Plugins → Add plugin → Local directory** and select the `dsh-theme-mist` folder.

> **Note**: The `desktop` profile is managed exclusively by the Electron app and cannot be modified via CLI (`dsh plugin`). Always use the in-app plugin manager on Desktop.

### Option 2: Web (CLI)

```bash
pnpm install && pnpm build
dsh plugin --profile web add "$(pwd)"
```

> **Tip**: To test in an isolated profile, initialize it from the `web` template first:
> ```bash
> dsh my-web --from-default-profile web   # Press Ctrl-C after initial bootstrap
> dsh plugin --profile my-web add "$(pwd)"
> ```

---

## Customization

Once installed, open **Settings → General** to find two new rows right below the official **Appearance** and **Font size** controls:

| Setting | Options | Description |
|---|---|---|
| **Accent** | `Mist` · `Daiqing` · `Dusk` · `Turquoise` · `Amber` · `Graphite` | Applies immediately without reloading and persists across sessions. |
| **Sidebar material** | `Glass` (Default) · `Flat` | **Glass**: Translucent sheet with a 0.5px hairline border and 28px right corners. **Flat**: Removes the sidebar backing so the page gradient flows seamlessly across all columns. |

<img src="docs/images/settings.webp" width="800" alt="Settings → General: appearance, font size, accent and sidebar material in one panel">

The two sidebar materials side by side (same accent, same light appearance):

<table>
  <tr>
    <td align="center"><img src="docs/images/sidebar-sheet.webp" width="300" alt="Glass sidebar"><br><sub><b>Glass</b> (default)</sub></td>
    <td align="center"><img src="docs/images/sidebar-flat.webp" width="300" alt="Flat sidebar"><br><sub><b>Flat</b></sub></td>
  </tr>
</table>

<details>
<summary><b>Advanced: Switch via CustomEvent (Console / Scripts)</b></summary>

You can also drive the theme programmatically from the browser console or companion scripts; changes share the same state store and persist to `localStorage`:

```js
// Switch accent: 'mist' | 'daiqing' | 'dusk' | 'turquoise' | 'amber' | 'graphite'
window.dispatchEvent(new CustomEvent('dsh-theme-mist:accent', { detail: 'daiqing' }))

// Switch sidebar material: 'sheet' (Glass) | 'flat' (Flat)
window.dispatchEvent(new CustomEvent('dsh-theme-mist:sidebar-material', { detail: 'flat' }))
```

</details>

---

## Uninstallation

- **Desktop App**: Open **Plugins**, locate **Mist theme (`dsh-theme-mist`)**, and click Remove.
- **Web (CLI)**:
  ```bash
  dsh plugin --profile web remove dsh-theme-mist
  ```

Uninstalling immediately restores the official theme. Your saved accent preference remains in `localStorage` so reinstalling remembers your choice; to clear it as well, run in the browser console:

```js
localStorage.removeItem('dsh.theme-mist.preferences.v1')
```

---

## Design Boundaries & Notes

1. **Visual Theme Only, Zero Layout Rewrite**: This plugin ports color palettes, surface materials, and corner radii to Desktop/Web while preserving the host's three-column layout, navigation flow, and tool-call structure.
2. **Respects System & User Fonts**: Because the host plugin asset router does not serve `.woff2` font files, Mist uses the host font stack and respects your configured font family and size settings.
3. **No Mascots or Third-Party Brand Assets**: Ships strictly color and material styling — no desktop pets, stickers, or third-party logos.
4. **Run One Visual Theme at a Time**: Avoid enabling multiple third-party skin/theme plugins simultaneously, as competing `--dsw-*` token overrides will conflict.

---

## Development & Documentation

```bash
pnpm install          # Install dependencies
pnpm build            # Emit lib/index.js (Node) and lib/client.js (Browser)
pnpm verify           # Build + typecheck + unit tests + palette/token/pack contract checks
```

For architectural details, token derivation math, and end-to-end verification harnesses, see:

- [Architecture (`docs/architecture.md`)](docs/architecture.md) — Loader lifecycle, 3-layer theme model, and cleanup contract
- [Visual Specification (`docs/visual-spec.md`)](docs/visual-spec.md) — OKLCH derivation, contrast matrix, 5-layer background transparency, and glass recipes
- [Palette Tables (`docs/reference/palette-tables.md`)](docs/reference/palette-tables.md) — Complete generated light/dark token values for all six accents
- [Tooling Guide (`tools/README.md`)](tools/README.md) — Token generator, dual-version E2E scripts, and automated preview capture
- [Changelog (`CHANGELOG.md`)](CHANGELOG.md) — Release history

---

## License & Attribution

Released under the **[MIT License](LICENSE)**. Full attribution and clean-room implementation details are recorded in **[NOTICE](NOTICE)**.

- **Clean-Room Implementation**: Visual design inspired by [DSH Go](https://github.com/ccch1mneyyy/dsh-Go) (with portions of the upstream theme vocabulary originating from [PiPilot](https://github.com/CikeSeven/pi_pilot), MIT). All TypeScript/CSS source code, icons, and the OKLCH derivation script (`tools/derive-tokens.py`) in this repository were written independently — **no Dart source code, brand logos, mascots, or artwork from DSH Go are included**.
- **Non-Affiliation**: This is an independent community plugin and is not affiliated with, endorsed by, or published by DSH Go, DSH-TUI, ccch1mneyyy, or DeepSeek.
