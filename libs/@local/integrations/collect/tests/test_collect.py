"""Collections of a source served by a small HTTP server into a local folder."""

import json
import threading
from collections.abc import Iterator
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import override
from uuid import UUID

import pyarrow as pa
import pytest
from deltalake import DeltaTable
from dlt.sources.rest_api import rest_api_source

from hash_integrations_collect.collect import Integration, collect
from hash_integrations_collect.github import github_source

INTEGRATION = Integration(web=UUID("00000000-0000-4000-8000-000000000001"), connector="aviation")


class _Aircraft:
    """The rows the server gives, which a test changes between collections."""

    rows: list[dict[str, object]] = []  # ruff: ignore[mutable-class-default] - shared with the request handler


class _Handler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        body = json.dumps(_Aircraft.rows).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    @override
    def log_message(self, format: str, *args: object) -> None:
        pass


@pytest.fixture
def server() -> Iterator[str]:
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), _Handler)
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    yield f"http://127.0.0.1:{httpd.server_address[1]}/"
    httpd.shutdown()


def _source(url: str):  # ruff: ignore[missing-return-type-private-function] - dlt's source type
    return rest_api_source({
        "client": {"base_url": url, "paginator": "single_page"},
        "resources": [
            {
                "name": "aircraft",
                "primary_key": "tail",
                "endpoint": {"path": "aircraft"},
                "columns": {"deleted": {"data_type": "bool", "hard_delete": True}},
            },
        ],
    })


def _changes(uri: str, version: int) -> list[tuple[str, str, str | None]]:
    table = DeltaTable(uri)
    rows = pa.RecordBatchReader.from_stream(
        table.load_cdf(starting_version=version, ending_version=version)
    ).read_all()
    return sorted((row["_change_type"], row["tail"], row["model"]) for row in rows.to_pylist())


def test_collections_merge_into_a_delta_table_with_its_change_data_feed(
    server: str, tmp_path: Path
) -> None:
    bucket = tmp_path.as_uri()
    _Aircraft.rows = [
        {"tail": "SE-XXX", "model": "DC-3"},
        {"tail": "N100", "model": "L-1049"},
        {"tail": "G-OLD", "model": "Ju 52"},
    ]
    [first] = collect(INTEGRATION, bucket, _source(server))
    assert first.name == "aircraft"
    assert first.uri == f"{INTEGRATION.root(bucket)}/dlt/aircraft"
    assert _changes(first.uri, first.version) == [
        ("insert", "G-OLD", "Ju 52"),
        ("insert", "N100", "L-1049"),
        ("insert", "SE-XXX", "DC-3"),
    ]

    _Aircraft.rows = [
        {"tail": "SE-XXX", "model": "DC-3"},
        {"tail": "N100", "model": "L-1049G"},
        {"tail": "G-OLD", "model": "Ju 52", "deleted": True},
        {"tail": "D-NEW", "model": "Do 228"},
    ]
    [second] = collect(INTEGRATION, bucket, _source(server))
    assert second.version > first.version
    assert _changes(second.uri, second.version) == [
        ("delete", "G-OLD", "Ju 52"),
        ("insert", "D-NEW", "Do 228"),
        ("update_postimage", "N100", "L-1049G"),
        ("update_preimage", "N100", "L-1049"),
    ], "an unchanged row should not be written again"

    [third] = collect(INTEGRATION, bucket, _source(server))
    changes = [] if third.version == second.version else _changes(third.uri, third.version)
    assert changes == [], "a collection without changes should add no changes"


class _GitHub(BaseHTTPRequestHandler):
    """A repository with one issue and one pull request, which the issues endpoint also lists."""

    def do_GET(self) -> None:
        item = {
            "title": "Add a collector",
            "state": "open",
            "user": {"login": "octocat"},
            "created_at": "2026-11-26T10:00:00Z",
            "updated_at": "2026-11-26T11:00:00Z",
            "closed_at": None,
        }
        pull_request = {
            **item,
            "number": 2,
            "html_url": "https://github.com/o/r/pull/2",
            "draft": False,
            "merged_at": None,
        }
        if self.path.startswith("/repos/hashintel/hash/issues"):
            rows = [
                {**item, "number": 1, "html_url": "https://github.com/o/r/issues/1"},
                {**pull_request, "pull_request": {}},
            ]
        elif self.path.startswith("/repos/hashintel/hash/pulls"):
            rows = [pull_request]
        else:
            self.send_error(404)
            return
        body = json.dumps(rows).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    @override
    def log_message(self, format: str, *args: object) -> None:
        pass


def test_github_reads_its_repository_from_the_configuration(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), _GitHub)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    monkeypatch.setenv("SOURCES__GITHUB__OWNER", "hashintel")
    monkeypatch.setenv("SOURCES__GITHUB__REPO", "hash")
    try:
        tables = collect(
            INTEGRATION,
            tmp_path.as_uri(),
            github_source(api=f"http://127.0.0.1:{httpd.server_address[1]}"),
        )
    finally:
        httpd.shutdown()

    numbers = {
        table.name: sorted(
            row["number"] for row in DeltaTable(table.uri).to_pyarrow_table().to_pylist()
        )
        for table in tables
    }
    assert numbers == {"issues": [1], "pull_requests": [2]}, (
        "the issues table should leave out the pull request the issues endpoint lists"
    )
