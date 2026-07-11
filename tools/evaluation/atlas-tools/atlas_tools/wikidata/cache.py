"""Disk cache for HTTP responses.

Cache key = sha256 of the canonical JSON of ``{endpoint (url), params,
snapshot_date}``; value = the response body (``<key>.body``) plus a metadata
JSON (``<key>.meta.json``) recording status, headers, and ``retrieved_at``.

``CachingTransport`` wraps an inner transport: once every request of a run is
cached, a full rerun makes ZERO calls to the inner transport. Failed
responses (non-200) are cached too, so reruns do not re-hit failing
endpoints.

``retrieved_at`` semantics: if the inner response carries a ``date`` header
it is stored verbatim (fixtures set an ISO date so tests are fully
deterministic; real HTTP dates are stored as-is). Otherwise the wall clock at
fetch time is stored. Consumers read ``retrieved_at`` from cache metadata —
never the wall clock at emit time — via the synthesized
``x-atlas-retrieved-at`` response header.
"""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from atlas_tools.common.provenance import canonical_json_bytes, sha256_bytes
from atlas_tools.wikidata.transport import Transport

RETRIEVED_AT_HEADER = "x-atlas-retrieved-at"


def cache_key(url: str, params: dict[str, str] | None, snapshot_date: str) -> str:
    return sha256_bytes(
        canonical_json_bytes(
            {"endpoint": url, "params": params or {}, "snapshot_date": snapshot_date}
        )
    )


def _atomic_write_bytes(path: Path, data: bytes) -> None:
    tmp = path.with_name(path.name + ".tmp")
    tmp.write_bytes(data)
    os.replace(tmp, path)


class CachingTransport:
    """Read-through disk cache around another transport."""

    def __init__(
        self,
        inner: Transport,
        cache_dir: Path | str,
        *,
        snapshot_date: str,
    ) -> None:
        self._inner = inner
        self._dir = Path(cache_dir)
        self._dir.mkdir(parents=True, exist_ok=True)
        self._snapshot_date = snapshot_date

    def _paths(self, key: str) -> tuple[Path, Path]:
        return self._dir / f"{key}.body", self._dir / f"{key}.meta.json"

    def get(
        self, url: str, params: dict[str, str] | None = None
    ) -> tuple[int, dict[str, str], bytes]:
        key = cache_key(url, params, self._snapshot_date)
        body_path, meta_path = self._paths(key)
        if body_path.exists() and meta_path.exists():
            with open(meta_path, encoding="utf-8") as f:
                meta: dict[str, Any] = json.load(f)
            headers = dict(meta.get("headers", {}))
            headers[RETRIEVED_AT_HEADER] = meta["retrieved_at"]
            return int(meta["status"]), headers, body_path.read_bytes()

        status, headers, body = self._inner.get(url, params)
        retrieved_at = headers.get("date") or datetime.now(timezone.utc).isoformat()
        meta = {
            "status": status,
            "headers": {k.lower(): v for k, v in headers.items()},
            "retrieved_at": retrieved_at,
            "url": url,
            "params": params or {},
            "snapshot_date": self._snapshot_date,
        }
        # Body first, then metadata: a torn write leaves no meta file, so the
        # entry is simply refetched.
        _atomic_write_bytes(body_path, body)
        _atomic_write_bytes(
            meta_path,
            (
                json.dumps(meta, sort_keys=True, indent=2, ensure_ascii=False) + "\n"
            ).encode("utf-8"),
        )
        out_headers = dict(meta["headers"])
        out_headers[RETRIEVED_AT_HEADER] = retrieved_at
        return status, out_headers, body
