"""Shared PostgreSQL connection values for live HASH selectors."""

from dataclasses import dataclass
from typing import Annotated

from pydantic import Field

type PostgresPort = Annotated[int, Field(ge=1, le=65535)]


@dataclass(frozen=True)
class DatabaseConnectionInfo:
    """Parameters accepted by psycopg without embedding credentials in provenance."""

    host: str
    port: PostgresPort
    user: str
    password: str
    database: str
