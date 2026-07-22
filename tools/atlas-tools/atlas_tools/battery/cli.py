"""``battery`` console entrypoint (Pydantic CLI model ``BatteryCli``).

Commands:

- ``battery run --suite suites/phase2.yaml --engines engines/default.yaml --out runs/<ts>/``
  runs the full harness (see :mod:`atlas_tools.battery.harness`) with the default full suite.
  It always exits 0 when the harness itself completes; per-engine pass/fail lives in
  ``gates.json``, so an adversarial engine failing its gates is an expected outcome, not an
  error.
- ``battery calibrate --layout <layout.npz> --manifest <yaml>`` checks merge-tree calibration
  and exits 1 when out of tolerance.
- ``battery generate --shape ... --n ... --seed ... --out ...`` writes one dataset artifact
  directory.
"""

from pathlib import Path

from pydantic import BaseModel, Field, FilePath, NonNegativeInt, PositiveInt
from pydantic_settings import BaseSettings, CliApp, CliSubCommand

from atlas_tools.battery.calibrate import run_calibration
from atlas_tools.battery.datasets import write_dataset
from atlas_tools.battery.generators import generator_adapter
from atlas_tools.battery.harness import run_suite
from atlas_tools.common import JsonDict
from atlas_tools.common.cli import echo, run_cli


class RunCommand(BaseModel):
    """Run generators x engines x seeds; write results, report, gates."""

    suite: FilePath
    engines: FilePath
    out: Path
    jobs: PositiveInt | None = Field(default=None, description="Parallel engine runs.")

    def cli_cmd(self) -> None:
        result = run_suite(self.suite, self.engines, self.out, jobs=self.jobs)
        echo(f"results: {result.results_path}")
        echo(f"report:  {result.report_path}")
        echo(f"gates:   {result.gates_path}")
        for name, engine_report in result.gates.engines.items():
            status = "PASS" if engine_report.passed else "FAIL"
            echo(f"  {name}: {status}")


class CalibrateCommand(BaseModel):
    """Check merge-tree leaves + persistence against reference values."""

    layout: FilePath
    manifest: FilePath

    def cli_cmd(self) -> None:
        report = run_calibration(self.layout, self.manifest)
        echo(report.model_dump_json(indent=2))
        if not report.passed:
            raise SystemExit(1)


class GenerateCommand(BaseModel):
    """Generate one planted-shape dataset artifact directory."""

    shape: str
    n: PositiveInt | None = None
    dim: PositiveInt | None = None
    seed: NonNegativeInt = 0
    params: JsonDict = Field(
        default_factory=dict,
        description="JSON dict of extra generator params.",
    )
    out: Path

    def cli_cmd(self) -> None:
        params = dict(self.params)
        if self.dim is not None:
            params["dim"] = self.dim
        specification: dict[str, object] = {"shape": self.shape, "params": params}
        if self.n is not None:
            specification["n"] = self.n
        generator = generator_adapter.validate_python(specification)
        dataset = generator.run(self.seed)
        hashes = write_dataset(dataset, self.out)
        echo(
            f"wrote {dataset.shape}: n={dataset.n}"
            f" dim={dataset.embeddings.shape[1]} edges={len(dataset.edges)}"
        )
        echo(f"embeddings sha256: {hashes.embeddings_sha256}")


class BatteryCli(BaseSettings):
    """Layout gate battery: accept/reject layout engines from layout.npz."""

    calibrate: CliSubCommand[CalibrateCommand]
    generate: CliSubCommand[GenerateCommand]
    run: CliSubCommand[RunCommand]

    def cli_cmd(self) -> None:
        CliApp.run_subcommand(self)


def main(args: list[str] | None = None) -> None:
    """Run the layout-battery command-line application."""
    run_cli(BatteryCli, args, option_aliases={"-n": "--n"}, program_name="battery")


if __name__ == "__main__":
    main()
