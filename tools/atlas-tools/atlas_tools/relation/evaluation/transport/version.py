"""Report provider-adapter versions without leaking SDK imports."""

from dataclasses import dataclass
from importlib.metadata import version

import openrouter


@dataclass(frozen=True, slots=True, kw_only=True)
class TransportVersions:
    """Pin the generated SDK and OpenAPI contract used by the adapter."""

    openrouter_sdk_version: str
    openrouter_openapi_version: str

    def __post_init__(self) -> None:
        if not self.openrouter_sdk_version:
            raise ValueError("openrouter_sdk_version must not be empty")
        if not self.openrouter_openapi_version:
            raise ValueError("openrouter_openapi_version must not be empty")


def transport_versions() -> TransportVersions:
    """Read the installed OpenRouter implementation pins."""
    return TransportVersions(
        openrouter_sdk_version=version("openrouter"),
        openrouter_openapi_version=openrouter.OPENAPI_DOC_VERSION,
    )
