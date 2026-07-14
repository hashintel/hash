"""``relation`` console entry point (see pyproject [project.scripts])."""

from pathlib import Path

from pydantic import BaseModel, DirectoryPath, FilePath
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


class EvaluateCommand(BaseSettings):
    """Run the pilot or vote-ladder evaluation selected by the config's mode."""

    cards: CliPositionalArg[DirectoryPath]
    config: CliPositionalArg[FilePath]
    out: Path
    quiet: bool = False

    model_config = SettingsConfigDict(extra="forbid")

    def cli_cmd(self) -> None:
        from openrouter.errors import NoResponseError, OpenRouterError

        from atlas_tools.common.progress import NO_PROGRESS, StderrProgress
        from atlas_tools.relation.eval.artifacts import LadderPaths, PilotPaths
        from atlas_tools.relation.eval.run import load_run_config, run_evaluation

        progress = NO_PROGRESS if self.quiet else StderrProgress()
        try:
            paths = run_evaluation(
                cards_dir=self.cards,
                out_dir=self.out,
                loaded_config=load_run_config(self.config),
                progress=progress,
            )
        except (NoResponseError, OpenRouterError, OSError, RuntimeError, ValueError) as error:
            fail(error)
        echo(f"wrote {paths.votes_jsonl}")
        echo(f"wrote {paths.attempts_jsonl}")
        if isinstance(paths, PilotPaths):
            echo(f"wrote {paths.slice_jsonl}")
        if isinstance(paths, LadderPaths):
            echo(f"wrote {paths.review_queue_jsonl}")
        echo(f"wrote {paths.manifest_json}")


class QualifyCommand(BaseSettings):
    """Run the ladder pilot on a small deck and emit the judge qualification table.

    This is the only entry point that accepts an unfrozen judges.yaml panel.
    """

    cards: CliPositionalArg[DirectoryPath]
    config: CliPositionalArg[FilePath]
    gold: FilePath
    out: Path
    quiet: bool = False

    model_config = SettingsConfigDict(extra="forbid")

    def cli_cmd(self) -> None:
        from openrouter.errors import NoResponseError, OpenRouterError

        from atlas_tools.common.progress import NO_PROGRESS, StderrProgress
        from atlas_tools.relation.eval.qualify import run_qualification
        from atlas_tools.relation.eval.run import load_run_config

        progress = NO_PROGRESS if self.quiet else StderrProgress()
        try:
            result = run_qualification(
                cards_dir=self.cards,
                out_dir=self.out,
                loaded_config=load_run_config(self.config),
                gold_path=self.gold,
                progress=progress,
            )
        except (NoResponseError, OpenRouterError, OSError, RuntimeError, ValueError) as error:
            fail(error)
        echo(f"wrote {result.run_paths.votes_jsonl}")
        echo(f"wrote {result.soft_labels_parquet}")
        echo(f"wrote {result.qualification_json}")
        echo(f"wrote {result.qualification_md}")


class AggregateCommand(BaseSettings):
    """Aggregate a completed ladder run into soft-labels.parquet."""

    run: CliPositionalArg[DirectoryPath]
    cards: CliPositionalArg[DirectoryPath]
    config: CliPositionalArg[FilePath]
    out: Path

    model_config = SettingsConfigDict(extra="forbid")

    def cli_cmd(self) -> None:
        from atlas_tools.relation.eval.aggregate import aggregate_soft_labels
        from atlas_tools.relation.eval.run import load_run_config

        try:
            result = aggregate_soft_labels(
                run_dir=self.run,
                cards_dir=self.cards,
                loaded_config=load_run_config(self.config),
                out_path=self.out,
            )
        except (OSError, ValueError) as error:
            fail(error)
        echo(f"wrote {result.soft_labels_parquet}")
        echo(f"wrote {result.sidecar}")


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
        from atlas_tools.relation.eval.embeddings import embed_cards
        from atlas_tools.relation.eval.run import load_run_config

        progress = NO_PROGRESS if self.quiet else StderrProgress()
        try:
            result = embed_cards(
                cards_dir=self.cards,
                loaded_config=load_run_config(self.config),
                out_path=self.out,
                cache_dir=self.cache,
                progress=progress,
            )
        except (OSError, RuntimeError, ValueError) as error:
            fail(error)
        echo(f"wrote {result.embeddings_parquet}")
        echo(f"wrote {result.sidecar}")


class FitCommand(BaseSettings):
    """Fit the soft-label policy classifier into one versioned bundle."""

    soft_labels: CliPositionalArg[FilePath]
    embeddings: CliPositionalArg[FilePath]
    config: CliPositionalArg[FilePath]
    out: Path

    model_config = SettingsConfigDict(extra="forbid")

    def cli_cmd(self) -> None:
        from atlas_tools.relation.eval.classifier import fit_classifier
        from atlas_tools.relation.eval.run import load_run_config

        try:
            result = fit_classifier(
                soft_labels_path=self.soft_labels,
                embeddings_path=self.embeddings,
                loaded_config=load_run_config(self.config),
                out_dir=self.out,
            )
        except (OSError, ValueError) as error:
            fail(error)
        echo(f"wrote {result.metadata_json}")
        echo(f"wrote {result.arrays_npz}")
        echo(f"wrote {result.predictions_parquet}")


class ReportCommand(BaseSettings):
    """Render the per-run evaluation report (machine JSON plus markdown)."""

    run: CliPositionalArg[DirectoryPath]
    cards: CliPositionalArg[DirectoryPath]
    config: CliPositionalArg[FilePath]
    gold: FilePath
    classifier: DirectoryPath | None = None
    out: Path

    model_config = SettingsConfigDict(extra="forbid")

    def cli_cmd(self) -> None:
        from atlas_tools.relation.eval.ladder_report import write_report
        from atlas_tools.relation.eval.run import load_run_config

        try:
            result = write_report(
                run_dir=self.run,
                cards_dir=self.cards,
                loaded_config=load_run_config(self.config),
                gold_path=self.gold,
                classifier_dir=self.classifier,
                out_dir=self.out,
            )
        except (OSError, ValueError) as error:
            fail(error)
        echo(f"wrote {result.report_json}")
        echo(f"wrote {result.report_md}")


class AnalyzeCommand(BaseSettings):
    """Analyze a factorial-pilot handoff into decisions.json and report.md."""

    handoff: CliPositionalArg[DirectoryPath]
    out: Path

    model_config = SettingsConfigDict(extra="forbid")

    def cli_cmd(self) -> None:
        from atlas_tools.relation.eval.analysis import analyze_handoff

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
        from atlas_tools.relation.eval.visualization import visualize_analysis

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

    concat: CliSubCommand[ConcatCommand]
    evaluate: CliSubCommand[EvaluateCommand]
    qualify: CliSubCommand[QualifyCommand]
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
