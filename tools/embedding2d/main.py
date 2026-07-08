"""
Fit a 2D map of HASH's entity embeddings.

Pipeline: sample embeddings from the graph DB -> approximate kNN graph
(hnswlib) -> UMAP layout -> distill the (embedding -> xy) mapping into a
small MLP encoder (safetensors) that can place unseen entities on the
same map without re-running UMAP.

All artifacts live in --out-dir and double as warm-start inputs for the
next run: the layout keeps successive maps visually stable, the encoder
is fine-tuned instead of retrained, and the sample is reused until
--refresh-sample drops it.
"""

import argparse
import json
import logging
from pathlib import Path

import numpy as np

from app.fit import (
    SAMPLE_SIZE,
    TRUNCATED_DIM,
    KnnParams,
    MlpParams,
    SampleParams,
    UmapParams,
    fit,
    ids_path_for,
    init,
    load_sample,
)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out-dir", type=Path, default=Path("run"))
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--dim", type=int, default=TRUNCATED_DIM)
    parser.add_argument("--sample-size", type=int, default=SAMPLE_SIZE)
    parser.add_argument("--k", type=int, default=15)
    parser.add_argument("--n-neighbors", type=int, default=15)
    parser.add_argument("--min-dist", type=float, default=0.1)
    parser.add_argument("--n-epochs", type=int, default=None)
    parser.add_argument(
        "--init",
        choices=["pca", "spectral", "tswspectral", "random"],
        default="pca",
        help="cold-start init; ignored when a previous layout exists",
    )
    parser.add_argument("--mlp-epochs", type=int, default=30)
    parser.add_argument(
        "--refresh-sample",
        action="store_true",
        help="drop the cached sample and re-sample from the database",
    )
    parser.add_argument(
        "--cold",
        action="store_true",
        help="ignore the previous layout/encoder even if present",
    )
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s"
    )

    args.out_dir.mkdir(parents=True, exist_ok=True)
    sample_path = args.out_dir / "sample.f32"
    layout_path = args.out_dir / "layout.npz"
    encoder_path = args.out_dir / "encoder.safetensors"

    if args.refresh_sample:
        sample_path.unlink(missing_ok=True)
        ids_path_for(sample_path).unlink(missing_ok=True)

    rng = np.random.default_rng(args.seed)
    sample_params = SampleParams(dim=args.dim, size=args.sample_size)

    layout = init(
        rng=rng,
        sample=sample_params,
        knn=KnnParams(k=args.k),
        umap=UmapParams(
            n_neighbors=args.n_neighbors,
            min_dist=args.min_dist,
            n_epochs=args.n_epochs,
            init=args.init,
        ),
        sample_path=sample_path,
        previous=None if args.cold else layout_path,
        out=layout_path,
    )

    # init cached the sample on disk; this reload is a pure cache hit,
    # and its ids are guaranteed to align with the layout's.
    sample = load_sample(sample_path, params=sample_params, seed=args.seed)

    fit(
        params=sample_params,
        seed=int(rng.integers(2**32)),
        layout=layout,
        sample=sample,
        mlp=MlpParams(epochs=args.mlp_epochs),
        previous=None if args.cold else encoder_path,
        out=encoder_path,
        meta={
            "umap": json.dumps(
                {"n_neighbors": args.n_neighbors, "min_dist": args.min_dist}
            ),
        },
    )


if __name__ == "__main__":
    main()
