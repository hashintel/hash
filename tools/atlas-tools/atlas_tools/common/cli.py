"""Shared Pydantic CLI application and path-validation helpers."""

import sys
from collections.abc import Mapping
from typing import Never, Protocol, TypeGuard

from pydantic import BaseModel, ValidationError
from pydantic_settings import BaseSettings, CliApp, CliSettingsSource


class _ArgumentContainer(Protocol):
    def add_argument(self, *names: str, **kwargs: object) -> object: ...


class _AddArgument(Protocol):
    def __call__(self, container: _ArgumentContainer, *names: str, **kwargs: object) -> object: ...


def echo(message: object) -> None:
    """Write one user-facing CLI line to standard output."""
    sys.stdout.write(f"{message}\n")


def _alias_options(aliases: Mapping[str, str]) -> _AddArgument:
    def add_argument(container: _ArgumentContainer, *names: str, **kwargs: object) -> object:
        return container.add_argument(*(aliases.get(name, name) for name in names), **kwargs)

    return add_argument


def _is_settings_model(model: type[BaseModel]) -> TypeGuard[type[BaseSettings]]:
    return issubclass(model, BaseSettings)


def run_cli(
    model: type[BaseModel],
    args: list[str] | None = None,
    *,
    option_aliases: Mapping[str, str] | None = None,
    program_name: str | None = None,
) -> None:
    """Parse and run a Pydantic CLI model with concise validation errors."""
    try:
        source = None
        if option_aliases:
            if not _is_settings_model(model):
                raise TypeError("custom option aliases require a BaseSettings CLI model")
            source = CliSettingsSource(
                model,
                cli_prog_name=program_name,
                cli_avoid_json=True,
                cli_enforce_required=True,
                cli_hide_none_type=True,
                cli_implicit_flags="dual",
                cli_kebab_case=True,
                add_argument_method=_alias_options(option_aliases),
            )
        CliApp.run(model, cli_args=args, cli_settings_source=source)
    except ValidationError as error:
        sys.stderr.write(f"Error: invalid command arguments:\n{error}\n")
        raise SystemExit(2) from None


def fail(error: Exception) -> Never:
    """Exit with a concise runtime error, matching the public CLI contract."""
    sys.stderr.write(f"Error: {error}\n")
    raise SystemExit(1)
