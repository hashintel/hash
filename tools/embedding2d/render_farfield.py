"""
Render the far-field first paint (app.farfield output) to PNG.

Draws ONLY what the payload contains -- the glow texture plus the
simplified vector rings -- so the image is a faithful preview of what a
viewer shows before a single point has streamed in. This is the antidote
to regions-aXXX.png: flat fills instead of density-modulated gradients,
tens of persistent shapes instead of a thousand leaves, and the KDE blur
demoted to a faint underlayer instead of being the figure.

Layers, back to front: glow (the small density texture, upscaled -- blur
is fine in a glow), flat translucent fills in painter's order (the JSON's
array order; envelope regions outline-only so the continents read as
coastlines under their children), 1px supersampled strokes, entity-count
labels for the top --labels cut regions by persistence.

    uv run python render_farfield.py --run run --source layout
    -> run/regions-layout/farfield-aXXX.png, one per alpha level
"""

import argparse
import json
import re
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

from plot_types import hex_rgb
from prepare_demo import make_palette

BG = np.array([13, 13, 18], dtype=np.float32)  # demo background
INK = np.array([235, 235, 245], dtype=np.float32)
GLOW = 0.35  # glow layer strength: visible context, never the figure
FILL = 0.5  # region fill opacity over the glow


def fmt_count(n: int) -> str:
    if n >= 1_000_000:
        return f"{n / 1_000_000:.1f}M"
    if n >= 1_000:
        return f"{n / 1_000:.0f}k"
    return str(n)


def signed_area(ring: np.ndarray) -> float:
    x, y = ring[:, 0], ring[:, 1]
    return 0.5 * float(np.sum(x * np.roll(y, -1) - np.roll(x, -1) * y))


def render_farfield_png(
    regions_dir: Path, tag: str, *, res: int, supersample: int, n_labels: int
) -> Path:
    payload = json.loads((regions_dir / f"farfield-{tag}.json").read_text())
    (ex0, ey0), (ex1, ey1) = payload["extent"]
    regions = [r for r in payload["regions"] if r["rings"]]
    s = res * supersample

    def to_px(ring: np.ndarray) -> list[tuple[float, float]]:
        px = (ring[:, 0] - ex0) / (ex1 - ex0) * (s - 1)
        py = (s - 1) - (ring[:, 1] - ey0) / (ey1 - ey0) * (s - 1)  # +y up
        return list(zip(px.tolist(), py.tolist()))

    glow_tex = Image.open(regions_dir / f"farfield-{tag}-density.png")
    glow = (
        np.asarray(glow_tex.resize((s, s), Image.BILINEAR), dtype=np.float32)[..., None]
        / 255.0
    )
    img = BG + (INK - BG) * glow * GLOW

    palette = np.array([hex_rgb(h) for h in make_palette(max(len(regions), 1))])

    # fills: per region, an even-odd mask (outer ring = largest |area|,
    # the rest are holes) composited over whatever is already there --
    # painter's order handles nesting, holes keep the glow visible.
    # Envelopes get a whisper of fill: their coastline stroke is the
    # figure, the children drawn on top carry the color.
    for i, region in enumerate(regions):
        rings = [np.asarray(ring, dtype=np.float32) for ring in region["rings"]]
        outer = int(np.argmax([abs(signed_area(ring)) for ring in rings]))
        mask_img = Image.new("L", (s, s), 0)
        draw = ImageDraw.Draw(mask_img)
        draw.polygon(to_px(rings[outer]), fill=255)
        for j, ring in enumerate(rings):
            if j != outer:
                draw.polygon(to_px(ring), fill=0)
        mask = np.asarray(mask_img, dtype=bool)
        fill = FILL * (0.25 if region.get("envelope") else 1.0)
        img[mask] = img[mask] * (1 - fill) + palette[i] * fill

    # strokes on top: the crisp part of the picture
    canvas = Image.fromarray(img.clip(0, 255).astype(np.uint8))
    draw = ImageDraw.Draw(canvas)
    for i, region in enumerate(regions):
        stroke = tuple(int(v) for v in palette[i] * 0.35 + INK * 0.65)
        for ring in region["rings"]:
            pts = to_px(np.asarray(ring, dtype=np.float32))
            draw.line(pts, fill=stroke, width=supersample)

    canvas = canvas.resize((res, res), Image.LANCZOS)

    # labels at final resolution (crisper than supersampled text):
    # top-persistence cut regions, entity counts as stand-in names.
    # Envelopes are skipped: their anchor is the densest pixel of the
    # territory, which is exactly their densest child's anchor.
    if n_labels:
        draw = ImageDraw.Draw(canvas)
        font = ImageFont.load_default(size=18)
        cut = [r for r in regions if not r.get("envelope")]
        top = sorted(cut, key=lambda r: r["persistence"], reverse=True)
        for region in top[:n_labels]:
            x, y = region["anchor"]
            px = (x - ex0) / (ex1 - ex0) * (res - 1)
            py = (res - 1) - (y - ey0) / (ey1 - ey0) * (res - 1)
            draw.text(
                (px, py),
                fmt_count(region["n_entities"]),
                font=font,
                fill=(235, 235, 245),
                stroke_width=2,
                stroke_fill=(13, 13, 18),
                anchor="mm",
            )

    out = regions_dir / f"farfield-{tag}.png"
    canvas.save(out)
    return out


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run", type=Path, default=Path("run"))
    parser.add_argument("--source", choices=["encoder", "layout"], default="layout")
    parser.add_argument("--res", type=int, default=2048)
    parser.add_argument("--supersample", type=int, default=2)
    parser.add_argument("--labels", type=int, default=24)
    args = parser.parse_args()

    regions_dir = args.run / f"regions-{args.source}"
    tags = sorted(
        m.group(1)
        for p in regions_dir.glob("farfield-a*.json")
        if (m := re.fullmatch(r"farfield-(a\d{3})\.json", p.name))
    )
    if not tags:
        raise SystemExit(f"no farfield-aXXX.json in {regions_dir}/ -- run app.farfield")

    for tag in tags:
        print(
            f"wrote {render_farfield_png(regions_dir, tag, res=args.res, supersample=args.supersample, n_labels=args.labels)}"
        )


if __name__ == "__main__":
    main()
