"""``audit`` console entry point (see pyproject [project.scripts])."""

from __future__ import annotations

from pathlib import Path

import click
import numpy as np

from atlas_tools.audit.runner import run_audit
from atlas_tools.audit.synth import make_synthetic
from atlas_tools.common.matrix import write_matrix


def _parse_int_list(value: str, name: str) -> list[int]:
    try:
        items = [int(part) for part in value.split(",") if part.strip()]
    except ValueError as exc:
        raise click.BadParameter(
            f"{name} must be a comma-separated list of integers, got {value!r}"
        ) from exc
    if not items:
        raise click.BadParameter(f"{name} must not be empty")
    return items


@click.group()
def main() -> None:
    """Prefix representation audit (W1)."""


@main.command("run")
@click.option(
    "--embeddings",
    required=True,
    type=click.Path(exists=True, dir_okay=False, path_type=Path),
    help="Raw f32 matrix (with <name>.meta.json sidecar).",
)
@click.option("--dims", default="128,256,512,1024", show_default=True)
@click.option("--k", "ks", default="15,30,50", show_default=True)
@click.option("--sample", default=20000, show_default=True, type=int)
@click.option(
    "--strata",
    default=None,
    type=click.Path(exists=True, dir_okay=False, path_type=Path),
    help="Optional parquet: int64 'row' column plus string group columns.",
)
@click.option(
    "--out",
    required=True,
    type=click.Path(file_okay=False, path_type=Path),
)
@click.option("--seed", default=0, show_default=True, type=int)
@click.option("--memory-cap-gb", default=8.0, show_default=True, type=float)
@click.option("--min-group-size", default=50, show_default=True, type=int)
def run(
    embeddings: Path,
    dims: str,
    ks: str,
    sample: int,
    strata: Path | None,
    out: Path,
    seed: int,
    memory_cap_gb: float,
    min_group_size: int,
) -> None:
    """Audit prefix neighbor fidelity against full-vector ground truth."""
    dim_list = _parse_int_list(dims, "--dims")
    k_list = _parse_int_list(ks, "--k")
    try:
        run_audit(
            embeddings,
            out,
            dims=dim_list,
            ks=k_list,
            sample=sample,
            strata_path=strata,
            seed=seed,
            memory_cap_bytes=int(memory_cap_gb * (1 << 30)),
            min_group_size=min_group_size,
        )
    except ValueError as exc:
        raise click.ClickException(str(exc)) from exc
    click.echo(f"wrote {out / 'report.json'}")
    click.echo(f"wrote {out / 'report.md'}")
    click.echo(f"wrote {out / 'report.meta.json'}")


@main.command("synth-fixture")
@click.option(
    "--out",
    required=True,
    type=click.Path(dir_okay=False, path_type=Path),
    help="Output raw f32 matrix path (sidecar written next to it).",
)
@click.option("--rows", default=3000, show_default=True, type=int)
@click.option("--dim", default=512, show_default=True, type=int)
@click.option("--clusters", default=10, show_default=True, type=int)
@click.option("--signal-start", default=400, show_default=True, type=int)
@click.option(
    "--signal-end",
    default=None,
    type=int,
    help="End of the signal band (exclusive). Defaults to --dim.",
)
@click.option("--signal-scale", default=1.0, show_default=True, type=float)
@click.option("--noise-scale", default=0.1, show_default=True, type=float)
@click.option("--seed", default=0, show_default=True, type=int)
@click.option(
    "--labels-out",
    default=None,
    type=click.Path(dir_okay=False, path_type=Path),
    help="Optional strata parquet with per-row cluster labels.",
)
def synth_fixture(
    out: Path,
    rows: int,
    dim: int,
    clusters: int,
    signal_start: int,
    signal_end: int | None,
    signal_scale: float,
    noise_scale: float,
    seed: int,
    labels_out: Path | None,
) -> None:
    """Write a synthetic fixture whose signal lives in a dim band."""
    band = (signal_start, dim if signal_end is None else signal_end)
    try:
        vectors, labels = make_synthetic(
            rows,
            dim,
            n_clusters=clusters,
            signal_band=band,
            signal_scale=signal_scale,
            noise_scale=noise_scale,
            seed=seed,
        )
    except ValueError as exc:
        raise click.ClickException(str(exc)) from exc
    write_matrix(
        out,
        vectors,
        producer="atlas-tools audit synth-fixture",
        extra_metadata={
            "synthetic": {
                "n_clusters": clusters,
                "signal_band": list(band),
                "signal_scale": signal_scale,
                "noise_scale": noise_scale,
                "seed": seed,
            }
        },
    )
    click.echo(f"wrote {out}")
    if labels_out is not None:
        import pyarrow as pa
        import pyarrow.parquet as pq

        table = pa.table(
            {
                "row": pa.array(np.arange(rows, dtype=np.int64), type=pa.int64()),
                "cluster": pa.array([f"c{int(label)}" for label in labels]),
            }
        )
        labels_out.parent.mkdir(parents=True, exist_ok=True)
        pq.write_table(table, labels_out)
        click.echo(f"wrote {labels_out}")
