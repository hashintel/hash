"""
Fit an alpha ladder of 2D maps over HASH's entity embeddings.

Pipeline: sample embeddings + relations from the graph DB -> semantic
fuzzy set S (kNN over embeddings) and relation graph R -> for each
alpha, embed F(alpha) = alpha*S + (1-alpha)*R with UMAP's optimizer,
warm-chaining down the ladder -> distill each layout into a small MLP
encoder over structure features (embedding + neighbor mean + coherence
+ degree) that can place unseen entities on the same maps.

All artifacts live in --out-dir and double as warm-start inputs for the
next refit: the alpha=1.0 layout keeps successive maps visually stable,
the alpha=1.0 encoder is fine-tuned instead of retrained, and the
sample is reused until --refresh-sample drops it.
"""

import argparse
import logging
from pathlib import Path

import numpy as np

from app.fit import EncoderParams, LadderParams, fit
from app.layout import RelationSetParams, SemanticSetParams
from app.sample import Sample, SampleParams


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out-dir", type=Path, default=Path("run"))
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--dim", type=int, default=512)
    parser.add_argument("--sample-size", type=int, default=1_500_000)
    parser.add_argument("--k", type=int, default=15)
    parser.add_argument("--min-dist", type=float, default=0.1)
    parser.add_argument(
        "--alphas",
        type=float,
        nargs="+",
        default=list(LadderParams.alphas),
        help="ladder levels; fitted in descending order",
    )
    parser.add_argument(
        "--n-epochs-first", type=int, default=LadderParams.n_epochs_first
    )
    parser.add_argument(
        "--n-epochs-chained", type=int, default=LadderParams.n_epochs_chained
    )
    parser.add_argument(
        "--mlp-epochs-first", type=int, default=EncoderParams.epochs_first
    )
    parser.add_argument(
        "--mlp-epochs-chained", type=int, default=EncoderParams.epochs_chained
    )
    parser.add_argument(
        "--refresh-sample",
        action="store_true",
        help="drop the cached sample (and its edges) and re-sample the database",
    )
    parser.add_argument(
        "--cold",
        action="store_true",
        help="ignore the previous layouts/encoders even if present",
    )
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s"
    )

    args.out_dir.mkdir(parents=True, exist_ok=True)
    sample_path = args.out_dir / "sample.f32"

    if args.refresh_sample:
        for suffix in (".f32", ".metadata.npy", ".edges.npy"):
            sample_path.with_suffix(suffix).unlink(missing_ok=True)

    rng = np.random.default_rng(args.seed)
    sample = Sample.load(
        embeddings=sample_path,
        params=SampleParams(dim=args.dim, size=args.sample_size),
        seed=args.seed,
    )

    rmses = fit(
        sample=sample,
        out_dir=args.out_dir,
        rng=rng,
        semantic=SemanticSetParams(k=args.k),
        relation=RelationSetParams(),
        ladder=LadderParams(
            alphas=tuple(args.alphas),
            min_dist=args.min_dist,
            n_epochs_first=args.n_epochs_first,
            n_epochs_chained=args.n_epochs_chained,
        ),
        encoder=EncoderParams(
            epochs_first=args.mlp_epochs_first,
            epochs_chained=args.mlp_epochs_chained,
        ),
        cold=args.cold,
    )

    for alpha in sorted(rmses, reverse=True):
        logging.info(f"alpha={alpha:.2f}: encoder val RMSE {rmses[alpha]:.4f}")


if __name__ == "__main__":
    main()
