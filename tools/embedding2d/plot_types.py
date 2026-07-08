"""
Render the fitted layout colored by entity type.

Reads run/layout.npz, joins each entity to its (first) direct entity
type via the graph DB, and writes run/layout_types.png: a log-density
map where each pixel blends the colors of the types landing on it.
"""

import struct
import zlib
from pathlib import Path

import numpy as np

import app.fit as f

RUN = Path("run")
RES = 1200
TOP_N = 12

# tab-ish categorical palette; gray is reserved for "other/unknown"
PALETTE = [
    "#1f77b4",
    "#ff7f0e",
    "#2ca02c",
    "#d62728",
    "#9467bd",
    "#8c564b",
    "#e377c2",
    "#bcbd22",
    "#17becf",
    "#aec7e8",
    "#ffbb78",
    "#98df8a",
]
OTHER = "#c8c8c8"

TYPE_QUERY = """
    SELECT tm.web_id, tm.entity_uuid, min(oi.base_url)
    FROM entity_temporal_metadata tm
    JOIN entity_is_of_type it
        ON it.entity_edition_id = tm.entity_edition_id
        AND it.inheritance_depth = 0
    JOIN ontology_ids oi ON oi.ontology_id = it.entity_type_ontology_id
    WHERE tm.transaction_time @> now()
        AND tm.decision_time @> now()
        AND tm.draft_id IS NULL
    GROUP BY tm.web_id, tm.entity_uuid
"""


def hex_rgb(h: str) -> np.ndarray:
    return np.array([int(h[i : i + 2], 16) for i in (1, 3, 5)], dtype=np.float32)


def write_png(path: Path, img: np.ndarray) -> None:
    h, w, _ = img.shape
    raw = b"".join(b"\x00" + img[y].tobytes() for y in range(h))

    def chunk(t: bytes, data: bytes) -> bytes:
        return (
            struct.pack(">I", len(data))
            + t
            + data
            + struct.pack(">I", zlib.crc32(t + data))
        )

    path.write_bytes(
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(raw, 6))
        + chunk(b"IEND", b"")
    )


def main() -> None:
    layout = f.Layout.load(RUN / "layout.npz")

    print("fetching entity types ...")
    with f.connect() as conn, conn.cursor() as cur:
        cur.execute(TYPE_QUERY)
        type_by_id = {
            f"{web_id}~{entity_uuid}".encode(): base_url
            for web_id, entity_uuid, base_url in cur
        }

    types = np.array([type_by_id.get(i, "unknown") for i in layout.ids])
    uniques, counts = np.unique(types, return_counts=True)
    order = np.argsort(-counts)
    top = uniques[order][:TOP_N]

    # class index per point: 0..TOP_N-1 for the top types, TOP_N = other
    class_of = {t: i for i, t in enumerate(top)}
    cls = np.array([class_of.get(t, TOP_N) for t in types], dtype=np.int32)

    colors = np.stack([hex_rgb(h) for h in PALETTE[: len(top)]] + [hex_rgb(OTHER)])

    # per-pixel, per-class counts
    xy = layout.xy
    lo = np.percentile(xy, 0.1, axis=0)
    hi = np.percentile(xy, 99.9, axis=0)
    px = np.clip(((xy - lo) / (hi - lo) * (RES - 1)).astype(np.int32), 0, RES - 1)

    grid = np.zeros((RES, RES, len(colors)), dtype=np.float32)
    np.add.at(grid, (px[:, 1], px[:, 0], cls), 1.0)

    total = grid.sum(axis=-1)
    # color: count-weighted blend of class colors; brightness: log density
    blend = (grid @ colors) / np.maximum(total, 1)[..., None]
    alpha = (np.log1p(total) / np.log1p(total.max()))[..., None] ** 0.7
    img = ((1 - alpha) * 255.0 + alpha * blend).astype(np.uint8)
    img = img[::-1]  # +y up

    out = RUN / "layout_types.png"
    write_png(out, img)
    print(f"wrote {out}\n")

    print(f"{'#':>2}  {'hex':7}  {'count':>8}  type")
    for i, t in enumerate(top):
        n = int(counts[order][i])
        print(f"{i + 1:>2}  {PALETTE[i]:7}  {n:>8,}  {t}")
    rest = int(counts[order][TOP_N:].sum()) if len(uniques) > TOP_N else 0
    print(f"    {OTHER:7}  {rest:>8,}  (other, {max(len(uniques) - TOP_N, 0)} types)")


if __name__ == "__main__":
    main()
