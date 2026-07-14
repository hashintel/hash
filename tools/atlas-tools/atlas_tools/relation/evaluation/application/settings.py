"""Load provider secrets only when incomplete work needs the network."""

from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class OpenRouterSettings(BaseSettings):
    """Read the OpenRouter credential without exposing it in diagnostics."""

    api_key: SecretStr

    model_config = SettingsConfigDict(
        env_prefix="OPENROUTER_",
        extra="forbid",
        frozen=True,
    )
