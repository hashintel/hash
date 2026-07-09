"""
Render region products (app.regions output) to PNG.

Two color modes:
  --color region  one palette color per merge-tree region, borders drawn
                  from the label raster (pixels whose neighbor belongs
                  to a different region) -- the region-debugging view.
  --color type    each region colored by the dominant entity type of its
                  members, density as glow, and type-colored speckle for
                  points outside any region: the demo's starfield,
                  reconstructed from the contour machinery. Layout
                  source only (the encoder raster has no point
                  coordinates to attribute types with).

Borders come from the label raster, NOT from contours.json: that file
holds rings for every surviving merge level -- meant for a viewer that
shows levels selectively -- and flattening all of them into one image
just paints dense areas solid ink.

    uv run python render_regions.py --run run --source layout --color type
    -> run/regions-layout/regions-aXXX-type.png, one per alpha level
"""

import argparse
import re
import uuid
from pathlib import Path

import numpy as np

from app.contours import assign, load_for_assignment
from app.sample import connect
from plot_types import TYPE_QUERY, hex_rgb, write_png
from prepare_demo import make_palette

BG = np.array([13, 13, 18], dtype=np.float32)  # demo background
INK = np.array([235, 235, 245], dtype=np.float32)  # region borders


def toned_density(density: np.ndarray) -> np.ndarray:
    """Log-toned density in [0, 1]: the compressive mapping every other
    render in this tool uses."""
    return (np.log1p(density) / np.log1p(max(density.max(), 1e-9))) ** 0.7


def fetch_type_classes(metadata: np.ndarray) -> tuple[np.ndarray, list[str]]:
    """Per-row type class indices, ordered by type frequency (class 0 =
    most common type), matching the demo's palette assignment."""
    ids = np.array(
        [
            f"{uuid.UUID(bytes=r['web_id'].tobytes())}"
            f"~{uuid.UUID(bytes=r['entity_uuid'].tobytes())}".encode()
            for r in metadata
        ]
    )
    with connect() as conn, conn.cursor() as cur:
        cur.execute(TYPE_QUERY)
        type_by_id = {
            f"{web_id}~{entity_uuid}".encode(): base_url
            for web_id, entity_uuid, base_url in cur
        }

    types = np.array([type_by_id.get(i, "unknown") for i in ids])
    uniques, counts = np.unique(types, return_counts=True)
    order = np.argsort(-counts)
    class_of = {t: i for i, t in enumerate(uniques[order])}
    cls = np.array([class_of[t] for t in types], dtype=np.int32)
    return cls, list(uniques[order])


def render_regions_png(regions_dir: Path, tag: str) -> Path:
    with np.load(regions_dir / f"regions-{tag}.npz") as data:
        label, density = data["label"], data["density"]

    toned = toned_density(density)
    bright = 0.35 + 0.65 * toned  # floor keeps thin regions readable

    ids = np.unique(label[label >= 0])
    lut = np.zeros(int(label.max()) + 1 if len(ids) else 1, dtype=np.int64)
    lut[ids] = np.arange(len(ids))
    palette = np.array([hex_rgb(h) for h in make_palette(max(len(ids), 1))])

    grid = label.shape[0]
    img = np.tile(BG, (grid, grid, 1))
    labeled = label >= 0
    img[labeled] += (palette[lut[label[labeled]]] - BG) * bright[labeled][:, None]
    # below-floor pixels still show density as faint gray, so the map
    # doesn't look amputated at the region floor
    img[~labeled] += (INK - BG) * 0.25 * toned[~labeled][:, None]

    # borders: a labeled pixel whose right/down neighbor carries a
    # different label (comparing shifted rasters marks each border once)
    border = np.zeros_like(labeled)
    border[:-1, :] |= label[:-1, :] != label[1:, :]
    border[:, :-1] |= label[:, :-1] != label[:, 1:]
    border &= labeled
    img[border] = img[border] * 0.35 + INK * 0.65

    out = regions_dir / f"regions-{tag}.png"
    write_png(out, img.clip(0, 255).astype(np.uint8)[::-1])  # +y up
    return out


def render_starfield_png(
    regions_dir: Path,
    tag: str,
    xy: np.ndarray,
    cls: np.ndarray,
    palette: np.ndarray,
) -> Path:
    label, transform = load_for_assignment(regions_dir / f"regions-{tag}.npz")
    with np.load(regions_dir / f"regions-{tag}.npz") as data:
        density = data["density"]

    # dominant member type per region, via the same O(1) raster
    # assignment serving uses
    pt_labels = assign(xy, label, transform)
    ok = pt_labels >= 0
    counts = np.zeros((int(label.max()) + 1, len(palette)), dtype=np.int64)
    np.add.at(counts, (pt_labels[ok], cls[ok]), 1)
    dominant = counts.argmax(axis=1)

    toned = toned_density(density)
    grid = label.shape[0]
    img = np.tile(BG, (grid, grid, 1))

    # regions: dominant-type color, density as glow
    labeled = label >= 0
    color = palette[dominant[label[labeled]]]
    img[labeled] += (color - BG) * (0.2 + 0.8 * toned[labeled])[:, None]

    # the far field: points outside every region drawn as type-colored
    # speckle -- the demo's outer starfield, one pixel per entity
    ix, iy = transform.to_pixel(xy[~ok])
    inb = (ix >= 0) & (ix < grid) & (iy >= 0) & (iy < grid)
    img[iy[inb], ix[inb]] = BG + (palette[cls[~ok][inb]] - BG) * 0.6

    out = regions_dir / f"regions-{tag}-type.png"
    write_png(out, img.clip(0, 255).astype(np.uint8)[::-1])  # +y up
    return out


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run", type=Path, default=Path("run"))
    parser.add_argument("--source", choices=["encoder", "layout"], default="layout")
    parser.add_argument("--color", choices=["region", "type"], default="region")
    args = parser.parse_args()

    regions_dir = args.run / f"regions-{args.source}"
    tags = sorted(
        m.group(1)
        for p in regions_dir.glob("regions-a*.npz")
        if (m := re.fullmatch(r"regions-(a\d{3})\.npz", p.name))
    )
    if not tags:
        raise SystemExit(f"no regions-aXXX.npz in {regions_dir}/ -- run app.regions")

    if args.color == "region":
        for tag in tags:
            print(f"wrote {render_regions_png(regions_dir, tag)}")
        return

    if args.source != "layout":
        raise SystemExit("--color type needs --source layout (see module docstring)")

    from app.fit import Layout  # lazy: fit pulls the full torch stack

    layouts = {tag: Layout.load(args.run / f"layout-{tag}.npz") for tag in tags}
    first = next(iter(layouts.values()))
    print(f"fetching entity types for {len(first.metadata):,} entities ...")
    cls, type_names = fetch_type_classes(first.metadata)
    palette = np.array([hex_rgb(h) for h in make_palette(len(type_names))])

    for tag in tags:
        print(
            f"wrote {render_starfield_png(regions_dir, tag, layouts[tag].xy, cls, palette)}"
        )


if __name__ == "__main__":
    main()
