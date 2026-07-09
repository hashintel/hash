"""
Render each alpha level's layout as a type-colored starfield PNG -- the
static equivalent of the demo's far-field view: per-point type colors
(the demo's palette), density-compressed "over" compositing onto the
dark background, type labels at each type's densest spot.

    uv run python render_starfield.py --run run
    -> run/starfield-aXXX.png, one per alpha level

Levels are Procrustes chain-aligned and share one camera extent (same
treatment prepare_demo gives the viewer), so flipping between the PNGs
reads as the slider morph.
"""

import argparse
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy.ndimage import gaussian_filter

from app.sample import connect
from plot_types import TYPE_QUERY, hex_rgb
from prepare_demo import (
    alpha_tag,
    compute_labels,
    entity_ids,
    load_ladder,
    make_palette,
    procrustes_align,
    short_name,
)

BG = np.array([13, 13, 18], dtype=np.float32)


def render(
    xy: np.ndarray,
    colors: np.ndarray,
    extent: tuple[np.ndarray, np.ndarray],
    *,
    res: int,
    blur: float,
) -> np.ndarray:
    lo, hi = extent
    span = np.maximum(hi - lo, 1e-9)
    ix = np.clip(
        ((xy[:, 0] - lo[0]) / span[0] * (res - 1)).astype(np.int64), 0, res - 1
    )
    iy = np.clip(
        ((xy[:, 1] - lo[1]) / span[1] * (res - 1)).astype(np.int64), 0, res - 1
    )

    # per-pixel color sum + hit count -> count-weighted mean color;
    # works for any number of types without a (res, res, n_types) cube
    acc = np.zeros((res, res, 3), dtype=np.float32)
    cnt = np.zeros((res, res), dtype=np.float32)
    np.add.at(acc, (iy, ix), colors)
    np.add.at(cnt, (iy, ix), 1.0)

    # soft ~1px dots like the viewer's far field, instead of hard pixels
    if blur > 0:
        acc = gaussian_filter(acc, sigma=(blur, blur, 0))
        cnt = gaussian_filter(cnt, sigma=blur)

    mean_color = acc / np.maximum(cnt, 1e-9)[..., None]
    # log-compressed density as coverage: converges toward the palette
    # color instead of clipping to white (the demo's over-blending)
    alpha = (np.log1p(cnt) / np.log1p(max(cnt.max(), 1e-9))) ** 0.7

    img = BG * (1 - alpha[..., None]) + mean_color * alpha[..., None]
    return img.clip(0, 255).astype(np.uint8)[::-1]  # +y up


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run", type=Path, default=Path("run"))
    parser.add_argument("--res", type=int, default=2048)
    parser.add_argument("--blur", type=float, default=0.7)
    parser.add_argument("--no-labels", action="store_true")
    args = parser.parse_args()

    layouts = load_ladder(args.run)
    alphas = list(layouts)
    metadata = layouts[alphas[0]].metadata
    ids = entity_ids(metadata)

    print("fetching entity types ...")
    with connect() as conn, conn.cursor() as cur:
        cur.execute(TYPE_QUERY)
        type_by_id = {f"{w}~{u}".encode(): base_url for w, u, base_url in cur}
    types_arr = np.array([type_by_id.get(i, "unknown") for i in ids])

    # class indices sorted by count, exactly like the demo -- so the
    # dominant type lands on the same familiar blue
    uniques, counts = np.unique(types_arr, return_counts=True)
    order = np.argsort(-counts)
    all_types = list(uniques[order])
    class_of = {t: i for i, t in enumerate(all_types)}
    cls = np.array([class_of[t] for t in types_arr], dtype=np.int64)
    palette = np.array([hex_rgb(h) for h in make_palette(len(all_types))])
    type_names = [short_name(t) for t in all_types]
    type_counts = [int(c) for c in counts[order]]

    # same frame treatment as the viewer: chain-align, shared extent
    xys = {a: layouts[a].xy.astype(np.float32) for a in alphas}
    for prev, cur_ in zip(alphas, alphas[1:]):
        xys[cur_] = procrustes_align(xys[prev], xys[cur_])
    lo = np.min([xy.min(axis=0) for xy in xys.values()], axis=0)
    hi = np.max([xy.max(axis=0) for xy in xys.values()], axis=0)
    pad = 0.02 * (hi - lo)
    extent_arr = (lo - pad, hi + pad)

    font = None if args.no_labels else ImageFont.load_default(size=26)
    colors = palette[cls].astype(np.float32)

    for alpha in alphas:
        img = render(xys[alpha], colors, extent_arr, res=args.res, blur=args.blur)
        image = Image.fromarray(img)

        if font is not None:
            extent = [
                [float(v) for v in extent_arr[0]],
                [float(v) for v in extent_arr[1]],
            ]
            labels = compute_labels(xys[alpha], cls, type_names, type_counts, extent)
            draw = ImageDraw.Draw(image)
            span = extent_arr[1] - extent_arr[0]
            for label in labels:
                x, y = label["position"]
                px = (x - extent_arr[0][0]) / span[0] * (args.res - 1)
                py = (args.res - 1) - (y - extent_arr[0][1]) / span[1] * (args.res - 1)
                draw.text(
                    (px, py),
                    label["text"],
                    font=font,
                    fill=(235, 235, 245),
                    stroke_width=3,
                    stroke_fill=(13, 13, 18),
                    anchor="mm",
                )

        out = args.run / f"starfield-{alpha_tag(alpha)}.png"
        image.save(out)
        print(f"wrote {out}")


if __name__ == "__main__":
    main()
