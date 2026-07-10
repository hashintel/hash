"""
Quantify whether densMAP improves the layout, as a controlled A/B.

Reuses a cached sample from a previous `main.py --out-dir <run>` (never
touches the database), fits plain UMAP and densMAP on the *same* fused
graph per alpha, and prints a metric table plus writes JSON. See
`app.evaluation` for what each metric means and why.

    uv run python evaluate.py --run run --alphas 1.0 0.5 --subsample 20000

For a fast smoke test, shrink everything:

    uv run python evaluate.py --run run --alphas 1.0 --subsample 3000 --n-epochs 60
"""

import argparse
import json
import logging
from pathlib import Path

from app.evaluation import (
    EvalParams,
    evaluate,
    format_table,
    results_to_dict,
)
from app.sample import Sample, SampleParams


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--run",
        type=Path,
        default=Path("run"),
        help="directory holding sample.f32 (+ .metadata.npy / .edges.npy)",
    )
    parser.add_argument("--dim", type=int, default=512, help="must match the sample")
    parser.add_argument("--alphas", type=float, nargs="+", default=[1.0, 0.5])
    parser.add_argument("--subsample", type=int, default=20_000)
    parser.add_argument("--k", type=int, default=15, help="layout semantic kNN")
    parser.add_argument("--metric-k", type=int, default=15, help="scoring kNN")
    parser.add_argument("--min-dist", type=float, default=0.1)
    parser.add_argument("--n-epochs", type=int, default=200)
    parser.add_argument("--trust-queries", type=int, default=1500)
    parser.add_argument("--shepard-pairs", type=int, default=100_000)
    parser.add_argument("--edge-samples", type=int, default=50_000)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument(
        "--distil",
        action="store_true",
        help="also distil each layout into the serving MLP and report val RMSE",
    )
    parser.add_argument("--distil-epochs", type=int, default=15)
    parser.add_argument(
        "--no-plot",
        action="store_true",
        help="skip the source-vs-2D radius scatter PNGs",
    )
    parser.add_argument(
        "--out",
        type=Path,
        default=None,
        help="JSON output path (default: <run>/densmap-eval.json)",
    )
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s"
    )

    sample_path = args.run / "sample.f32"
    metadata_path = sample_path.with_suffix(".metadata.npy")
    if not (sample_path.exists() and metadata_path.exists()):
        raise SystemExit(
            f"no cached sample at {sample_path} (+ .metadata.npy). Run "
            f"`main.py --out-dir {args.run}` first; this tool never hits the DB."
        )

    sample = Sample.load(
        embeddings=sample_path,
        params=SampleParams(dim=args.dim, size=args.subsample),
        seed=args.seed,
    )

    params = EvalParams(
        alphas=tuple(args.alphas),
        subsample=args.subsample,
        k=args.k,
        metric_k=args.metric_k,
        min_dist=args.min_dist,
        n_epochs=args.n_epochs,
        trust_queries=args.trust_queries,
        shepard_pairs=args.shepard_pairs,
        edge_samples=args.edge_samples,
        seed=args.seed,
        distil=args.distil,
        distil_epochs=args.distil_epochs,
    )

    results = evaluate(
        sample=sample,
        params=params,
        plot_dir=None if args.no_plot else args.run,
    )

    print()
    for result in results:
        print(format_table(result))
        print()

    out = args.out or (args.run / "densmap-eval.json")
    out.write_text(json.dumps(results_to_dict(results, params), indent=2) + "\n")
    logging.info(f"wrote {out}")


if __name__ == "__main__":
    main()
