"""``battery`` console entrypoint (click group ``main``).

Commands:

- ``battery run --suite suites/phase2.yaml --engines engines/default.yaml
  --out runs/<ts>/`` — full harness (see battery.harness). Always exits 0
  when the harness itself completes; per-engine pass/fail lives in
  ``gates.json`` (adversarial engines failing is an expected outcome, not
  an error).
- ``battery calibrate --layout <layout.npz> --manifest <yaml>`` — merge-tree
  calibration check; exits 1 when out of tolerance.
- ``battery generate --shape ... --n ... --seed ... --out ...`` — write one
  dataset artifact directory.
"""

from __future__ import annotations

import json
import sys

import click

from atlas_tools.battery import generators as gen_mod
from atlas_tools.battery.calibrate import run_calibration
from atlas_tools.battery.datasets import write_dataset
from atlas_tools.battery.harness import run_suite


@click.group()
def main() -> None:
    """Layout gate battery: accept/reject layout engines from layout.npz."""


@main.command("run")
@click.option(
    "--suite",
    "suite_path",
    required=True,
    type=click.Path(exists=True, dir_okay=False),
)
@click.option(
    "--engines",
    "engines_path",
    required=True,
    type=click.Path(exists=True, dir_okay=False),
)
@click.option("--out", "out_dir", required=True, type=click.Path(file_okay=False))
@click.option("--jobs", type=int, default=None, help="Parallel engine runs.")
def run_cmd(suite_path: str, engines_path: str, out_dir: str, jobs: int | None) -> None:
    """Run generators x engines x seeds; write results, report, gates."""
    result = run_suite(suite_path, engines_path, out_dir, jobs=jobs)
    click.echo(f"results: {result['results_path']}")
    click.echo(f"report:  {result['report_path']}")
    click.echo(f"gates:   {result['gates_path']}")
    for name, engine_result in result["gates"]["engines"].items():
        status = "PASS" if engine_result["pass"] else "FAIL"
        click.echo(f"  {name}: {status}")


@main.command("calibrate")
@click.option("--layout", "layout_path", required=True, type=click.Path(exists=True))
@click.option(
    "--manifest", "manifest_path", required=True, type=click.Path(exists=True)
)
def calibrate_cmd(layout_path: str, manifest_path: str) -> None:
    """Check merge-tree leaves + persistence against reference values."""
    result = run_calibration(layout_path, manifest_path)
    click.echo(json.dumps(result, indent=2, sort_keys=True))
    if not result["pass"]:
        sys.exit(1)


@main.command("generate")
@click.option(
    "--shape",
    required=True,
    type=click.Choice(sorted(gen_mod.REGISTRY)),
)
@click.option("--n", type=int, default=None)
@click.option("--dim", type=int, default=None)
@click.option("--seed", type=int, default=0)
@click.option(
    "--params",
    "params_json",
    default=None,
    help="JSON dict of extra generator params.",
)
@click.option("--out", "out_dir", required=True, type=click.Path(file_okay=False))
def generate_cmd(
    shape: str,
    n: int | None,
    dim: int | None,
    seed: int,
    params_json: str | None,
    out_dir: str,
) -> None:
    """Generate one planted-shape dataset artifact directory."""
    config = dict(json.loads(params_json)) if params_json else {}
    if n is not None:
        config["n"] = n
    if dim is not None:
        config["dim"] = dim
    dataset = gen_mod.generate(shape, config, seed)
    hashes = write_dataset(dataset, out_dir)
    click.echo(
        f"wrote {dataset.shape}: n={dataset.n}"
        f" dim={dataset.embeddings.shape[1]} edges={len(dataset.edges)}"
    )
    click.echo(f"embeddings sha256: {hashes['embeddings_sha256']}")


if __name__ == "__main__":
    main()
