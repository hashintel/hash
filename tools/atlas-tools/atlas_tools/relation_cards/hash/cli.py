"""Pydantic command-line application for live HASH relation cards."""

from pathlib import Path

from pydantic import BaseModel, Field, PositiveInt, SecretStr
from pydantic_settings import BaseSettings, CliApp, CliSubCommand, SettingsConfigDict

from atlas_tools.common.cli import echo, fail, run_cli
from atlas_tools.common.postgres import DatabaseConnectionInfo, PostgresPort
from atlas_tools.relation_cards.common.config import (
    CardsConfig,
    SentenceSplitterName,
    TokenizerName,
)
from atlas_tools.relation_cards.hash.cards import (
    HashCardsConfig,
    extract_and_emit_hash_cards,
)
from atlas_tools.relation_cards.hash.model import ExampleSecurityMode
from atlas_tools.relation_cards.hash.postgres import HashPostgresError


class ExtractCardsCommand(BaseSettings):
    """Select all current HASH link types and write canonical relation cards."""

    model_config = SettingsConfigDict(env_prefix="HASH_GRAPH_PG_", extra="forbid")

    out: Path
    host: str = "localhost"
    port: PostgresPort = 5432
    user: str = "graph"
    password: SecretStr = SecretStr("graph")
    database: str = "graph"
    example_count: PositiveInt = 8
    example_security_mode: ExampleSecurityMode = Field(
        default="none",
        description=(
            "Native examples are disabled unless all-snapshot-links is explicitly selected."
        ),
    )
    token_budget: PositiveInt = 6000
    hard_token_budget: PositiveInt = 7500
    tokenizer: TokenizerName = "cl100k"
    sentence_splitter: SentenceSplitterName = "punkt"

    def cli_cmd(self) -> None:
        connection_info = DatabaseConnectionInfo(
            host=self.host,
            port=self.port,
            user=self.user,
            password=self.password.get_secret_value(),
            database=self.database,
        )
        config = HashCardsConfig(
            example_count=self.example_count,
            example_security_mode=self.example_security_mode,
            cards=CardsConfig(
                token_budget=self.token_budget,
                hard_token_budget=self.hard_token_budget,
                tokenizer=self.tokenizer,
                sentence_splitter=self.sentence_splitter,
            ),
        )
        try:
            paths = extract_and_emit_hash_cards(connection_info, config, self.out)
        except (HashPostgresError, OSError, ValueError) as error:
            fail(error)
        echo(f"wrote {paths.link_types_jsonl}")
        echo(f"wrote {paths.cards_jsonl}")
        echo(f"wrote {paths.manifest}")


class HashRelationCardsCli(BaseModel):
    """Canonical relation cards selected from the live HASH database."""

    extract_cards: CliSubCommand[ExtractCardsCommand]

    def cli_cmd(self) -> None:
        CliApp.run_subcommand(self)


def main(args: list[str] | None = None) -> None:
    """Run the HASH relation-card command-line application."""
    run_cli(HashRelationCardsCli, args)


if __name__ == "__main__":
    main()
