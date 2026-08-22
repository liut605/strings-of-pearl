#!/usr/bin/env python3
"""Download per-vine SVGs from Figma Desktop and compose assets/vines.svg."""

from __future__ import annotations

import re
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets" / "vines.svg"

ORIGIN_X = 172.35211181640625
ORIGIN_Y = 45.0
SHEET_W = 1376
SHEET_H = 755

# name, url hash, artboard x, artboard y
VINES = [
    ("vine-48", "e8fc8cac919af1c249c40614526b4ac967bbaf0e", 1491.0000610351562, 55),
    ("vine-47", "4587bccc94523df4015818d3b6666660c1b1fa93", 1454.0000610351562, 49),
    ("vine-46", "0fff91ec0d9c668b494705e1c24e34ed1513988f", 1440.0000610351562, 67),
    ("vine-45", "ee0f8eb3d4bb94df4bddc46f2ce00e231fb1f163", 1421.0000610351562, 63),
    ("vine-44", "1f7ad665780280d890ef62ce250b423623bec06c", 1403.0000610351562, 62),
    ("vine-special-2", "418bb7174d7c01ee87099e01f474acec1fe1ceef", 1299.0000610351562, 76.5),
    ("vine-43", "0c5722f652136526f61ba3281f3447daee9a39a9", 1376.5000610351562, 63),
    ("vine-42", "3d399bf772f896c3ddf15f788b723e410d0c5102", 1344.0000610351562, 50),
    ("vine-41", "a50edcb836900836afe177e96433ac8d38e5a35d", 1357.0000610351562, 68),
    ("vine-40", "1e61406ccfe467b22250f023dda21a8d65ac403c", 1340.0000610351562, 63),
    ("vine-39", "9209874e4a5c7f88d3d73fcf32bc62f851a5d21c", 1312.0000610351562, 61),
    ("vine-38", "e8c39b9c2463480c9764ab74aa6049622e93135b", 1281.9771118164062, 60),
    ("vine-37", "bd0886dafbfcbbcd5d1a3a119a8a3a5a11e97b96", 1224.0000610351562, 57),
    ("vine-36", "fd3c54973bc73b87cedd5b35fd5f24fde1754e12", 1197.0000610351562, 68),
    ("vine-35", "9dc9adb0e4f3de9344314545be4c400e5b0525d7", 1125, 48),
    ("vine-34", "7eed0d4cbf6509a9ef8f0002c411d719dee8f876", 1116, 52),
    ("vine-33", "e12ce270c8e6c030c10fd5185c20544bd5d1f368", 1074, 61),
    ("vine-32", "d66974a8b2a6dcd96984e826c48d01ae2dc3594b", 1041.5, 66),
    ("vine-31", "b8debf50f76c7660d678b57dac6505fc19ece310", 1009, 45),
    ("!!vine-30", "c722bf6fe209e2dd66eb7cc6a869093a9c41bd05", 971, 56),
    ("!!vine-29", "22adc8f7828114b9213792197e8e28e1ff12a978", 953, 55),
    ("vine-28", "0e06857d64561d868b5341a4cde6b9d31830d321", 923, 70),
    ("vine-27", "1daee0ac14448dded59a36d4d945b91bfd431d38", 882, 58),
    ("vine-26", "d99f7b9b95c0745ccf4020b6ad20fc4595947d4b", 866, 63),
    ("vine-25", "2845f232a3e58267433613fde1e295a913761790", 820, 55),
    ("vine-24", "37fe78d8cb98a230f134c47166707dc893ad1e73", 812, 63),
    ("vine-23", "ae0da47dca5bb61a491f1051238b7df69c84b6bf", 799, 57),
    ("vine-22", "64fdcc1a29fe37723d2a3657c3604bd24a23d0b8", 768, 59),
    ("vine-21", "eccd0630f74ace2b06689203c19aaa5be30766af", 717, 51),
    ("vine-20", "7a3da0b6857bc3c96ce91c80407676c0c634da29", 697, 59),
    ("vine-19", "f3d54b1b4d0d2b1339671256274d41c02cfd7f49", 655, 57),
    ("vine-18", "12bcd39e15a801a33767dd11be583425f44cccc3", 604, 61),
    ("vine-17", "18c71d91f33588bdbea0e7da409255925283f3f2", 561, 68),
    ("vine-16", "d44e00804b8f66f1cd46e592c2b960cc0dae0732", 501.5753173828125, 66),
    ("vine-special-1", "35e0783efd23ebbf963f120d2431004199af1a9e", 474, 66),
    ("vine-15", "5bc2d7b82a8788a20788aad4be25c9dc71e050da", 476, 61),
    ("vine-14", "967a7286aa7ab65805656ad67b975174b23d80ee", 449.79461669921875, 66.53176879882812),
    ("vine-13", "e1af5a11fe8dc3820ccba6eb58515ffff89b4893", 412.92620849609375, 59.1580810546875),
    ("vine-12", "6817628e0e75be4ce79318a956ac92a65e7ebe27", 406, 50),
    ("vine-11", "ab8736c29a67e64b8aa5912c494821ccd38b602b", 387, 63),
    ("vine-10", "22083893e664090623b232e2bef2210c84bc7462", 335, 64),
    ("vine-09", "603a44cb975ba6ea72a6665e798173ddf90b97e9", 314, 64),
    ("vine-08", "933a50f0d2de340fcd01898bc11ce7b021d6dc59", 313, 62),
    ("vine-07", "ceab9fd95c557deb935d647dc6942fb003d018a8", 291, 64),
    ("vine-06", "e9ed57147d0ac1dc6361f324005f2eceb3fe5efe", 271.995361328125, 74),
    ("vine-05", "6e494d62402a031af1ea468b7e5d5bcf157514d2", 248, 62),
    ("vine-04", "5c650d0e8025e6f08d44e9db0130810bcb0fb24a", 210, 71.34005737304688),
    ("vine-03", "2aa9ae016857f2467483bcaff66f05e03cc52895", 207, 52),
    ("vine-02", "a944f62830f83b73b0e913d78678443a69a5e8b9", 181, 62),
    ("vine-01", "6886df31dd4b68d2c87ecef41d8b5d36997266da", 172.35211181640625, 56.88189697265625),
]


def slug(name: str) -> str:
    return re.sub(r"[^A-Za-z0-9_-]+", "_", name)


def uniquify_ids(svg_inner: str, prefix: str) -> str:
    ids = set(re.findall(r'\bid="([^"]+)"', svg_inner))
    keep = {i for i in ids if re.match(r"^(vine-|!!vine-|pearl-|Ellipse)", i, re.I)}
    rename = ids - keep
    for old in sorted(rename, key=len, reverse=True):
        new = f"{prefix}__{old}"
        svg_inner = svg_inner.replace(f'id="{old}"', f'id="{new}"')
        svg_inner = svg_inner.replace(f"url(#{old})", f"url(#{new})")
    return svg_inner


def extract_inner(svg_text: str) -> str:
    m = re.search(r"<svg\b[^>]*>(.*)</svg>\s*$", svg_text, re.S | re.I)
    if not m:
        raise ValueError("no svg root")
    inner = m.group(1).strip()
    inner = re.sub(r'<rect[^>]*fill="white"[^/]*/>\s*', "", inner)
    return inner


def add_group_transform(inner: str, name: str, tx: float, ty: float) -> str:
    transform = f"translate({tx:.4f} {ty:.4f})"
    # Prefer adding transform onto the existing vine group.
    pattern = rf'<g id="{re.escape(name)}"'
    if re.search(pattern, inner):
        return re.sub(
            pattern,
            f'<g id="{name}" transform="{transform}"',
            inner,
            count=1,
        )
    return f'<g id="{name}" transform="{transform}">\n{inner}\n</g>'


def main() -> None:
    parts = []
    for name, digest, x, y in VINES:
        url = f"http://localhost:3845/assets/{digest}.svg"
        print(f"fetch {name}")
        with urllib.request.urlopen(url) as resp:
            raw = resp.read().decode("utf-8")
        inner = extract_inner(raw)
        inner = uniquify_ids(inner, slug(name))
        inner = add_group_transform(inner, name, x - ORIGIN_X, y - ORIGIN_Y)
        parts.append(inner)

    sheet = (
        f'<svg width="{SHEET_W}" height="{SHEET_H}" viewBox="0 0 {SHEET_W} {SHEET_H}" '
        f'fill="none" xmlns="http://www.w3.org/2000/svg">\n'
        f'<g id="vines">\n'
        + "\n".join(parts)
        + "\n</g>\n</svg>\n"
    )
    OUT.write_text(sheet)
    print(f"wrote {OUT} ({OUT.stat().st_size} bytes, {len(VINES)} vines)")


if __name__ == "__main__":
    main()
