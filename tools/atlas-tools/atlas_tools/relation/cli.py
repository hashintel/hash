"""``relation`` console entry point (see pyproject [project.scripts])."""

from pathlib import Path

from pydantic import BaseModel, ConfigDict, DirectoryPath, Field, FilePath
from pydantic_settings import (
    BaseSettings,
    CliApp,
    CliPositionalArg,
    CliSubCommand,
    SettingsConfigDict,
)

from atlas_tools.common.cli import echo, fail, run_cli


class ConcatCommand(BaseSettings):
    """Concatenate relation-card sets from multiple producers into one combined set.

    Each input directory must contain a ``cards.jsonl`` and its ``cards.manifest.json``
    sidecar; inputs are verified against their recorded content hashes before merging.
    """

    inputs: CliPositionalArg[list[DirectoryPath]]
    out: Path

    model_config = SettingsConfigDict(extra="forbid")

    def cli_cmd(self) -> None:
        from atlas_tools.relation.concat import concat_relations

        try:
            paths = concat_relations(self.inputs, out=self.out)
        except (OSError, ValueError) as error:
            fail(error)
        echo(f"wrote {paths.cards_jsonl}")
        echo(f"wrote {paths.manifest}")


class FamilyOverlayCommand(BaseSettings):
    """Apply an exact reviewed relation-family mapping to a concat artifact.

    The JSONL mapping must cover the deck exactly and bind each ``relation_id``
    to the reviewed ``card_hash``. The destination is a new verified concat
    artifact and must not already exist.
    """

    cards: CliPositionalArg[DirectoryPath]
    assignments: CliPositionalArg[FilePath]
    out: Path

    model_config = SettingsConfigDict(extra="forbid")

    def cli_cmd(self) -> None:
        from atlas_tools.relation.family_overlay import apply_family_overlay

        try:
            paths = apply_family_overlay(
                self.cards,
                self.assignments,
                out=self.out,
            )
        except (OSError, ValueError) as error:
            fail(error)
        echo(f"wrote {paths.cards_jsonl}")
        echo(f"wrote {paths.manifest}")


class EvaluateCommand(BaseSettings):
    """Run the pilot or production-grid evaluation selected by the config's mode.

    A grid run requires ``--pilot``: the factorial pilot's handoff directory,
    whose matching votes are imported instead of re-bought.
    """

    cards: CliPositionalArg[DirectoryPath]
    config: CliPositionalArg[FilePath]
    out: Path
    pilot: DirectoryPath | None = None
    quiet: bool = False

    model_config = SettingsConfigDict(extra="forbid")

    def cli_cmd(self) -> None:
        from atlas_tools.common.progress import NO_PROGRESS, StderrProgress
        from atlas_tools.relation.evaluation.application.api import (
            GridPaths,
            PilotPaths,
            run_evaluation,
        )

        progress = NO_PROGRESS if self.quiet else StderrProgress()
        try:
            paths = run_evaluation(
                cards_directory=self.cards,
                config_path=self.config,
                output_directory=self.out,
                pilot_directory=self.pilot,
                progress=progress,
            )
        except (OSError, RuntimeError, ValueError) as error:
            fail(error)
        echo(f"wrote {paths.journal.votes}")
        echo(f"wrote {paths.journal.attempts}")
        if isinstance(paths, PilotPaths):
            echo(f"wrote {paths.slice}")
        if isinstance(paths, GridPaths):
            echo(f"wrote {paths.corpus}")
            echo(f"wrote {paths.imported_votes}")
        echo(f"wrote {paths.manifest}")


class DeliverablesCommand(BaseSettings):
    """Emit grid deliverables: posteriors, both queues, ledger, and gates.

    Exits nonzero when any blocking acceptance gate fails.
    """

    run: CliPositionalArg[DirectoryPath]
    cards: CliPositionalArg[DirectoryPath]
    config: CliPositionalArg[FilePath]
    decisions: FilePath
    out: Path

    model_config = SettingsConfigDict(extra="forbid")

    def cli_cmd(self) -> None:
        from atlas_tools.relation.evaluation.application.api import (
            GridGatesBlockedError,
            write_grid_deliverables,
        )

        blocked: GridGatesBlockedError | None = None
        try:
            result = write_grid_deliverables(
                run_directory=self.run,
                cards_directory=self.cards,
                config_path=self.config,
                pilot_decisions_path=self.decisions,
                output_directory=self.out,
            )
        except GridGatesBlockedError as error:
            result = error.run
            blocked = error
        except (OSError, ValueError) as error:
            fail(error)
        echo(f"wrote {result.posteriors_path}")
        echo(f"wrote {result.coincident_queue_path}")
        echo(f"wrote {result.nomination_queue_path}")
        echo(f"wrote {result.dissent_ledger_path}")
        echo(f"wrote {result.gates_path}")
        echo(f"wrote {result.report_path}")
        if blocked is not None:
            fail(blocked)


class AggregateCommand(BaseSettings):
    """Aggregate a completed grid into soft-labels.parquet."""

    run: CliPositionalArg[DirectoryPath]
    cards: CliPositionalArg[DirectoryPath]
    config: CliPositionalArg[FilePath]
    out: Path

    model_config = SettingsConfigDict(extra="forbid")

    def cli_cmd(self) -> None:
        from atlas_tools.relation.evaluation.application.api import aggregate_soft_labels

        try:
            result = aggregate_soft_labels(
                run_directory=self.run,
                cards_directory=self.cards,
                config_path=self.config,
                output_path=self.out,
            )
        except (OSError, ValueError) as error:
            fail(error)
        echo(f"wrote {result.path}")
        echo(f"wrote {result.sidecar_path}")


class EmbedCommand(BaseSettings):
    """Embed every eligible card once per (model, card hash) into parquet."""

    cards: CliPositionalArg[DirectoryPath]
    config: CliPositionalArg[FilePath]
    out: Path
    cache: Path
    quiet: bool = False

    model_config = SettingsConfigDict(extra="forbid")

    def cli_cmd(self) -> None:
        from atlas_tools.common.progress import NO_PROGRESS, StderrProgress
        from atlas_tools.relation.evaluation.application.api import embed_grid

        progress = NO_PROGRESS if self.quiet else StderrProgress()
        try:
            result = embed_grid(
                config_path=self.config,
                deck_directory=self.cards,
                output_path=self.out,
                cache_directory=self.cache,
                progress=progress,
            )
        except (OSError, RuntimeError, ValueError) as error:
            fail(error)
        echo(f"wrote {result.artifact.path}")
        echo(f"wrote {result.artifact.sidecar_path}")


class FitCommand(BaseSettings):
    """Fit the soft-label policy classifier into one versioned bundle."""

    soft_labels: CliPositionalArg[FilePath]
    embeddings: CliPositionalArg[FilePath]
    config: CliPositionalArg[FilePath]
    out: Path

    model_config = SettingsConfigDict(extra="forbid")

    def cli_cmd(self) -> None:
        from atlas_tools.relation.evaluation.application.api import fit_classifier

        try:
            result = fit_classifier(
                soft_labels_path=self.soft_labels,
                embeddings_path=self.embeddings,
                config_path=self.config,
                output_directory=self.out,
            )
        except (OSError, ValueError) as error:
            fail(error)
        echo(f"wrote {result.metadata_path}")
        echo(f"wrote {result.arrays_path}")
        echo(f"wrote {result.out_of_fold_path}")


class ReportCommand(BaseSettings):
    """Render the policy evaluation report (machine JSON plus markdown)."""

    run: CliPositionalArg[DirectoryPath]
    cards: CliPositionalArg[DirectoryPath]
    config: CliPositionalArg[FilePath]
    gold: FilePath
    classifier: DirectoryPath | None = None
    out: Path

    model_config = SettingsConfigDict(extra="forbid")

    def cli_cmd(self) -> None:
        from atlas_tools.relation.evaluation.application.api import write_policy_report

        try:
            result = write_policy_report(
                run_directory=self.run,
                cards_directory=self.cards,
                config_path=self.config,
                gold_path=self.gold,
                classifier_directory=self.classifier,
                output_directory=self.out,
            )
        except (OSError, ValueError) as error:
            fail(error)
        echo(f"wrote {result.report_json_path}")
        echo(f"wrote {result.report_markdown_path}")
        echo(f"wrote {result.metadata_path}")


class AnalyzeCommand(BaseSettings):
    """Analyze a factorial-pilot handoff into decisions.json and report.md."""

    handoff: CliPositionalArg[DirectoryPath]
    out: Path

    model_config = SettingsConfigDict(extra="forbid")

    def cli_cmd(self) -> None:
        from atlas_tools.relation.evaluation.application.api import analyze_handoff

        try:
            result = analyze_handoff(self.handoff, self.out)
        except (OSError, ValueError) as error:
            fail(error)
        echo(f"wrote {result.decisions_json}")
        echo(f"wrote {result.report_md}")


class VisualizeCommand(BaseSettings):
    """Render graphs from a relation analysis's decisions.json output."""

    analysis: CliPositionalArg[DirectoryPath]
    out: Path

    model_config = SettingsConfigDict(extra="forbid")

    def cli_cmd(self) -> None:
        from atlas_tools.relation.evaluation.application.api import visualize_analysis

        try:
            result = visualize_analysis(self.analysis, self.out)
        except (OSError, ValueError) as error:
            fail(error)
        for graph in result.graphs:
            echo(f"wrote {graph}")
        echo(f"wrote {result.explainer_md}")
        echo(f"wrote {result.report_pdf}")
        echo(f"wrote {result.report_html}")


class RelationCli(BaseModel):
    """Operations over relation-card sets."""

    model_config = ConfigDict(populate_by_name=True)

    concat: CliSubCommand[ConcatCommand]
    family_overlay: CliSubCommand[FamilyOverlayCommand] = Field(alias="family-overlay")
    evaluate: CliSubCommand[EvaluateCommand]
    deliverables: CliSubCommand[DeliverablesCommand]
    aggregate: CliSubCommand[AggregateCommand]
    embed: CliSubCommand[EmbedCommand]
    fit: CliSubCommand[FitCommand]
    report: CliSubCommand[ReportCommand]
    analyze: CliSubCommand[AnalyzeCommand]
    visualize: CliSubCommand[VisualizeCommand]

    def cli_cmd(self) -> None:
        CliApp.run_subcommand(self)


def main(args: list[str] | None = None) -> None:
    """Run the relation-card set command-line application."""
    run_cli(RelationCli, args)


if __name__ == "__main__":
    main()
