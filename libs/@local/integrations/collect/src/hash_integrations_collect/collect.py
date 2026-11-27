"""Collects a source's tables with dlt into the Delta tables the ledger captures from."""

import hashlib
import tempfile
from dataclasses import dataclass
from uuid import UUID

import dlt
from dlt.common.libs.deltalake import get_delta_tables
from dlt.destinations import filesystem
from dlt.extract import DltSource

COLLECTED = "dlt"
"""The folder below an integration's place in the bucket that its tables are collected to."""


@dataclass(frozen=True)
class Integration:
    """An integration: the web it writes to, and the connector its definition names."""

    web: UUID
    connector: str

    def digest(self) -> str:
        """Return the integration's name in the bucket, as the ledger derives it."""
        return hashlib.sha256(f"{self.web}:{self.connector}".encode()).hexdigest()

    def root(self, bucket_uri: str) -> str:
        """Return the integration's place in the bucket at `bucket_uri`."""
        return f"{bucket_uri.rstrip('/')}/tenants/{self.web}/integrations/{self.digest()}"


@dataclass(frozen=True)
class CollectedTable:
    """A table of the source, its Delta table and the version the collection left it at."""

    name: str
    uri: str
    version: int


def collect(integration: Integration, bucket_uri: str, source: DltSource) -> list[CollectedTable]:
    """Collect every table of `source` into the integration's place in the bucket at `bucket_uri`.

    `bucket_uri` is `s3://bucket/prefix`, the bucket the ledger keeps the integration's state in,
    or `file:///path` for a local folder. dlt resolves the bucket's credentials from its
    configuration, in the section `destination.filesystem.credentials`: from environment variables
    such as `DESTINATION__FILESYSTEM__CREDENTIALS__AWS_ACCESS_KEY_ID`, then `.dlt/secrets.toml` and
    `.dlt/config.toml`.

    Each table is merged by its primary key into a Delta table with its change data feed on, and
    a row the source marks with a `hard_delete` column is deleted. A row that did not change is
    not written again, so a collection without changes adds no changes to the feed. The ledger
    depends on these settings, so they are not configurable. dlt keeps the pipeline's state, such
    as the cursor of an incremental resource, in the bucket, so a collection needs nothing from an
    earlier one but the bucket.

    Returns the tables that exist after the collection; a table the source never gave a row for
    has none.
    """
    for resource in source.resources.values():
        resource.apply_hints(
            write_disposition={
                "disposition": "merge",
                "strategy": "upsert",
                "skip_unchanged_rows": True,
            },
            table_format="delta",
        )
    source.max_table_nesting = 0

    root = integration.root(bucket_uri)
    destination = filesystem(
        bucket_url=root,
        deltalake_configuration={"delta.enableChangeDataFeed": "true"},
    )
    with tempfile.TemporaryDirectory() as pipelines:
        pipeline = dlt.pipeline(
            pipeline_name=f"integration_{integration.digest()[:16]}",
            destination=destination,
            dataset_name=COLLECTED,
            pipelines_dir=pipelines,
        )
        pipeline.run(source)
        return [
            CollectedTable(name=name, uri=f"{root}/{COLLECTED}/{name}", version=table.version())
            for name, table in get_delta_tables(pipeline).items()
        ]
