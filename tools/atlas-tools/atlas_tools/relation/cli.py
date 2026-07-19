"""``relation`` console entry point (see pyproject [project.scripts])."""

from pathlib import Path
from typing import Annotated

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
        from atlas_tools.relation.concat.api import concat_relations

        try:
            paths = concat_relations(self.inputs, out=self.out)
        except (OSError, ValueError) as error:
            fail(error)
        echo(f"wrote {paths.cards_jsonl}")
        echo(f"wrote {paths.manifest}")


class ClosureCommand(BaseSettings):
    """Publish overlap-safe relation families from verified source lineage.

    The card directory must be a verified ``relation.concat`` artifact. Every
    source namespace in that deck requires exactly one schema-v1 lineage input.
    The output directory is immutable and must not already exist.
    """

    cards: CliPositionalArg[DirectoryPath]
    lineages: CliPositionalArg[list[DirectoryPath]]
    out: Path

    model_config = SettingsConfigDict(extra="forbid")

    def cli_cmd(self) -> None:
        from atlas_tools.relation.family_closure.api import publish_family_closure

        try:
            paths = publish_family_closure(
                self.cards,
                self.lineages,
                output_directory=self.out,
            )
        except (OSError, ValueError) as error:
            fail(error)
        echo(f"wrote {paths.families_jsonl}")
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
        from atlas_tools.relation.evaluation.application.run import run_evaluation
        from atlas_tools.relation.evaluation.storage.api import GridPaths, PilotPaths

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


class StatusCommand(BaseSettings):
    """Monitor a production grid through its durable append-only artifacts.

    The full-screen dashboard refreshes until ``q`` is pressed. ``--once`` prints one
    status sample for logs, scripts, or terminals without interactive capabilities.
    """

    run: CliPositionalArg[DirectoryPath]
    refresh_seconds: Annotated[float, Field(ge=0.25)] = 2.0
    trigger_rate: Annotated[float, Field(ge=0, le=1)] = 0.40
    once: bool = False

    model_config = SettingsConfigDict(extra="forbid")

    def cli_cmd(self) -> None:
        from atlas_tools.relation.evaluation.application.grid_status import GridStatusReader
        from atlas_tools.relation.evaluation.visualization.api import run_grid_status

        reader = GridStatusReader(self.run, trigger_rate=self.trigger_rate)
        try:
            run_grid_status(
                reader.snapshot,
                refresh_seconds=self.refresh_seconds,
                once=self.once,
            )
        except (OSError, RuntimeError, ValueError) as error:
            fail(error)


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


class ReviewCoincidentCommand(BaseSettings):
    """Review every obligatory Coincident queue row into a typed human artifact."""

    deliverables: CliPositionalArg[DirectoryPath]
    cards: CliPositionalArg[DirectoryPath]
    reviewer: Annotated[str, Field(min_length=1)]
    out: Path

    model_config = SettingsConfigDict(extra="forbid")

    def cli_cmd(self) -> None:
        from atlas_tools.relation.evaluation.application.api import review_coincident_queue

        try:
            result = review_coincident_queue(
                deliverables=self.deliverables,
                deck=self.cards,
                reviewer=self.reviewer,
                output_directory=self.out,
            )
        except (OSError, RuntimeError, ValueError) as error:
            fail(error)
        echo(f"wrote {result.paths.rows_path}")
        echo(f"wrote {result.paths.manifest_path}")


class ResolveAmbiguousCommand(BaseSettings):
    """Review all labels without placement evidence into a typed target artifact."""

    soft_labels: CliPositionalArg[FilePath]
    cards: CliPositionalArg[DirectoryPath]
    reviewer: Annotated[str, Field(min_length=1)]
    out: Path

    model_config = SettingsConfigDict(extra="forbid")

    def cli_cmd(self) -> None:
        from atlas_tools.relation.evaluation.application.api import review_ambiguous_targets

        try:
            result = review_ambiguous_targets(
                soft_labels=self.soft_labels,
                deck=self.cards,
                reviewer=self.reviewer,
                output_directory=self.out,
            )
        except (OSError, RuntimeError, ValueError) as error:
            fail(error)
        echo(f"wrote {result.paths.rows_path}")
        echo(f"wrote {result.paths.manifest_path}")


class FitCommand(BaseSettings):
    """Fit the soft-label policy classifier into one versioned bundle."""

    soft_labels: CliPositionalArg[FilePath]
    embeddings: CliPositionalArg[FilePath]
    closure: CliPositionalArg[DirectoryPath]
    config: CliPositionalArg[FilePath]
    out: Path
    resolutions: DirectoryPath | None = None
    coincident_reviews: DirectoryPath | None = None
    deliverables: DirectoryPath | None = None

    model_config = SettingsConfigDict(extra="forbid")

    def cli_cmd(self) -> None:
        from atlas_tools.relation.evaluation.application.api import fit_classifier

        try:
            result = fit_classifier(
                soft_labels_path=self.soft_labels,
                embeddings_path=self.embeddings,
                closure_directory=self.closure,
                config_path=self.config,
                output_directory=self.out,
                resolutions_directory=self.resolutions,
                coincident_reviews_directory=self.coincident_reviews,
                deliverables_directory=self.deliverables,
            )
        except (OSError, ValueError) as error:
            fail(error)
        echo(f"wrote {result.metadata_path}")
        echo(f"wrote {result.arrays_path}")
        echo(f"wrote {result.out_of_fold_path}")


class ExportClassifierCommand(BaseSettings):
    """Export a verified fit bundle as Atlas-native ``classifier.salt``."""

    classifier: CliPositionalArg[DirectoryPath]
    closure: CliPositionalArg[DirectoryPath]
    out: Path
    soft_labels: FilePath | None = None
    resolutions: DirectoryPath | None = None
    coincident_reviews: DirectoryPath | None = None
    deliverables: DirectoryPath | None = None
    model_config = SettingsConfigDict(extra="forbid")

    def cli_cmd(self) -> None:
        from atlas_tools.relation.evaluation.application.api import export_atlas_classifier

        try:
            result = export_atlas_classifier(
                classifier_directory=self.classifier,
                closure_directory=self.closure,
                output_path=self.out,
                soft_labels_path=self.soft_labels,
                resolutions_directory=self.resolutions,
                coincident_reviews_directory=self.coincident_reviews,
                deliverables_directory=self.deliverables,
            )
        except (OSError, ValueError) as error:
            fail(error)
        echo(f"wrote {result.path}")


class ExportFitInputsCommand(BaseSettings):
    """Export verified real card embeddings as SALT relation-policy inputs."""

    classifier: CliPositionalArg[FilePath]
    cards: CliPositionalArg[DirectoryPath]
    embeddings: CliPositionalArg[FilePath]
    out: Path

    model_config = SettingsConfigDict(extra="forbid")

    def cli_cmd(self) -> None:
        from atlas_tools.relation.evaluation.application.api import export_fit_inputs

        try:
            result = export_fit_inputs(
                classifier_path=self.classifier,
                cards_directory=self.cards,
                embeddings_path=self.embeddings,
                output_path=self.out,
            )
        except (OSError, ValueError) as error:
            fail(error)
        echo(f"wrote {result.path}")
        echo(f"sha256 {result.content_hash}")
        echo(f"relations {result.relation_count}")


class ExportReviewedVerdictsCommand(BaseSettings):
    """Export human-confirmed relation placement verdicts for the SALT trainer.

    The verdicts are the corpus's target resolutions: human placement classes for
    relations without placement-vote evidence. ``excluded`` resolutions are omitted
    from the document and reported separately.
    """

    resolutions: CliPositionalArg[DirectoryPath]
    soft_labels: CliPositionalArg[FilePath]
    cards: CliPositionalArg[DirectoryPath]
    out: Path

    model_config = SettingsConfigDict(extra="forbid")

    def cli_cmd(self) -> None:
        from atlas_tools.relation.evaluation.application.api import export_reviewed_verdicts

        try:
            result = export_reviewed_verdicts(
                resolutions_directory=self.resolutions,
                soft_labels_path=self.soft_labels,
                cards_directory=self.cards,
                output_path=self.out,
            )
        except (OSError, ValueError) as error:
            fail(error)
        echo(f"wrote {result.path}")
        echo(f"sha256 {result.content_hash}")
        echo(f"coincident {result.coincident_count}")
        echo(f"proximal {result.proximal_count}")
        echo(f"overlay {result.overlay_count}")
        echo(f"excluded {result.excluded_count} (omitted)")


class ReportCommand(BaseSettings):
    """Render the policy evaluation report (machine JSON plus markdown)."""

    run: CliPositionalArg[DirectoryPath]
    cards: CliPositionalArg[DirectoryPath]
    config: CliPositionalArg[FilePath]
    gold: FilePath | None = None
    classifier: DirectoryPath | None = None
    closure: DirectoryPath | None = None
    soft_labels: FilePath | None = None
    resolutions: DirectoryPath | None = None
    coincident_reviews: DirectoryPath | None = None
    deliverables: DirectoryPath | None = None
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
                closure_directory=self.closure,
                soft_labels_path=self.soft_labels,
                resolutions_directory=self.resolutions,
                coincident_reviews_directory=self.coincident_reviews,
                deliverables_directory=self.deliverables,
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


class VisualizeReportCommand(BaseSettings):
    """Render source-bound images and reports from a validated policy report."""

    report: CliPositionalArg[DirectoryPath]
    out: Path

    model_config = SettingsConfigDict(extra="forbid")

    def cli_cmd(self) -> None:
        from atlas_tools.relation.evaluation.application.api import visualize_policy_report

        try:
            result = visualize_policy_report(self.report, self.out)
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
    closure: CliSubCommand[ClosureCommand]
    evaluate: CliSubCommand[EvaluateCommand]
    status: CliSubCommand[StatusCommand]
    deliverables: CliSubCommand[DeliverablesCommand]
    aggregate: CliSubCommand[AggregateCommand]
    embed: CliSubCommand[EmbedCommand]
    review_coincident: CliSubCommand[ReviewCoincidentCommand]
    resolve_ambiguous: CliSubCommand[ResolveAmbiguousCommand]
    fit: CliSubCommand[FitCommand]
    export_classifier: CliSubCommand[ExportClassifierCommand]
    export_fit_inputs: CliSubCommand[ExportFitInputsCommand]
    export_reviewed_verdicts: CliSubCommand[ExportReviewedVerdictsCommand]
    report: CliSubCommand[ReportCommand]
    analyze: CliSubCommand[AnalyzeCommand]
    visualize: CliSubCommand[VisualizeCommand]
    visualize_report: CliSubCommand[VisualizeReportCommand]

    def cli_cmd(self) -> None:
        CliApp.run_subcommand(self)


def main(args: list[str] | None = None) -> None:
    """Run the relation-card set command-line application."""
    run_cli(RelationCli, args)


if __name__ == "__main__":
    main()
