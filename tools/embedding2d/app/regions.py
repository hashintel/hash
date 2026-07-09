"""Region products per alpha level: contours, merge tree, label raster.

THE RULE: build regions from exactly the coordinates the canvas renders.

For fitted-subsample entities that may be their layout coordinates; for
everything else (entities outside the subsample, and every insert between
refits) it is the encoder's output. Whatever the rendering policy, the
density field must be computed over the same geometry, or points sit
outside their own region's contour. `project` produces encoder geometry
without torch (plain numpy forward over the exported safetensors; the
export is self-contained: standardization is folded into the last layer,
so outputs are already layout units).

RESOLUTION BOUND: the encoder's validation RMSE is a literal blur radius
on encoder-rendered geometry. At ~0.22 standardized (~2 layout units at
alpha=1.0) any region structure finer than that scale is washed out of
the density field before the merge tree ever sees it. Two consequences:
  - bandwidth_px below the blur (in pixels) buys nothing; compute the
    blur in pixels as rmse / transform.cell and set bandwidth near it.
  - if finer regions are wanted, the lever is distill quality (wider or
    deeper MLP, more epochs), not contour parameters.

TUNING: persistence_frac is the one knob that matters; read it through
leaf count. Aim for tens-to-hundreds of leaves at the working zoom, then
let the tree provide everything finer or coarser.
"""

from __future__ import annotations

import argparse
import json
import logging
import re
import uuid
from pathlib import Path

import numpy as np
from safetensors import safe_open
from safetensors.numpy import load_file

from app.contours import ContourParams, build
from app.features import StructureFeatureParams, structure_features
from app.sample import METADATA_DT, Sample, SampleParams, row_lookup


def encoder_forward(path: Path, xs: np.ndarray, *, batch: int = 65_536) -> np.ndarray:
    """Numpy forward pass over an exported encoder: iterates w{i}/b{i}
    (ReLU between, linear last), ignoring the scale/center tensors the
    torch exporter also stores. Output is layout units (folding happened
    at export). ~1M rows through (2d+2)->512->512->2 is BLAS-bound
    seconds; no torch dependency in the offline region path."""
    tensors = load_file(path)
    n_layers = 0
    while f"w{n_layers + 1}" in tensors:
        n_layers += 1
    assert n_layers, f"{path} has no w1"

    out = np.empty((len(xs), tensors[f"w{n_layers}"].shape[0]), dtype=np.float32)
    for start in range(0, len(xs), batch):
        h = xs[start : start + batch]
        for i in range(1, n_layers + 1):
            z = h @ tensors[f"w{i}"].T + tensors[f"b{i}"]
            h = np.maximum(z, 0.0) if i < n_layers else z
        out[start : start + len(h)] = h
    return out


def frozen_state(run: Path, sample: Sample) -> tuple[np.ndarray, float]:
    """The fit-time state the feature contract freezes: the hub exclude
    set (hubs.json, canonical `web~entity` ids, mapped back onto sample
    rows) and deg_norm (from the encoder metadata)."""
    hub_ids = json.loads((run / "hubs.json").read_text())
    records = np.array(
        [
            (uuid.UUID(entity).bytes, uuid.UUID(web).bytes)
            for web, entity in (h.split("~") for h in hub_ids)
        ],
        dtype=METADATA_DT,
    )
    rows, found = row_lookup(sample.metadata)(records)
    if len(records) and not found.all():
        # hubs were derived from this sample; misses mean the sample was
        # refreshed after the fit and this state no longer applies to it
        logging.warning(
            f"{(~found).sum()} of {len(records)} hubs not in the sample -- "
            "was the sample refreshed since the fit?"
        )

    with safe_open(run / "encoder-a100.safetensors", framework="np") as f:
        deg_norm = float(f.metadata()["deg_norm"])
    return rows[found], deg_norm


def project(
    *,
    sample: Sample,
    run: Path,
    alphas: tuple[float, ...],
    features: StructureFeatureParams = StructureFeatureParams(),
    exclude: np.ndarray | None = None,
    deg_norm: float | None = None,
) -> dict[float, np.ndarray]:
    """Encoder geometry for the sample at each alpha level. `exclude` and
    `deg_norm` must be the fit-time frozen values (see `frozen_state`) so
    the features match the training contract."""
    xs, _ = structure_features(
        np.asarray(sample.embeddings),
        sample.edges,
        params=features,
        exclude=exclude,
        deg_norm=deg_norm,
    )
    from app.fit import encoder_path  # lazy: fit pulls the full torch stack

    coords: dict[float, np.ndarray] = {}
    for alpha in alphas:
        coords[alpha] = encoder_forward(encoder_path(run, alpha), xs)
    return coords


def build_regions(
    coords: dict[float, np.ndarray],
    out_dir: Path,
    *,
    params: ContourParams = ContourParams(
        grid=2048, bandwidth_px=4.0, persistence_frac=0.05, floor_frac=0.005
    ),
) -> dict[float, dict]:
    """Per alpha: regions-a{tag}.npz (label raster + density + transform),
    regions-a{tag}-tree.json, regions-a{tag}-contours.json. Serving-side
    incremental assignment is app.contours.assign() over the label raster:
    an O(1) lookup per newly projected entity, nothing re-clusters between
    refits. Region identity across alpha levels (and across refits) is
    matched downstream by membership Jaccard between trees."""
    out = {}
    for alpha, xy in sorted(coords.items(), reverse=True):
        tag = f"a{round(alpha * 100):03d}"
        result = build(xy, out_dir, params=params, name=f"regions-{tag}")
        leaves = sum(1 for n in result["nodes"] if not n["children"])
        logging.info(
            f"regions {tag}: {leaves} leaves, {len(result['nodes'])} nodes total"
        )
        out[alpha] = result
    return out


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run", type=Path, default=Path("run"))
    parser.add_argument(
        "--source",
        choices=["encoder", "layout"],
        default="encoder",
        help="encoder: project the sample through each serving encoder "
        "(THE RULE geometry for serving); layout: use the fitted layout "
        "coordinates directly (matches what the current demo renders, "
        "modulo prepare_demo's Procrustes alignment)",
    )
    parser.add_argument("--grid", type=int, default=2048)
    parser.add_argument("--bandwidth-px", type=float, default=4.0)
    parser.add_argument("--persistence", type=float, default=0.05)
    parser.add_argument("--floor", type=float, default=0.005)
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s"
    )
    params = ContourParams(
        grid=args.grid,
        bandwidth_px=args.bandwidth_px,
        persistence_frac=args.persistence,
        floor_frac=args.floor,
    )

    if args.source == "layout":
        from app.fit import Layout  # lazy: fit pulls the full torch stack

        coords = {}
        for path in sorted(args.run.glob("layout-a*.npz")):
            match = re.fullmatch(r"layout-a(\d{3})\.npz", path.name)
            assert match is not None, path
            coords[int(match.group(1)) / 100] = Layout.load(path).xy
    else:
        alphas = tuple(
            sorted(
                (
                    int(m.group(1)) / 100
                    for p in args.run.glob("encoder-a*.safetensors")
                    if (m := re.fullmatch(r"encoder-a(\d{3})\.safetensors", p.name))
                ),
                reverse=True,
            )
        )
        with safe_open(args.run / "encoder-a100.safetensors", framework="np") as f:
            dim = int(f.metadata()["mrl_dim"])

        sample = Sample.load(
            embeddings=args.run / "sample.f32", params=SampleParams(dim=dim), seed=0
        )
        exclude, deg_norm = frozen_state(args.run, sample)
        logging.info(
            f"projecting {len(sample.metadata):,} entities through "
            f"{len(alphas)} encoders (dim={dim}, {len(exclude)} hubs excluded)"
        )
        coords = project(
            sample=sample,
            run=args.run,
            alphas=alphas,
            exclude=exclude,
            deg_norm=deg_norm,
        )

    # Encoder and layout geometry are different maps of the same
    # entities (see THE RULE above); keep their products apart.
    build_regions(coords, args.run / f"regions-{args.source}", params=params)


if __name__ == "__main__":
    main()
