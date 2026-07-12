"""``audit`` console entry point (see pyproject [project.scripts])."""

from pathlib import Path
from typing import Literal

from pydantic import (
    BaseModel,
    Field,
    FilePath,
    NonNegativeFloat,
    NonNegativeInt,
    PositiveFloat,
    PositiveInt,
    SecretStr,
)
from pydantic_settings import (
    BaseSettings,
    CliApp,
    CliSubCommand,
    CliToggleFlag,
    SettingsConfigDict,
)

from atlas_tools.audit.postgres import (
    PostgresExportError,
    export_entity_embeddings,
)
from atlas_tools.audit.runner import run_audit
from atlas_tools.audit.synthetic import make_synthetic, write_cluster_labels
from atlas_tools.common.cli import echo, fail, run_cli
from atlas_tools.common.matrix import write_matrix
from atlas_tools.common.postgres import DatabaseConnectionInfo, PostgresPort
from atlas_tools.common.progress import NO_PROGRESS, StderrProgress


class RunCommand(BaseModel):
    """Audit prefix neighbor fidelity against full-vector ground truth."""

    embeddings: FilePath = Field(description="Raw f32 matrix (with <name>.meta.json sidecar).")
    dims: list[PositiveInt] = Field(default_factory=lambda: [128, 256, 512, 1024], min_length=1)
    ks: list[PositiveInt] = Field(default_factory=lambda: [15, 30, 50], min_length=1)
    sample: PositiveInt = 20_000
    strata: FilePath | None = Field(
        default=None,
        description="Optional parquet: int64 'row' column plus string group columns.",
    )
    out: Path
    seed: NonNegativeInt = 0
    memory_cap_gb: PositiveFloat = Field(
        default=8.0,
        description="Estimated cap for audit-owned arrays and FAISS workspace.",
    )
    backend: Literal["auto", "cpu", "gpu"] = Field(
        default="auto",
        description="Exact FAISS backend; auto prefers Metal/CUDA/ROCm when available.",
    )
    min_group_size: PositiveInt = 50
    quiet: CliToggleFlag[bool] = Field(default=False, description="No progress on stderr.")

    def cli_cmd(self) -> None:
        progress = NO_PROGRESS if self.quiet else StderrProgress()
        try:
            run_audit(
                self.embeddings,
                self.out,
                dims=self.dims,
                ks=self.ks,
                sample=self.sample,
                strata_path=self.strata,
                seed=self.seed,
                memory_cap_bytes=int(self.memory_cap_gb * (1 << 30)),
                backend=self.backend,
                min_group_size=self.min_group_size,
                progress=progress,
            )
        except ValueError as error:
            fail(error)
        echo(f"wrote {self.out / 'report.json'}")
        echo(f"wrote {self.out / 'report.md'}")
        echo(f"wrote {self.out / 'report.meta.json'}")


class ExportPostgresCommand(BaseSettings):
    """Export whole-entity embeddings from the HASH graph database."""

    model_config = SettingsConfigDict(env_prefix="HASH_GRAPH_PG_")

    out: Path = Field(description="Output raw f32 matrix path (sidecar written next to it).")
    strata_out: Path | None = Field(
        default=None,
        description="Optional row-aligned parquet with web and entity-type strata.",
    )
    host: str = "localhost"
    port: PostgresPort = 5432
    user: str = "graph"
    password: SecretStr = SecretStr("graph")
    database: str = "graph"
    batch_size: PositiveInt = 1000

    def cli_cmd(self) -> None:
        try:
            provenance = export_entity_embeddings(
                self.out,
                connection_info=DatabaseConnectionInfo(
                    host=self.host,
                    port=self.port,
                    user=self.user,
                    password=self.password.get_secret_value(),
                    database=self.database,
                ),
                strata_path=self.strata_out,
                batch_size=self.batch_size,
            )
        except (OSError, PostgresExportError, ValueError) as error:
            fail(error)

        echo(
            f"wrote {self.out} "
            f"({provenance.details.rows} rows x {provenance.details.dim} dimensions)"
        )
        echo(f"wrote {self.out.name}.meta.json")
        if self.strata_out is not None:
            echo(f"wrote {self.strata_out}")


class SynthFixtureCommand(BaseModel):
    """Write a synthetic fixture whose signal lives in a dimension band."""

    out: Path = Field(description="Output raw f32 matrix path (sidecar written next to it).")
    rows: PositiveInt = 3000
    dim: PositiveInt = 512
    clusters: PositiveInt = 10
    signal_start: NonNegativeInt = 400
    signal_end: NonNegativeInt | None = Field(
        default=None,
        description="End of the signal band (exclusive). Defaults to --dim.",
    )
    signal_scale: NonNegativeFloat = 1.0
    noise_scale: NonNegativeFloat = 0.1
    seed: NonNegativeInt = 0
    labels_out: Path | None = Field(
        default=None,
        description="Optional strata parquet with per-row cluster labels.",
    )

    def cli_cmd(self) -> None:
        band = (self.signal_start, self.dim if self.signal_end is None else self.signal_end)
        try:
            corpus = make_synthetic(
                self.rows,
                self.dim,
                n_clusters=self.clusters,
                signal_band=band,
                signal_scale=self.signal_scale,
                noise_scale=self.noise_scale,
                seed=self.seed,
            )
        except ValueError as error:
            fail(error)
        write_matrix(
            self.out,
            corpus.vectors,
            producer="atlas-tools audit synth-fixture",
            extra_metadata={
                "synthetic": {
                    "n_clusters": self.clusters,
                    "signal_band": list(band),
                    "signal_scale": self.signal_scale,
                    "noise_scale": self.noise_scale,
                    "seed": self.seed,
                }
            },
        )
        echo(f"wrote {self.out}")
        if self.labels_out is not None:
            write_cluster_labels(self.labels_out, corpus.cluster_labels)
            echo(f"wrote {self.labels_out}")


class AuditCli(BaseSettings):
    """Prefix representation audit."""

    export_postgres: CliSubCommand[ExportPostgresCommand]
    run: CliSubCommand[RunCommand]
    synth_fixture: CliSubCommand[SynthFixtureCommand]

    def cli_cmd(self) -> None:
        CliApp.run_subcommand(self)


def main(args: list[str] | None = None) -> None:
    """Run the prefix-audit command-line application."""
    run_cli(AuditCli, args, option_aliases={"--ks": "--k"}, program_name="audit")


if __name__ == "__main__":
    main()
