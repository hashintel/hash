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
    """Run the factorial relation-judge pilot and emit an analysis handoff."""

    cards: CliPositionalArg[DirectoryPath]
    config: CliPositionalArg[FilePath]
    out: Path

    model_config = SettingsConfigDict(extra="forbid")

    def cli_cmd(self) -> None:
        from openrouter.errors import NoResponseError, OpenRouterError

        from atlas_tools.relation.eval.run import load_run_config, run_pilot

        try:
            paths = run_pilot(
                cards_dir=self.cards,
                out_dir=self.out,
                config=load_run_config(self.config),
            )
        except (NoResponseError, OpenRouterError, OSError, ValueError) as error:
            fail(error)
        echo(f"wrote {paths.votes_jsonl}")
        echo(f"wrote {paths.attempts_jsonl}")
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


class RelationCli(BaseModel):
    """Operations over relation-card sets."""

    concat: CliSubCommand[ConcatCommand]
    evaluate: CliSubCommand[EvaluateCommand]
    analyze: CliSubCommand[AnalyzeCommand]

    def cli_cmd(self) -> None:
        CliApp.run_subcommand(self)


def main(args: list[str] | None = None) -> None:
    """Run the relation-card set command-line application."""
    run_cli(RelationCli, args)


if __name__ == "__main__":
    main()
