#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""独立校验：把 derive_tokens.py 里硬编码的常量与 Dart 源码逐字比对，
排除抄写错误。只读源码、只读产物，不写任何项目文件。"""
import json, os, re, sys

# 用法：python3 tools/check-dart-constants.py [<参考源码的 theme 目录>]
# 参考源码可从 https://github.com/ccch1mneyyy/dsh-Go 取到，目录形如 app/lib/ui/theme/
REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REF = sys.argv[1] if len(sys.argv) > 1 else os.environ.get("DSHGO_REF_DIR", "")
if not REF:
    sys.exit("请指定参考源码目录：python3 tools/check-dart-constants.py <dsh-Go 的 app/lib/ui/theme/>\n"
             "也可用环境变量 DSHGO_REF_DIR 指定。源码可从 https://github.com/ccch1mneyyy/dsh-Go 取得，"
             "本仓库不分发。")
REF = REF if REF.endswith(os.sep) else REF + os.sep
PALETTE = sys.argv[2] if len(sys.argv) > 2 else os.path.join(REPO, "docs", "reference", "palette.json")

for need in ("palette.dart", "accent.dart"):
    if not os.path.exists(REF + need):
        sys.exit(f"找不到 {REF + need}\n用法: python3 tools/check-dart-constants.py <参考源码的 theme 目录>")
if not os.path.exists(PALETTE):
    sys.exit(f"找不到 {PALETTE}；先跑 python3 tools/derive-tokens.py")

pal_src = open(REF + "palette.dart", encoding="utf-8").read()
acc_src = open(REF + "accent.dart", encoding="utf-8").read()
data = json.load(open(PALETTE, encoding="utf-8"))

# ---- palette.dart: static const NAME = Color(0xVALUE);
dart_pal = {}
for m in re.finditer(r"static const (\w+)\s*=\s*Color\(0x([0-9A-Fa-f]{8})\)", pal_src):
    dart_pal.setdefault(m.group(1), m.group(2).upper())
# NeutralTones.defaults 里直接写死的字段
dn = re.search(r"static const defaults = NeutralTones\((.*?)\n  \);", pal_src, re.S)
dart_defaults = {}
if dn:
    for m in re.finditer(r"(\w+):\s*(?:DshPalette\.(\w+)|Color\(0x([0-9A-Fa-f]{8})\))", dn.group(1)):
        field, alias, lit = m.group(1), m.group(2), m.group(3)
        dart_defaults[field] = dart_pal.get(alias).upper() if alias else lit.upper()

# ---- accent.dart: 每个预设块
dart_acc = {}
for aid in ("mist", "daiqing", "dusk", "turquoise", "amber", "graphite"):
    blk = re.search(r"static const " + aid + r" = AppAccent\((.*?)\n  \);", acc_src, re.S)
    assert blk, aid
    d = {}
    for m in re.finditer(r"(\w+):\s*Color\(0x([0-9A-Fa-f]{8})\)", blk.group(1)):
        d[m.group(1)] = m.group(2).upper()
    for m in re.finditer(r"(tintHue|tintChroma):\s*([\d.]+)", blk.group(1)):
        d[m.group(1)] = float(m.group(2))
    dart_acc[aid] = d

def norm(h):
    """json 里不透明色写作 #RRGGBB，Dart 常量是 8 位 ARGB：#FFxxxxxx。"""
    h = h.lstrip("#").upper()
    return h[2:] if len(h) == 8 and h.startswith("FF") else h


fails = []
# 1) 浅色/深色中性色阶（mist 一套应当与常量逐字节相同）
mist_light = data["accents"]["mist"]["light"]
mist_dark = data["accents"]["mist"]["dark"]
for field, hexv in dart_defaults.items():
    got = mist_light.get(field) or mist_dark.get(field)
    if got is None:
        fails.append("missing token: " + field); continue
    if norm(got) != norm(hexv):
        fails.append("%s: json=%s dart=%s" % (field, got, hexv))
# 2) 六套 accent
for aid in dart_acc:
    for k, v in dart_acc[aid].items():
        got = data["accents"][aid]["accent"].get(k)
        if isinstance(v, float):
            if got is None or abs(float(got) - v) > 1e-9:
                fails.append("%s.%s: json=%s dart=%s" % (aid, k, got, v))
        else:
            if got is None or norm(got) != norm(v):
                fails.append("%s.%s: json=%s dart=%s" % (aid, k, got, v))

print("dart 常量数: palette=%d, defaults=%d, accent 字段=%d"
      % (len(dart_pal), len(dart_defaults), sum(len(v) for v in dart_acc.values())))
print("不一致: %d" % len(fails))
for f in fails[:20]:
    print("  " + f)
print("Verdict:", "PASS" if not fails else "FAIL")
sys.exit(0 if not fails else 1)
