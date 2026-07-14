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
    """Run the pilot or full relation-judge evaluation selected by the config."""

    cards: CliPositionalArg[DirectoryPath]
    config: CliPositionalArg[FilePath]
    out: Path
    quiet: bool = False

    model_config = SettingsConfigDict(extra="forbid")

    def cli_cmd(self) -> None:
        from openrouter.errors import NoResponseError, OpenRouterError

        from atlas_tools.common.progress import NO_PROGRESS, StderrProgress
        from atlas_tools.relation.eval.artifacts import PilotPaths
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
        echo(f"wrote {paths.manifest_json}")


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
    analyze: CliSubCommand[AnalyzeCommand]
    visualize: CliSubCommand[VisualizeCommand]

    def cli_cmd(self) -> None:
        CliApp.run_subcommand(self)


def main(args: list[str] | None = None) -> None:
    """Run the relation-card set command-line application."""
    run_cli(RelationCli, args)


if __name__ == "__main__":
    main()
