"""Disk cache for HTTP responses.

The cache key is the sha256 of the canonical JSON of a :class:`_CacheKey`
(endpoint url, params, snapshot date); the value is the response body
(``<key>.body``) plus a metadata JSON (``<key>.meta.json``, a
:class:`CacheEntryMetadata`) recording status, headers, and
``retrieved_at``.

``CachingTransport`` wraps an inner transport: once every request of a run
is cached, a full rerun makes zero calls to the inner transport.

Failure caching is deliberate but split by kind:

- Deterministic failures (for example a WDQS query that reliably times out
  with 500) are cached. The example-ladder fallback semantics rely on
  reruns not re-hitting endpoints that will fail again.
- Transient failures (:data:`~atlas_tools.wikidata.transport.TRANSIENT_STATUSES`:
  429 rate limiting, 503, connection failures) are never cached, and a
  previously cached transient entry is evicted and refetched on read. A
  rate-limited run must not poison every future warm rerun.

``retrieved_at`` semantics: if the inner response carries a ``date`` header
it is stored verbatim (fixtures set an ISO date so tests are fully
deterministic; real HTTP dates are stored as-is). Otherwise the wall clock
at fetch time is stored. Consumers read ``retrieved_at`` from cache
metadata via the synthesized ``x-atlas-retrieved-at`` response header,
never from the wall clock at emit time.
"""

import json
from collections.abc import Mapping
from datetime import UTC, datetime
from os import PathLike
from pathlib import Path

from pydantic import BaseModel, Field

from atlas_tools.common.provenance import canonical_json_bytes, sha256_bytes
from atlas_tools.wikidata.transport import TRANSIENT_STATUSES, Response, Transport

RETRIEVED_AT_HEADER = "x-atlas-retrieved-at"


class _CacheKey(BaseModel):
    """Canonical cache-entry identity; hashing it yields the entry key."""

    endpoint: str
    params: dict[str, str]
    snapshot_date: str


def cache_key(url: str, params: Mapping[str, str] | None, snapshot_date: str) -> str:
    return sha256_bytes(
        canonical_json_bytes(
            _CacheKey(endpoint=url, params=dict(params or {}), snapshot_date=snapshot_date)
        )
    )


class CacheEntryMetadata(BaseModel):
    """The ``<key>.meta.json`` document next to each cached body."""

    status: int
    headers: dict[str, str] = Field(default_factory=dict)
    retrieved_at: str
    url: str
    params: dict[str, str] = Field(default_factory=dict)
    snapshot_date: str

    def response(self, body: bytes) -> Response:
        headers = dict(self.headers)
        headers[RETRIEVED_AT_HEADER] = self.retrieved_at
        return Response(status=self.status, headers=headers, body=body)


def _atomic_write_bytes(path: Path, data: bytes) -> None:
    tmp = path.with_name(path.name + ".tmp")
    tmp.write_bytes(data)
    tmp.replace(path)


class CachingTransport:
    """Read-through disk cache around another transport."""

    def __init__(
        self,
        inner: Transport,
        cache_dir: PathLike,
        *,
        snapshot_date: str,
    ) -> None:
        self._inner = inner
        self._dir = Path(cache_dir)
        self._dir.mkdir(parents=True, exist_ok=True)
        self._snapshot_date = snapshot_date

    def _paths(self, key: str) -> tuple[Path, Path]:
        return self._dir / f"{key}.body", self._dir / f"{key}.meta.json"

    def get(self, url: str, params: Mapping[str, str] | None = None) -> Response:
        key = cache_key(url, params, self._snapshot_date)
        body_path, metadata_path = self._paths(key)
        if body_path.exists() and metadata_path.exists():
            metadata = CacheEntryMetadata.model_validate_json(metadata_path.read_bytes())
            if metadata.status not in TRANSIENT_STATUSES:
                return metadata.response(body_path.read_bytes())
            # Self-heal entries poisoned before transient statuses were
            # excluded from caching: evict and refetch.
            metadata_path.unlink()
            body_path.unlink(missing_ok=True)

        fetched = self._inner.get(url, params)
        if fetched.status in TRANSIENT_STATUSES:
            return fetched
        retrieved_at = fetched.headers.get("date") or datetime.now(UTC).isoformat()
        metadata = CacheEntryMetadata(
            status=fetched.status,
            headers={key.lower(): value for key, value in fetched.headers.items()},
            retrieved_at=retrieved_at,
            url=url,
            params=dict(params or {}),
            snapshot_date=self._snapshot_date,
        )
        # Body first, then metadata: a torn write leaves no meta file, so the
        # entry is simply refetched.
        _atomic_write_bytes(body_path, fetched.body)
        _atomic_write_bytes(
            metadata_path,
            (
                json.dumps(
                    metadata.model_dump(mode="json"),
                    sort_keys=True,
                    indent=2,
                    ensure_ascii=False,
                )
                + "\n"
            ).encode("utf-8"),
        )
        return metadata.response(fetched.body)
