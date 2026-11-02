#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
derive_tokens.py - 精确复刻 DSH Go (Flutter) 主题的颜色推导算法。

严格对照 DSH Go 的源码 app/lib/ui/theme/（公开仓库，未随本仓库分发）:
  * oklch.dart    : Oklch.fromColor / toColor (24 步二分降彩度) / retint
  * palette.dart  : DshPalette 常量、NeutralTones.defaults、NeutralTones.of、
                    baseHue = 266、contrastRatio
  * accent.dart   : AppAccent 六套预设的全部字段

只读参考源码，绝不修改；本脚本只写 docs/reference/ 下的产物。
运行: python3 tools/derive-tokens.py
产物: docs/reference/palette.json  docs/reference/palette-tables.md  (stdout 打印自检报告)
自查: DSHGO_OUT_DIR=/tmp/x python3 tools/derive-tokens.py   # 写到别处，不碰仓库
"""

import json
import math
import os
import sys
import time

# 产物默认写到仓库的 docs/reference/；允许 DSHGO_OUT_DIR 覆盖（自检/临时实验用）。
_REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.environ.get("DSHGO_OUT_DIR") or os.path.join(_REPO_ROOT, "docs", "reference")

# TypeScript 产物写到 src/client/。用 DSHGO_OUT_DIR 做自检时默认不写仓库源码，
# 需要时用 DSHGO_TS_DIR 显式指定。
TS_DIR = os.environ.get("DSHGO_TS_DIR") or (
    None if os.environ.get("DSHGO_OUT_DIR") else os.path.join(_REPO_ROOT, "src", "client")
)

# ==========================================================================
# 0. 运行时插桩：记录色域裁剪 / 调用次数
# ==========================================================================

CLIP_LOG = []
CONVERSIONS = [0]
LOG_ENABLED = [True]   # 自检复算时关掉，避免同一裁剪被记两次


def argb(a, r, g, b):
    return (a << 24) | (r << 16) | (g << 8) | b


def hex_of(c):
    a = (c >> 24) & 0xFF
    r = (c >> 16) & 0xFF
    g = (c >> 8) & 0xFF
    b = c & 0xFF
    if a == 255:
        return "#%02X%02X%02X" % (r, g, b)
    return "#%02X%02X%02X%02X" % (a, r, g, b)


# ==========================================================================
# 1. oklch.dart - 逐行复刻
# ==========================================================================

def dart_round(x):
    """Dart double.round(): 四舍五入、.5 远离零。
    Python round() 是银行家舍入，必须自己实现，否则 hex 会差 1。"""
    return int(math.floor(x + 0.5)) if x >= 0 else -int(math.floor(-x + 0.5))


def cbrt(v):
    # Dart: v < 0 ? -pow(-v, 1/3) : pow(v, 1/3)
    return -math.pow(-v, 1.0 / 3.0) if v < 0 else math.pow(v, 1.0 / 3.0)


def to_linear(v):
    # Dart: v <= 0.04045 ? v / 12.92 : pow((v + 0.055) / 1.055, 2.4)
    return v / 12.92 if v <= 0.04045 else math.pow((v + 0.055) / 1.055, 2.4)


def to_gamma(v):
    # Dart: v <= 0.0031308 ? 12.92 * v : 1.055 * pow(v, 1/2.4) - 0.055
    return 12.92 * v if v <= 0.0031308 else 1.055 * math.pow(v, 1.0 / 2.4) - 0.055


def lin_srgb(l, c, h):
    """Oklch._linear - 返回线性 sRGB 三元组。"""
    rad = h * math.pi / 180.0
    a = c * math.cos(rad)
    b = c * math.sin(rad)
    lp = l + 0.3963377774 * a + 0.2158037573 * b
    mp = l - 0.1055613458 * a - 0.0638541728 * b
    sp = l - 0.0894841775 * a - 1.2914855480 * b
    l3 = lp * lp * lp
    m3 = mp * mp * mp
    s3 = sp * sp * sp
    return (
        4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3,
        -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3,
        -0.0041960863 * l3 - 0.7034186147 * m3 + 1.7076147010 * s3,
    )


def in_gamut(rgb):
    eps = 1e-4
    return all(-eps <= v <= 1.0 + eps for v in rgb)


class Oklch:
    __slots__ = ("l", "c", "h")

    def __init__(self, l, c, h):
        self.l = l
        self.c = c
        self.h = h

    @staticmethod
    def from_color(color):
        r = to_linear(((color >> 16) & 0xFF) / 255.0)
        g = to_linear(((color >> 8) & 0xFF) / 255.0)
        b = to_linear((color & 0xFF) / 255.0)
        lp = cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
        mp = cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
        sp = cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
        L = 0.2104542553 * lp + 0.7936177850 * mp - 0.0040720468 * sp
        A = 1.9779984951 * lp - 2.4285922050 * mp + 0.4505937099 * sp
        B = 0.0259040371 * lp + 0.7827717662 * mp - 0.8086757660 * sp
        c = math.sqrt(A * A + B * B)
        h = (math.atan2(B, A) * 180.0 / math.pi) % 360.0
        return Oklch(L, c, h)

    def copy_with(self, l=None, c=None, h=None):
        return Oklch(self.l if l is None else l,
                     self.c if c is None else c,
                     self.h if h is None else h)

    def to_color(self, alpha=1.0, ctx=None):
        """Dart toColor(): 超色域时只降彩度，24 次二分，明度色相不动。"""
        CONVERSIONS[0] += 1
        l = min(max(self.l, 0.0), 1.0)
        c = max(0.0, self.c)
        rgb = lin_srgb(l, c, self.h)
        clipping = False
        c_req = c
        if not in_gamut(rgb):
            clipping = True
            lo, hi = 0.0, c
            for _ in range(24):
                mid = (lo + hi) / 2.0
                if in_gamut(lin_srgb(l, mid, self.h)):
                    lo = mid
                else:
                    hi = mid
            c = lo
            rgb = lin_srgb(l, c, self.h)

        def channel(v):
            g = to_gamma(min(max(v, 0.0), 1.0))
            return min(max(dart_round(g * 255.0), 0), 255)

        out = argb(min(max(dart_round(alpha * 255.0), 0), 255),
                   channel(rgb[0]), channel(rgb[1]), channel(rgb[2]))
        if clipping:
            if not LOG_ENABLED[0]:
                return out
            CLIP_LOG.append({"ctx": ctx or "Oklch.toColor", "l": l,
                             "c_req": c_req, "c_out": c, "h": self.h,
                             "out": hex_of(out)})
        return out


def retint(color, hue_shift, chroma_scale, ctx=None):
    """oklch.dart retint(): 明度不变、色相 +hueShift、彩度 x chromaScale、alpha 保留。"""
    if hue_shift == 0 and chroma_scale == 1:
        return color
    o = Oklch.from_color(color)
    a = ((color >> 24) & 0xFF) / 255.0
    return o.copy_with(c=o.c * chroma_scale,
                       h=(o.h + hue_shift) % 360.0).to_color(alpha=a, ctx=ctx)


# ==========================================================================
# 2. palette.dart - DshPalette 常量 + NeutralTones.defaults
# ==========================================================================

P = {
    "mistTop":       0xFFEBF1FE,
    "mistBottom":    0xFFF6F7FC,
    "mist":          0xFFF0F4FD,
    "mistLowest":    0xFFFBFCFF,
    "mistLow":       0xFFF6F9FE,
    "mistContainer": 0xFFEEF1F9,
    "mistHigh":      0xFFE7EBF4,
    "mistHighest":   0xFFDFE4EE,
    "ink":           0xFF1E232E,
    "inkMuted":      0xFF4F5562,
    "inkFaint":      0xFF646974,
    "inkGhost":      0xFFA1A5AC,
    "outlineLight":  0xFF7E838D,
    "ruleLight":     0xFFDCE0E8,
    "shadowInk":     0xFF0B152D,
    "nightTop":      0xFF1D222C,
    "nightBottom":   0xFF1B1C23,
    "night":         0xFF1C1F28,
    "nightLowest":   0xFF14171E,
    "nightLow":      0xFF232730,
    "nightContainer": 0xFF272C36,
    "nightHigh":     0xFF2D323C,
    "nightHighest":  0xFF343944,
    "paper":         0xFFE6E9F0,
    "paperMuted":    0xFFB6BBC5,
    "paperFaint":    0xFF9A9EA9,
    "paperGhost":    0xFF656971,
    "outlineDark":   0xFF737781,
    "ruleDark":      0xFF343841,
    "shadowNight":   0xFF03060D,
    "slate":         0xFF545E6F,
    "slateContainer": 0xFFE2E6F0,
    "slateLift":     0xFFB3BED2,
    "onSlateLift":   0xFF1A2230,
    "dusk":          0xFF6B578F,
    "duskContainer": 0xFFECE5FB,
    "onDuskContainer": 0xFF3B2C54,
    "duskLift":      0xFFBEAEDE,
    "onDuskLift":    0xFF251C36,
    "duskContainerDark": 0xFF3E3451,
    "onDuskContainerDark": 0xFFE4DDF3,
    "danger":        0xFFA54743,
    "dangerLift":    0xFFE69089,
    "scrim":         0xFF0B111F,
    "inverseSurface": 0xFF252A35,
    "onInverseSurface": 0xFFECEEF4,
    "codeWell":      0xFFEDF0F6,
    "codeWellHeader": 0xFFE7EBF3,
    "codeWellBorder": 0xFFDBDEE5,
    "lineNumber":    0xFF7D8088,
    "comment":       0xFF636975,
    "smoke":         0xFF292E39,
    "sheetDark":     0xFF232832,
    "codeWellDark":  0xFF14171E,
    "codeWellHeaderDark": 0xFF1A1E26,
    "codeWellBorderDark": 0xFF2F333A,
    "lineNumberDark": 0xFF71747D,
    "commentDark":   0xFF868C97,
    "terminal":      0xFF12151C,
    "terminalKey":   0xFF262A33,
}

LIGHT_TOKENS = [
    "mistTop", "mistBottom", "mist", "mistLowest", "mistLow", "mistContainer",
    "mistHigh", "mistHighest",
    "ink", "inkMuted", "inkFaint", "inkGhost", "outlineLight", "ruleLight",
    "shadowInk",
    "slate", "slateContainer", "inverseSurface", "onInverseSurface", "scrim",
    "codeWell", "codeWellHeader", "codeWellBorder", "lineNumber", "comment",
]
DARK_TOKENS = [
    "nightTop", "nightBottom", "night", "nightLowest", "nightLow",
    "nightContainer", "nightHigh", "nightHighest",
    "paper", "paperMuted", "paperFaint", "paperGhost", "outlineDark", "ruleDark",
    "shadowNight",
    "slateLift", "onSlateLift",
    "smoke", "sheetDark",
    "codeWellDark", "codeWellHeaderDark", "codeWellBorderDark", "lineNumberDark",
    "commentDark",
    "terminal", "terminalKey",
]
BASE_HUE = 266.0


def neutral_tones_of(tint_hue, tint_chroma, ctx_prefix=""):
    """palette.dart NeutralTones.of(): 整条色阶 retint，明度一点不动。"""
    if tint_hue == BASE_HUE and tint_chroma == 1:
        return ({k: P[k] for k in LIGHT_TOKENS},
                {k: P[k] for k in DARK_TOKENS})
    shift = tint_hue - BASE_HUE
    light, dark = {}, {}
    for k in LIGHT_TOKENS:
        light[k] = retint(P[k], shift, tint_chroma, ctx=ctx_prefix + "/light/" + k)
    for k in DARK_TOKENS:
        dark[k] = retint(P[k], shift, tint_chroma, ctx=ctx_prefix + "/dark/" + k)
    return light, dark


# ==========================================================================
# 3. accent.dart - 六套 AppAccent 预设（全部字段）
# ==========================================================================

ACCENTS = {
    "mist": dict(
        seed=0xFF4B67B4, pressed=0xFF3D569D, container=0xFFDEE8FF,
        onContainer=0xFF213262, bubble=0xFFD9E4FD, glow=0xFFABC3FC,
        seedDark=0xFF97B1F0, pressedDark=0xFF859EDC, onSeedDark=0xFF121C34,
        containerDark=0xFF2E3C5F, onContainerDark=0xFFD8E1F6,
        bubbleDark=0xFF293144, glowDark=0xFF51679D,
        tintHue=266.0, tintChroma=1.0,
        haze=0xFFD5CBEB, hazeDark=0xFF514765),
    "daiqing": dict(
        seed=0xFF236185, pressed=0xFF145071, container=0xFFDBEAF5,
        onContainer=0xFF123950, bubble=0xFFD6E7F3, glow=0xFFA2CAE5,
        seedDark=0xFF8CB9D7, pressedDark=0xFF79A6C4, onSeedDark=0xFF0D1F2B,
        containerDark=0xFF274152, onContainerDark=0xFFD5E3ED,
        bubbleDark=0xFF26333C, glowDark=0xFF466E88,
        tintHue=238.0, tintChroma=0.9,
        haze=0xFFC7D0EC, hazeDark=0xFF444C66),
    "dusk": dict(
        seed=0xFF726291, pressed=0xFF61517D, container=0xFFEAE5F4,
        onContainer=0xFF392F4C, bubble=0xFFE6E1F1, glow=0xFFC8BDE1,
        seedDark=0xFFB8ABD2, pressedDark=0xFFA598BF, onSeedDark=0xFF1F1A29,
        containerDark=0xFF40394F, onContainerDark=0xFFE2DEEC,
        bubbleDark=0xFF332F3B, glowDark=0xFF6D6284,
        tintHue=295.0, tintChroma=0.85,
        haze=0xFFE6C7D7, hazeDark=0xFF5F4353),
    "turquoise": dict(
        seed=0xFF34766F, pressed=0xFF296760, container=0xFFDBECE9,
        onContainer=0xFF123D39, bubble=0xFFD6E8E6, glow=0xFFA3CEC8,
        seedDark=0xFF8DBEB7, pressedDark=0xFF7BABA4, onSeedDark=0xFF0D211F,
        containerDark=0xFF274340, onContainerDark=0xFFD6E5E2,
        bubbleDark=0xFF263533, glowDark=0xFF47726D,
        tintHue=190.0, tintChroma=0.7,
        haze=0xFFB9D7E3, hazeDark=0xFF34525E),
    "amber": dict(
        seed=0xFF8D6636, pressed=0xFF7A5528, container=0xFFF2E6D9,
        onContainer=0xFF483011, bubble=0xFFEEE2D3, glow=0xFFDCBE9D,
        seedDark=0xFFCCAC87, pressedDark=0xFFB99975, onSeedDark=0xFF271A0C,
        containerDark=0xFF4C3A25, onContainerDark=0xFFEADFD3,
        bubbleDark=0xFF392F24, glowDark=0xFF7F6343,
        tintHue=75.0, tintChroma=0.75,
        haze=0xFFEAC8C1, hazeDark=0xFF64443D),
    "graphite": dict(
        seed=0xFF2C2E32, pressed=0xFF1D1F23, container=0xFFE3E6EC,
        onContainer=0xFF2C2E32, bubble=0xFFE0E3E8, glow=0xFFBBBEC3,
        seedDark=0xFFE5E8ED, pressedDark=0xFFCED1D6, onSeedDark=0xFF191B1E,
        containerDark=0xFF3B3D41, onContainerDark=0xFFDEE1E7,
        bubbleDark=0xFF2E3034, glowDark=0xFF616368,
        tintHue=262.0, tintChroma=0.25,
        haze=0xFFCED1D6, hazeDark=0xFF4A4D52),
}
ACCENT_ORDER = ["mist", "daiqing", "dusk", "turquoise", "amber", "graphite"]
ACCENT_FIELDS = ["seed", "pressed", "container", "onContainer", "bubble", "glow",
                 "seedDark", "pressedDark", "onSeedDark", "containerDark",
                 "onContainerDark", "bubbleDark", "glowDark", "haze", "hazeDark"]
ON_SEED = 0xFFFFFFFF

FIXED = {
    "slateContainerDark": 0x17FFFFFF,
    "dusk": P["dusk"], "duskContainer": P["duskContainer"],
    "onDuskContainer": P["onDuskContainer"],
    "duskLift": P["duskLift"], "onDuskLift": P["onDuskLift"],
    "duskContainerDark": P["duskContainerDark"],
    "onDuskContainerDark": P["onDuskContainerDark"],
    "danger": P["danger"], "dangerLift": P["dangerLift"],
}


# ==========================================================================
# 4. contrastRatio - palette.dart + Flutter computeLuminance()
# ==========================================================================

def lin_component(c):
    return c / 12.92 if c <= 0.03928 else math.pow((c + 0.055) / 1.055, 2.4)


def luminance(color):
    r = lin_component(((color >> 16) & 0xFF) / 255.0)
    g = lin_component(((color >> 8) & 0xFF) / 255.0)
    b = lin_component((color & 0xFF) / 255.0)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast(a, b):
    la, lb = luminance(a), luminance(b)
    hi, lo = (la, lb) if la > lb else (lb, la)
    return (hi + 0.05) / (lo + 0.05)


PASS_AA = 4.5
PASS_AAA = 7.0
PASS_UI = 3.0

LIGHT_SURFACES = ["mistTop", "mistBottom", "mist", "mistLowest", "mistLow",
                  "mistContainer", "mistHigh", "mistHighest"]
DARK_SURFACES = ["nightTop", "nightBottom", "night", "nightLowest", "nightLow",
                 "nightContainer", "nightHigh", "nightHighest"]


# ==========================================================================
# 5. 主流程
# ==========================================================================

# ==========================================================================
# 6. 供 TypeScript 消费的派生量与序列化
# ==========================================================================

# 六套配色的显示名（DSH Go 原文名 + 英文名）
ACCENT_LABELS = {
    "mist": ("雾蓝", "Mist"),
    "daiqing": ("黛青", "Daiqing"),
    "dusk": ("暮紫", "Dusk"),
    "turquoise": ("松石", "Turquoise"),
    "amber": ("琥珀", "Amber"),
    "graphite": ("石墨", "Graphite"),
}

# 描边 alpha 梯度：四档，对应 --dsw-alias-border-l1..l4（visual-spec §6.1.2）
HAIRLINE_LIGHT = (0.08, 0.12, 0.25, 0.30)
HAIRLINE_DARK = (0.09, 0.15, 0.28, 0.34)
# 浅色描边的基色取 shadowInk #0B152D 的 RGB；深色用纯白
HAIRLINE_INK = (11, 21, 45)

# 深色 caption 在 paperFaint -> paperGhost 上的插值位置（visual-spec §6.1）
CAPTION_MIX = 0.30

# 气泡高亮：同色相、明度降 0.0425、彩度 x1.38。
# DSH Go 没有这个字段——它是为了映射官方 --dsw-specific-bubble-highlight 新增的派生，
# 参数由 mist 的 bubble #D9E4FD -> highlight #C7D6F8 校准而来（visual-spec §6.1）。
BUBBLE_HIGHLIGHT_DL = -0.0425
BUBBLE_HIGHLIGHT_CSCALE = 1.38


def css_color(c):
    """argb int -> CSS 颜色串。

    Flutter 的 8 位 hex 是 #AARRGGBB，CSS 是 #RRGGBBAA —— 必须换位，
    否则半透明色会被浏览器当成一种完全不同的颜色（例如淡化的白会被读成
    近乎透明的蓝）。不透明时两套写法一致，直接输出 6 位。
    """
    a = (c >> 24) & 0xFF
    r = (c >> 16) & 0xFF
    g = (c >> 8) & 0xFF
    b = c & 0xFF
    if a == 255:
        return "#%02X%02X%02X" % (r, g, b)
    return "#%02X%02X%02X%02X" % (r, g, b, a)


def mix_argb(c1, c2, t):
    """sRGB 逐通道线性插值（含 alpha），四舍五入用 Dart 语义。"""
    parts = []
    for shift in (24, 16, 8, 0):
        v1 = (c1 >> shift) & 0xFF
        v2 = (c2 >> shift) & 0xFF
        parts.append(dart_round(v1 + (v2 - v1) * t))
    return argb(*parts)


def hairline_rgba(base_rgb, alpha):
    """生成 rgba() 串。描边必须带 alpha，不能用实体灰（visual-spec §6.1.2）。"""
    r, g, b = base_rgb
    return "rgba(%d,%d,%d,%.2f)" % (r, g, b, alpha)


def bubble_highlight(c):
    """气泡高亮色：OKLCH 上压暗并增彩，色相与 alpha 保持。

    官方 --dsw-specific-bubble-highlight 需要一个比 bubble 更实的强调底，
    DSH Go 源码里没有对应字段，所以这里定义一个可复现的派生，而不是手填 hex。
    """
    o = Oklch.from_color(c)
    a = ((c >> 24) & 0xFF) / 255.0
    return Oklch(o.l + BUBBLE_HIGHLIGHT_DL, o.c * BUBBLE_HIGHLIGHT_CSCALE, o.h).to_color(alpha=a)


def derive_captions(light, dark):
    """caption 的两侧取值。

    浅色侧没有第五级：inkFaint(5.00) 到 inkGhost(2.24) 之间任何插值都跌破
    4.5，所以 caption 与 tertiary 同色（= inkFaint），这是实测约束。
    深色侧有空间，用 mix(paperFaint, paperGhost, 0.30)，对 night 约 5.0。
    """
    return {
        "light": css_color(light["inkFaint"]),
        "dark": css_color(mix_argb(dark["paperFaint"], dark["paperGhost"], CAPTION_MIX)),
    }


def derive_hairlines():
    """四档描边 alpha。浅色用 shadowInk 的 RGB，深色用纯白。"""
    return {
        "light": [hairline_rgba(HAIRLINE_INK, a) for a in HAIRLINE_LIGHT],
        "dark": [hairline_rgba((255, 255, 255), a) for a in HAIRLINE_DARK],
    }


def ts_string(s):
    """JSON 的字符串字面量恰好也是合法的 TS 双引号字面量。"""
    return json.dumps(s, ensure_ascii=False)


def render_ts_entries(entries):
    """把每套配色渲染成 TS 对象字面量，字段顺序稳定。"""
    out = []
    for e in entries:
        aid = e["id"]
        zh, en = ACCENT_LABELS[aid]

        def block(mapping):
            return "".join("      %s: %s,\n" % (k, ts_string(mapping[k])) for k in mapping)

        parts = []
        parts.append("  %s: {" % aid)
        parts.append("    id: %s," % ts_string(aid))
        parts.append("    label: { zh: %s, en: %s }," % (ts_string(zh), ts_string(en)))
        parts.append("    tint: { hue: %g, chroma: %g },"
                     % (e["tint"]["hue"], e["tint"]["chroma"]))
        parts.append("    light: {\n%s    }," % block(e["light"]))
        parts.append("    dark: {\n%s    }," % block(e["dark"]))
        parts.append("    accent: {\n%s    }," % block(e["accent"]))
        parts.append("    caption: { light: %s, dark: %s },"
                     % (ts_string(e["caption"]["light"]), ts_string(e["caption"]["dark"])))
        parts.append("    hairline: { light: [%s], dark: [%s] },"
                     % (", ".join(ts_string(x) for x in e["hairline"]["light"]),
                        ", ".join(ts_string(x) for x in e["hairline"]["dark"])))
        parts.append("  },")
        out.append("\n".join(parts))
    return "\n".join(out)


def render_ts(entries, fixed_css, elapsed):
    """生成 src/client/palettes.ts 的完整内容。"""
    head = [
        "/**",
        " * AUTO-GENERATED FILE — do not edit by hand.",
        " *",
        " * Regenerate: python3 tools/derive-tokens.py",
        " * Source of truth: DSH Go app/lib/ui/theme/{oklch,palette,accent}.dart,",
        " * re-implemented in the generator (values are computed, never copied).",
        " *",
        " * Colours are CSS-ready: translucent values carry #RRGGBBAA ordering",
        " * (Flutter ARGB is converted at generation time).",
        " */",
        "",
        "export type AccentId = %s" % " | ".join(ts_string(a) for a in ACCENT_ORDER),
        "",
        "export const ACCENT_IDS = [%s] as const" % ", ".join(ts_string(a) for a in ACCENT_ORDER),
        "",
        "export const LIGHT_TOKENS = [%s] as const"
        % ", ".join(ts_string(t) for t in LIGHT_TOKENS),
        "export type LightToken = (typeof LIGHT_TOKENS)[number]",
        "",
        "export const DARK_TOKENS = [%s] as const"
        % ", ".join(ts_string(t) for t in DARK_TOKENS),
        "export type DarkToken = (typeof DARK_TOKENS)[number]",
        "",
        "export const ACCENT_COLOR_TOKENS = [%s] as const"
        % ", ".join(ts_string(t) for t in ACCENT_FIELDS + ["bubbleHighlight", "onSeed"]),
        "export type AccentColorToken = (typeof ACCENT_COLOR_TOKENS)[number]",
        "",
        "/** One accent palette: two neutral ramps, the accent ramp, and the derived values. */",
        "export interface AccentPalette {",
        "  readonly id: AccentId",
        "  readonly label: { readonly zh: string; readonly en: string }",
        "  /** Source tint applied to the mist ramp (hue in OKLCH degrees). */",
        "  readonly tint: { readonly hue: number; readonly chroma: number }",
        "  readonly light: Readonly<Record<LightToken, string>>",
        "  readonly dark: Readonly<Record<DarkToken, string>>",
        "  readonly accent: Readonly<Record<AccentColorToken, string>>",
        "  /**",
        "   * Fifth text level.",
        "   * Light: equal to light.inkFaint — the ramp has no room for a fifth",
        "   * distinguishable level above AA (see docs/visual-spec.md section 6.1).",
        "   * Dark: mix(paperFaint, paperGhost, 0.30), contrast about 5.0 on night.",
        "   */",
        "  readonly caption: { readonly light: string; readonly dark: string }",
        "  /**",
        "   * Four border alphas for --dsw-alias-border-l1..l4.",
        "   * Light uses shadowInk RGB; dark uses white. Never solid greys —",
        "   * solid borders do not let the gradient through (visual-spec 6.1.2).",
        "   */",
        "  readonly hairline: {",
        "    readonly light: readonly [string, string, string, string]",
        "    readonly dark: readonly [string, string, string, string]",
        "  }",
        "}",
        "",
        "/** All six palettes, keyed by accent id. */",
        "export const PALETTES: { readonly [K in AccentId]: AccentPalette } = {",
    ]
    fixed_block = [
        "}",
        "",
        "/**",
        " * Palette-independent colours (danger ramp, the dusk semantic ramp,",
        " * translucent slate base). Same CSS-ready format as the palettes.",
        " */",
        "export const FIXED_COLORS = {",
    ]
    for k in FIXED:
        fixed_block.append("  %s: %s," % (k, ts_string(fixed_css[k])))
    tail = fixed_block + [
        "} as const",
        "",
        "export type FixedColorToken = keyof typeof FIXED_COLORS",
        "",
        "/** Generator wall-clock time in seconds (provenance only, not used at runtime). */",
        "export const GENERATED_IN_SECONDS = %s" % repr(round(elapsed, 4)),
        "",
    ]
    return "\n".join(head) + "\n" + render_ts_entries(entries) + "\n" + "\n".join(tail)


def main():
    t0 = time.perf_counter()

    palette = {"schema": "dshgo-theme-tokens/2", "accents": {}}
    light_by_accent, dark_by_accent = {}, {}
    ts_entries = []

    for aid in ACCENT_ORDER:
        a = ACCENTS[aid]
        light, dark = neutral_tones_of(a["tintHue"], a["tintChroma"], ctx_prefix=aid)
        light_by_accent[aid] = light
        dark_by_accent[aid] = dark

        accent_out = {f: hex_of(a[f]) for f in ACCENT_FIELDS}
        accent_out["bubbleHighlight"] = hex_of(bubble_highlight(a["bubble"]))
        accent_out["onSeed"] = hex_of(ON_SEED)
        accent_out["tintHue"] = a["tintHue"]
        accent_out["tintChroma"] = a["tintChroma"]

        captions = derive_captions(light, dark)
        hairlines = derive_hairlines()

        entry = {
            "id": aid,
            "light": {k: hex_of(v) for k, v in light.items()},
            "dark": {k: hex_of(v) for k, v in dark.items()},
            "accent": accent_out,
            "caption": captions,
            "hairline": hairlines,
            "fixed": {k: hex_of(v) for k, v in FIXED.items()},
        }
        for scheme in ("light", "dark"):
            entry[scheme]["accent"] = accent_out
        palette["accents"][aid] = entry

        # TypeScript 侧用 CSS 可用的颜色串（含 ARGB->RGBA 换位）
        ts_acc = {f: css_color(a[f]) for f in ACCENT_FIELDS}
        ts_acc["bubbleHighlight"] = css_color(bubble_highlight(a["bubble"]))
        ts_acc["onSeed"] = css_color(ON_SEED)
        ts_entries.append({
            "id": aid,
            "light": {k: css_color(v) for k, v in light.items()},
            "dark": {k: css_color(v) for k, v in dark.items()},
            "accent": ts_acc,
            "tint": {"hue": a["tintHue"], "chroma": a["tintChroma"]},
            "caption": captions,
            "hairline": hairlines,
        })

    # -- 5.1 算法自检：源码注释里写死的数值能否复现 ----------------------
    selfcheck = []

    def chk(name, got, want, ok, note=""):
        selfcheck.append({"check": name, "got": str(got), "want": str(want),
                          "pass": bool(ok), "note": note})

    o = Oklch.from_color(0xFF4D6BFE)
    chk("#4D6BFE -> OKLCH", "(%.2f, %.2f, %.0f)" % (o.l, o.c, o.h), "(0.59, 0.22, 270)",
        round(o.l, 2) == 0.59 and round(o.c, 2) == 0.22 and round(o.h) == 270,
        "accent.dart 文件头注释")
    c2 = Oklch(0.53, 0.125, 267).to_color()
    chk("OKLCH(0.53,0.125,267) -> hex", hex_of(c2), "#4B67B4",
        c2 == 0xFF4B67B4, "mist.seed")
    r2 = contrast(0xFFFFFFFF, c2)
    chk("白字对 mist.seed", "%.2f" % r2, "5.39", abs(r2 - 5.39) < 0.005,
        "accent.dart: 白字 5.39")
    bad = [k for k, v in P.items()
           if Oklch.from_color(v).to_color(alpha=((v >> 24) & 0xFF) / 255.0) != v]
    chk("sRGB->OKLCH->sRGB 往返恒等（%d 个常量）" % len(P),
        "失败 %d: %s" % (len(bad), bad[:6]), "0 失败", not bad,
        "验证矩阵与传递函数复刻")
    rr = retint(0x17FFFFFF, 0.0, 1.0)
    chk("retint 早退保留 alpha (0x17FFFFFF)", hex_of(rr), "#17FFFFFF",
        rr == 0x17FFFFFF, "hueShift==0 且 chromaScale==1 原样返回")
    rr2 = retint(0x17FFFFFF, 32.0, 0.4)
    chk("retint 后 alpha 仍为 0x17", hex_of(rr2)[:3], "#17",
        hex_of(rr2).startswith("#17"), "alpha 通道保留")

    # retint 不变量：明度零位移、色相恰好转 shift、彩度恰好乘 scale
    # 注：中性色调到极小彩度后，单步 8bit 量化就能让测回的色相/彩度跳动，
    # 因此色相只在"落地彩度 >= 0.03"的样本上比对，彩度用绝对偏差（与量级无关）。
    LOG_ENABLED[0] = False
    max_dl = max_dc = max_dh = 0.0
    worst_l = worst_c = worst_h = ""
    n_dl = n_dc = n_dh = 0
    for aid in ACCENT_ORDER:
        a = ACCENTS[aid]
        shift = a["tintHue"] - BASE_HUE
        scale = a["tintChroma"]
        for tk in LIGHT_TOKENS + DARK_TOKENS:
            base = P[tk]
            out = retint(base, shift, scale)
            b0, b1 = Oklch.from_color(base), Oklch.from_color(out)
            dl = abs(b1.l - b0.l)
            n_dl += 1
            if dl > max_dl:
                max_dl, worst_l = dl, aid + "/" + tk
            dc = abs(b1.c - b0.c * scale)
            n_dc += 1
            if dc > max_dc:
                max_dc, worst_c = dc, aid + "/" + tk
            if b0.c * scale >= 0.03:
                dh = abs((b1.h - b0.h - shift + 180.0) % 360.0 - 180.0)
                n_dh += 1
                if dh > max_dh:
                    max_dh, worst_h = dh, aid + "/" + tk
    chk("retint 不变量: |dL| 最大（%d 个样本）" % n_dl,
        "%.4f (%s)" % (max_dl, worst_l), "<= 0.0035", max_dl <= 0.0035,
        "明度零位移（余量为 8bit 量化）")
    chk("retint 不变量: 彩度绝对偏差最大（%d 个样本）" % n_dc,
        "%.4f (%s)" % (max_dc, worst_c), "<= 0.0030", max_dc <= 0.0030,
        "彩度 = 原彩度 x chromaScale")
    LOG_ENABLED[0] = True
    chk("retint 不变量: |dH - shift| 最大（%d 个 c>=0.03 样本）" % n_dh,
        "%.3f deg (%s)" % (max_dh, worst_h), "<= 2.5 deg", max_dh <= 2.5,
        "色相恰好加 hueShift；近中性色残差为 8bit 量化的彩度量子（约 0.002）")

    # -- 5.2 注释断言 ----------------------------------------------------
    documented = []

    def doc_row(accent, scheme, pair, fg, bg, floor, note):
        r = contrast(fg, bg)
        documented.append({"accent": accent, "scheme": scheme, "pair": pair,
                           "fg": hex_of(fg), "bg": hex_of(bg), "ratio": round(r, 3),
                           "floor": floor, "pass": r >= floor, "note": note})

    surface_breakdown = {"ink_light": {}, "paper_dark": {}}

    for aid in ACCENT_ORDER:
        L, D = light_by_accent[aid], dark_by_accent[aid]
        acc = ACCENTS[aid]
        surface_breakdown["ink_light"][aid] = {
            s: round(contrast(L["ink"], L[s]), 3) for s in LIGHT_SURFACES}
        surface_breakdown["paper_dark"][aid] = {
            s: round(contrast(D["paper"], D[s]), 3) for s in DARK_SURFACES}
        w = min((contrast(L["ink"], L[s]), s) for s in LIGHT_SURFACES)
        doc_row(aid, "light", "ink / 最差浅色面 " + w[1], L["ink"], L[w[1]], 13.0,
                "palette.dart: ink 对所有浅色面 >= 13")
        doc_row(aid, "light", "inkMuted / mist", L["inkMuted"], L["mist"], 6.2,
                "palette.dart: 次级文字 >= 6.2")
        doc_row(aid, "light", "inkFaint / mist", L["inkFaint"], L["mist"], 4.6,
                "palette.dart: 三级文字 >= 4.6")
        doc_row(aid, "light", "outlineLight / mist", L["outlineLight"], L["mist"], 3.0,
                "palette.dart: 交互边界非文字 >= 3")
        wd = min((contrast(D["paper"], D[s]), s) for s in DARK_SURFACES)
        doc_row(aid, "dark", "paper / 最差深色面 " + wd[1], D["paper"], D[wd[1]], 10.5,
                "palette.dart: paper 对深色面 >= 10.5")
        doc_row(aid, "light", "onContainer / container", acc["onContainer"],
                acc["container"], 7.0, "accent.dart: 容器对 >= 7")
        doc_row(aid, "dark", "onContainerDark / containerDark", acc["onContainerDark"],
                acc["containerDark"], 7.0, "accent.dart: 容器对 >= 7")
        doc_row(aid, "light", "白字 / seed", ON_SEED, acc["seed"], 4.5,
                "accent.dart: seed 上白字 >= 4.5")
        doc_row(aid, "dark", "onSeedDark / seedDark", acc["onSeedDark"],
                acc["seedDark"], 7.0, "accent.dart: seedDark 上深墨字 >= 7")
        doc_row(aid, "light", "ink / bubble", L["ink"], acc["bubble"], 5.8,
                "accent.dart: 气泡内主文字 >= 5.8")
        doc_row(aid, "light", "inkMuted / bubble", L["inkMuted"], acc["bubble"], 5.8,
                "accent.dart: 气泡内次级文字 >= 5.8")

    # 按断言类型聚合（六套里的最小值 / 通过数）
    documented_summary = []
    claim_order = []
    for d in documented:
        if d["note"] not in claim_order:
            claim_order.append(d["note"])
    for note in claim_order:
        rows = [d for d in documented if d["note"] == note]
        worst = min(rows, key=lambda x: x["ratio"])
        documented_summary.append({
            "claim": note, "floor": worst["floor"],
            "min_ratio": worst["ratio"], "worst_accent": worst["accent"],
            "worst_pair": worst["pair"],
            "pass_count": sum(1 for x in rows if x["pass"]), "total": len(rows),
            "pass": all(x["pass"] for x in rows),
        })

    # -- 5.3 任务要求的关键对比度（4.5 / 7 双档）-------------------------
    key = []

    def key_row(label, accent, scheme, fg, fgname, bg, bgname):
        r = contrast(fg, bg)
        key.append({"label": label, "accent": accent, "scheme": scheme,
                    "fg": fgname, "bg": bgname, "fg_hex": hex_of(fg),
                    "bg_hex": hex_of(bg), "ratio": round(r, 3),
                    "aa": r >= PASS_AA, "aaa": r >= PASS_AAA, "ui": r >= PASS_UI})

    for aid in ACCENT_ORDER:
        L, D = light_by_accent[aid], dark_by_accent[aid]
        acc = ACCENTS[aid]
        for bn in ("mistLowest", "mist", "mistContainer"):
            key_row("ink 对 " + bn, aid, "light", L["ink"], "ink", L[bn], bn)
        for bn in ("nightLowest", "night", "nightContainer"):
            key_row("paper 对 " + bn, aid, "dark", D["paper"], "paper", D[bn], bn)
        key_row("白字 对 seed", aid, "light", ON_SEED, "onSeed", acc["seed"], "seed")
        key_row("onSeedDark 对 seedDark", aid, "dark", acc["onSeedDark"],
                "onSeedDark", acc["seedDark"], "seedDark")

    # -- 5.4 对比度保护层探测（3:1 非文字）-------------------------------
    guards = []
    for aid in ACCENT_ORDER:
        L, D = light_by_accent[aid], dark_by_accent[aid]
        acc = ACCENTS[aid]
        for label, fg, bg in (
            ("seed 对 mistLowest (强调色 3:1)", acc["seed"], L["mistLowest"]),
            ("seedDark 对 nightLowest (强调色 3:1)", acc["seedDark"], D["nightLowest"]),
            ("inkGhost 对 mist (纯装饰 ~2.5)", L["inkGhost"], L["mist"]),
            ("paperGhost 对 night (纯装饰 ~2.5)", D["paperGhost"], D["night"]),
        ):
            guards.append({"accent": aid, "check": label, "fg": hex_of(fg),
                           "bg": hex_of(bg), "ratio": round(contrast(fg, bg), 3)})

    elapsed = time.perf_counter() - t0

    # -- 5.5 palette.json ------------------------------------------------
    palette["fixed_all"] = {k: hex_of(v) for k, v in FIXED.items()}
    palette["meta"] = {
        "derived_from": "<dsh-Go 检出目录>/app/lib/ui/theme/",
        "data_notice": "色值属功能性数据，由脚本从 DSH Go 公开仓库的配色常量推导；本仓库不含上游的代码、素材或字体。本仓库代码以 MIT 发布（见 LICENSE）。",
        "source_files": ["oklch.dart", "palette.dart", "accent.dart"],
        "base_hue": BASE_HUE,
        "algorithm": "retint(明度不变, hue += tintHue-266, chroma *= tintChroma, alpha 保留);"
                     " 超色域时 24 步二分降彩度(明度色相不动)",
        "to_color_calls": CONVERSIONS[0],
        "gamut_clips": len(CLIP_LOG),
        "gamut_clip_details": CLIP_LOG,
        "elapsed_seconds": round(elapsed, 4),
        "contrast_note": "palette_contrast_test.dart 在参考源码中缺失；documented "
                         "段核对的是源码注释里写明的数值门槛",
    }
    palette["contrast"] = {
        "documented_assertions": documented,
        "documented_summary": documented_summary,
        "ink_paper_by_surface": surface_breakdown,
        "key_pairs": key,
        "guard_probe": guards,
        "documented_failures": [d for d in documented if not d["pass"]],
        "key_failures_below_4_5": [k for k in key if not k["aa"]],
        "key_failures_below_7": [k for k in key if not k["aaa"]],
    }
    os.makedirs(OUT_DIR, exist_ok=True)
    with open(os.path.join(OUT_DIR, "palette.json"), "w", encoding="utf-8") as f:
        json.dump(palette, f, ensure_ascii=False, indent=2)
        f.write("\n")

    # -- 5.5b src/client/palettes.ts（TS 侧，CSS 可用颜色串）-------------
    if TS_DIR:
        os.makedirs(TS_DIR, exist_ok=True)
        ts_path = os.path.join(TS_DIR, "palettes.ts")
        with open(ts_path, "w", encoding="utf-8") as f:
            f.write(render_ts(ts_entries, {k: css_color(v) for k, v in FIXED.items()}, elapsed))
        print("wrote %s" % ts_path)

    md = render_md(palette, light_by_accent, dark_by_accent, selfcheck,
                   documented, key, guards, elapsed,
                   documented_summary, surface_breakdown)
    with open(os.path.join(OUT_DIR, "palette-tables.md"), "w", encoding="utf-8") as f:
        f.write(md)

    # -- 5.6 报告 --------------------------------------------------------
    print("=" * 78)
    print("耗时 %.3f s | toColor 调用 %d 次 | 色域裁剪触发 %d 次"
          % (elapsed, CONVERSIONS[0], len(CLIP_LOG)))
    print("=" * 78)
    print("")
    print("[算法自检]")
    for s in selfcheck:
        print("  %s %s | got=%s want=%s" % ("OK " if s["pass"] else "FAIL",
                                            s["check"], s["got"], s["want"]))
    print("")
    print("[seed / seedDark 一览]")
    for aid in ACCENT_ORDER:
        a = ACCENTS[aid]
        print("  %-10s seed %s 白字 %.2f | seedDark %s onSeedDark %.2f"
              % (aid, hex_of(a["seed"]), contrast(ON_SEED, a["seed"]),
                 hex_of(a["seedDark"]), contrast(a["onSeedDark"], a["seedDark"])))
    nfail_doc = sum(1 for d in documented if not d["pass"])
    print("")
    print("[注释断言 %d 条] 失败 %d 条 —— 按断言聚合（六套取最小）："
          % (len(documented), nfail_doc))
    for s in documented_summary:
        print("  %s 门槛 %.1f 最小 %.2f (%s/%s) 通过 %d/%d"
              % ("OK  " if s["pass"] else "FAIL", s["floor"], s["min_ratio"],
                 s["worst_accent"], s["worst_pair"], s["pass_count"], s["total"]))
    print("  失败明细：")
    for d in documented:
        if not d["pass"]:
            print("    %-9s %-5s %-30s %5.2f < %.1f"
                  % (d["accent"], d["scheme"], d["pair"], d["ratio"], d["floor"]))
    print("")
    print("[ink / paper 逐面矩阵]  (门槛: ink>=13 对浅色面, paper>=10.5 对深色面)")
    for aid in ACCENT_ORDER:
        row = surface_breakdown["ink_light"][aid]
        print("  %-9s ink : %s" % (aid, "  ".join(
            "%s=%.2f%s" % (k, v, "*" if v < 13.0 else "") for k, v in row.items())))
        row = surface_breakdown["paper_dark"][aid]
        print("  %-9s paper: %s" % (aid, "  ".join(
            "%s=%.2f%s" % (k, v, "*" if v < 10.5 else "") for k, v in row.items())))
    print("")
    print("[关键对比度 %d 条] <4.5 失败 %d 条"
          % (len(key), sum(1 for k in key if not k["aa"])))
    print("  最差 5 组:")
    for k in sorted(key, key=lambda x: x["ratio"])[:5]:
        print("    %-9s %-22s %.2f  (%s on %s)"
              % (k["accent"], k["label"], k["ratio"], k["fg_hex"], k["bg_hex"]))
    print("  AA 未达 AAA(<7) 共 %d 条:" % sum(1 for k in key if not k["aaa"]))
    for k in key:
        if not k["aaa"]:
            print("    %-9s %-22s %.2f" % (k["accent"], k["label"], k["ratio"]))
    print("")
    print("[保护层探测]")
    for g in guards:
        print("  %-9s %-34s %.2f" % (g["accent"], g["check"], g["ratio"]))
    print("")
    print("[色域裁剪] %s"
          % ("无（24 步二分分支未进入）" if not CLIP_LOG else "%d 次" % len(CLIP_LOG)))
    for c in CLIP_LOG[:15]:
        print("  %-32s L=%.3f c %.4f->%.4f h=%.1f -> %s"
              % (c["ctx"], c["l"], c["c_req"], c["c_out"], c["h"], c["out"]))
    print("")
    print("产物: palette.json / palette.md")
    return 0


# ==========================================================================
# 6. markdown 渲染（` 代表反引号）
# ==========================================================================

LIGHT_ROLE = {
    "mistTop": "页面渐变顶", "mistBottom": "页面渐变底", "mist": "不透明页面底",
    "mistLowest": "面色最低阶", "mistLow": "面色低阶", "mistContainer": "面色容器",
    "mistHigh": "面色高阶", "mistHighest": "面色最高阶",
    "ink": "主文字", "inkMuted": "次级文字", "inkFaint": "三级文字",
    "inkGhost": "禁用/装饰", "outlineLight": "交互边界", "ruleLight": "分割线",
    "shadowInk": "阴影基色", "slate": "secondary", "slateContainer": "secondaryContainer",
    "inverseSurface": "inverseSurface", "onInverseSurface": "onInverseSurface",
    "scrim": "遮罩基色", "codeWell": "代码井底", "codeWellHeader": "代码井标题条",
    "codeWellBorder": "代码井描边", "lineNumber": "行号", "comment": "代码注释",
}
DARK_ROLE = {
    "nightTop": "页面渐变顶", "nightBottom": "页面渐变底", "night": "不透明页面底",
    "nightLowest": "面色最低阶", "nightLow": "面色低阶", "nightContainer": "面色容器",
    "nightHigh": "面色高阶", "nightHighest": "面色最高阶",
    "paper": "主文字", "paperMuted": "次级文字", "paperFaint": "三级文字",
    "paperGhost": "禁用/装饰", "outlineDark": "交互边界", "ruleDark": "分割线",
    "shadowNight": "阴影基色", "slateLift": "secondary", "onSlateLift": "onSecondary",
    "smoke": "玻璃 chrome", "sheetDark": "弹层底", "codeWellDark": "代码井底",
    "codeWellHeaderDark": "代码井标题条", "codeWellBorderDark": "代码井描边",
    "lineNumberDark": "行号", "commentDark": "代码注释", "terminal": "终端卡",
    "terminalKey": "终端按键",
}


def render_md(palette, light_by_accent, dark_by_accent, selfcheck,
              documented, key, guards, elapsed, documented_summary,
              surface_breakdown):
    A = palette["accents"]
    o = []
    w = o.append
    w("# DSH Go 配色令牌（脚本推导，勿手改）")
    w("")
    w("由 `derive_tokens.py` 复刻 DSH Go 的 OKLCH 推导生成。中性色 = 雾蓝基线整条 "
      "`retint(hueShift = tintHue - 266, chromaScale = tintChroma)`，**明度零位移**，"
      "因此六套配色的文字对比度完全一致。")
    w("")
    w("- 参考源码：`<dsh-Go 检出目录>/app/lib/ui/theme/`（公开仓库，未随本仓库分发）")
    w("- 数据性质：色值为功能性数据，由脚本从上游公开仓库的配色常量推导；"
      "本仓库不含上游的代码、素材或字体")
    w("- 算法：`oklch.dart`（sRGB <-> OKLab <-> OKLCH，超色域 24 步二分降彩度）、"
      "`palette.dart`（`NeutralTones.of`，baseHue 266）、`accent.dart`（六套预设）")
    w("- alpha 全保留：不透明写 `#RRGGBB`，半透明写 `#AARRGGBB`")
    w("")
    w("## 1. 推导规模与耗时")
    w("")
    w("| 项 | 值 |")
    w("|---|---|")
    w("| 脚本耗时 | %.3f s |" % elapsed)
    w("| toColor 调用 | %d 次 |" % palette["meta"]["to_color_calls"])
    w("| 触发色域裁剪（24 步二分降彩度） | %d 次 |" % palette["meta"]["gamut_clips"])
    w("| 中性色令牌 | %d 套 x %d = %d 个 |"
      % (len(ACCENT_ORDER), len(LIGHT_TOKENS) + len(DARK_TOKENS),
         len(ACCENT_ORDER) * (len(LIGHT_TOKENS) + len(DARK_TOKENS))))
    w("")
    w("## 2. 六套强调色一览")
    w("")
    w("| 配色 | tintHue | tintChroma | seed | pressed | container | onContainer | bubble | glow |")
    w("|---|---|---|---|---|---|---|---|---|")
    for aid in ACCENT_ORDER:
        a = ACCENTS[aid]
        w("| %s | %g | %g | `%s` | `%s` | `%s` | `%s` | `%s` | `%s` |"
          % (aid, a["tintHue"], a["tintChroma"], hex_of(a["seed"]), hex_of(a["pressed"]),
             hex_of(a["container"]), hex_of(a["onContainer"]), hex_of(a["bubble"]),
             hex_of(a["glow"])))
    w("")
    w("| 配色 | seedDark | pressedDark | onSeedDark | containerDark | onContainerDark | bubbleDark | glowDark | haze | hazeDark |")
    w("|---|---|---|---|---|---|---|---|---|---|")
    for aid in ACCENT_ORDER:
        a = ACCENTS[aid]
        w("| %s | `%s` | `%s` | `%s` | `%s` | `%s` | `%s` | `%s` | `%s` | `%s` |"
          % (aid, hex_of(a["seedDark"]), hex_of(a["pressedDark"]), hex_of(a["onSeedDark"]),
             hex_of(a["containerDark"]), hex_of(a["onContainerDark"]),
             hex_of(a["bubbleDark"]), hex_of(a["glowDark"]),
             hex_of(a["haze"]), hex_of(a["hazeDark"])))
    w("")
    w("## 3. 算法自检")
    w("")
    w("| 检查 | 期望 | 实测 | 结论 |")
    w("|---|---|---|---|")
    for s in selfcheck:
        w("| %s | `%s` | `%s` | %s |" % (s["check"], s["want"], s["got"],
                                             "OK" if s["pass"] else "**FAIL**"))
    w("")
    w("## 4. 完整色阶：mist 与 graphite")
    w("")
    for idx, aid in enumerate(("mist", "graphite")):
        w("### 4.%d %s" % (idx + 1, aid))
        w("")
        w("| 浅色 token | 角色 | hex | 深色 token | 角色 | hex |")
        w("|---|---|---|---|---|---|")
        L, D = light_by_accent[aid], dark_by_accent[aid]
        for i in range(max(len(LIGHT_TOKENS), len(DARK_TOKENS))):
            lk = LIGHT_TOKENS[i] if i < len(LIGHT_TOKENS) else ""
            dk = DARK_TOKENS[i] if i < len(DARK_TOKENS) else ""
            w("| %s | %s | %s | %s | %s | %s |"
              % (("`%s`" % lk) if lk else "", LIGHT_ROLE.get(lk, ""),
                 ("`%s`" % hex_of(L[lk])) if lk else "",
                 ("`%s`" % dk) if dk else "", DARK_ROLE.get(dk, ""),
                 ("`%s`" % hex_of(D[dk])) if dk else ""))
        w("")
    w("## 5. 其余四套：强调色字段 + 代表性 8 个中性色")
    w("")
    rep = [("mist", "浅·页面底"), ("mistLowest", "浅·面色最低"),
           ("mistContainer", "浅·面色容器"), ("ink", "浅·主文字"),
           ("inkMuted", "浅·次级文字"), ("night", "深·页面底"),
           ("nightLowest", "深·面色最低"), ("paper", "深·主文字")]
    for idx, aid in enumerate(("daiqing", "dusk", "turquoise", "amber")):
        acc = A[aid]["accent"]
        w("### 5.%d %s（tintHue %g / tintChroma %g）"
          % (idx + 1, aid, acc["tintHue"], acc["tintChroma"]))
        w("")
        w("| 字段 | hex | 字段 | hex |")
        w("|---|---|---|---|")
        fields = ["seed", "pressed", "container", "onContainer", "bubble", "glow",
                  "onSeed", "seedDark", "pressedDark", "onSeedDark", "containerDark",
                  "onContainerDark", "bubbleDark", "glowDark", "haze", "hazeDark"]
        for i in range(0, len(fields), 2):
            f1 = fields[i]
            f2 = fields[i + 1] if i + 1 < len(fields) else ""
            w("| %s | `%s` | %s | %s |"
              % (f1, acc[f1], f2, ("`%s`" % acc[f2]) if f2 else ""))
        w("")
        L, D = light_by_accent[aid], dark_by_accent[aid]
        w("| 中性色 token | 角色 | hex |")
        w("|---|---|---|")
        for tok, role in rep:
            src = L if tok in L else D
            w("| %s | %s | `%s` |" % (tok, role, hex_of(src[tok])))
        w("")
    w("## 6. 对比度自检")
    w("")
    w("### 6.1 源码注释门槛（palette_contrast_test.dart 在参考源码中缺失）")
    w("")
    w("> 下载的参考源码只有 `app/lib/` 与 `docs/`，**没有 `test/` 目录**，"
      "`accent.dart` 里提到的 `test/theme/palette_contrast_test.dart` 并不在包内，"
      "其断言无法逐条读取。下表改为核对 `palette.dart` / `accent.dart` 注释里"
      "写明的数值门槛，同样六套逐条跑。")
    w("")
    w("先按断言类型聚合（六套取最小）：")
    w("")
    w("| 断言 | 门槛 | 六套最小 | 出现在 | 通过 |")
    w("|---|---|---|---|---|")
    for s in documented_summary:
        w("| %s | >= %.1f | %.2f | %s（%s） | %d/%d %s |"
          % (s["claim"], s["floor"], s["min_ratio"], s["worst_accent"],
             s["worst_pair"], s["pass_count"], s["total"],
             "OK" if s["pass"] else "**FAIL**"))
    w("")
    w("ink 与 paper 对**整条面色阶梯**的逐面实测（带星号者为低于注释门槛）：")
    w("")
    w("| 配色 | ink / mistTop | / mistBottom | / mist | / mistLowest | / mistLow | / mistContainer | / mistHigh | / mistHighest |")
    w("|---|---|---|---|---|---|---|---|---|")
    for aid in ACCENT_ORDER:
        row = surface_breakdown["ink_light"][aid]
        w("| %s | %s |" % (aid, " | ".join(
            "%.2f%s" % (row[k], "*" if row[k] < 13.0 else "") for k in LIGHT_SURFACES)))
    w("")
    w("| 配色 | paper / nightTop | / nightBottom | / night | / nightLowest | / nightLow | / nightContainer | / nightHigh | / nightHighest |")
    w("|---|---|---|---|---|---|---|---|---|")
    for aid in ACCENT_ORDER:
        row = surface_breakdown["paper_dark"][aid]
        w("| %s | %s |" % (aid, " | ".join(
            "%.2f%s" % (row[k], "*" if row[k] < 10.5 else "") for k in DARK_SURFACES)))
    w("")
    w("逐条明细：")
    w("")
    w("| 配色 | 方案 | 组合 | 前景 | 背景 | 实测 | 门槛 | 结论 |")
    w("|---|---|---|---|---|---|---|---|")
    for d in documented:
        w("| %s | %s | %s | `%s` | `%s` | %.2f | >= %.1f | %s |"
          % (d["accent"], d["scheme"], d["pair"], d["fg"], d["bg"],
             d["ratio"], d["floor"], "OK" if d["pass"] else "**FAIL**"))
    w("")
    w("### 6.2 关键对比度（任务指定）")
    w("")
    w("| 配色 | 方案 | 组合 | 前景 | 背景 | 比值 | >=4.5 | >=7 |")
    w("|---|---|---|---|---|---|---|---|")
    for k in key:
        w("| %s | %s | %s | `%s` | `%s` | %.2f | %s | %s |"
          % (k["accent"], k["scheme"], k["label"], k["fg_hex"], k["bg_hex"],
             k["ratio"], "Y" if k["aa"] else "**N**", "Y" if k["aaa"] else "-"))
    w("")
    w("### 6.3 最差 5 组")
    w("")
    w("| 配色 | 组合 | 比值 | 前景 | 背景 |")
    w("|---|---|---|---|---|")
    for k in sorted(key, key=lambda x: x["ratio"])[:5]:
        w("| %s | %s | %.2f | `%s` | `%s` |"
          % (k["accent"], k["label"], k["ratio"], k["fg_hex"], k["bg_hex"]))
    w("")
    w("### 6.4 对比度保护层探测（3:1 非文字）")
    w("")
    w("| 配色 | 检查 | 前景 | 背景 | 比值 |")
    w("|---|---|---|---|---|")
    for g in guards:
        w("| %s | %s | `%s` | `%s` | %.2f |"
          % (g["accent"], g["check"], g["fg"], g["bg"], g["ratio"]))
    w("")
    w("### 6.5 色域裁剪")
    w("")
    if palette["meta"]["gamut_clips"]:
        w("| 位置 | L | 请求彩度 | 落地彩度 | 色相 | 输出 |")
        w("|---|---|---|---|---|---|")
        for c in palette["meta"]["gamut_clip_details"]:
            w("| `%s` | %.3f | %.4f | %.4f | %.1f | `%s` |"
              % (c["ctx"], c["l"], c["c_req"], c["c_out"], c["h"], c["out"]))
    else:
        w("**无**：全部 %d 次转换都落在 sRGB 色域内，24 步二分降彩度分支一次都没进入。"
          % palette["meta"]["to_color_calls"])
    w("")
    return "\n".join(o) + "\n"


if __name__ == "__main__":
    sys.exit(main())
