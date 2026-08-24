"""Dump extractor tests.

Line parsing, a golden manifest over the committed 60-entity excerpt,
and interrupted-resume equality (in-process).
"""

import json
from pathlib import Path
from typing import IO

import pyarrow.parquet as pq
import pytest

from atlas_tools.wikidata.config import Config
from atlas_tools.wikidata.dump import (
    EntityRow,
    ExtractionSummary,
    extract_entities,
    extract_entity_row,
)
from tests.wikidata.conftest import DUMP_EXCERPT

# Hand-computed from the generator rules in
# fixtures/wikidata/generate_fixtures.py:
# - Q9000 (i=0):  class Q5;   sitelinks 0%7=0;  labels en "Person 000" (10)
#   and a 10-character French label [i%3==0 -> no de; i%7==0 -> fr].
# - Q9031 (i=31): class Q515; sitelinks 31%7=3; labels en "City 031" (8),
#   de "Stadt 031" (9).
# - Q9045 (i=45): class Q571 + secondary Q99999999 [i%10==5]; sitelinks
#   45%7=3; labels en "Book 045" (8) only [i%3==0 -> no de].
GOLDEN_ROWS = {
    "Q9000": {
        "qid": "Q9000",
        "p31": ["Q5"],
        "sitelink_count": 0,
        "label_count": 2,
        "label_len_primary": 10,
        "label_len_min": 10,
        "label_len_mean": 10.0,
        "label_len_max": 10,
    },
    "Q9031": {
        "qid": "Q9031",
        "p31": ["Q515"],
        "sitelink_count": 3,
        "label_count": 2,
        "label_len_primary": 8,
        "label_len_min": 8,
        "label_len_mean": 8.5,
        "label_len_max": 9,
    },
    "Q9045": {
        "qid": "Q9045",
        "p31": ["Q571", "Q99999999"],
        "sitelink_count": 3,
        "label_count": 1,
        "label_len_primary": 8,
        "label_len_min": 8,
        "label_len_mean": 8.0,
        "label_len_max": 8,
    },
}


class TestExtractEntityRow:
    def test_structural_lines_yield_none(self) -> None:
        assert extract_entity_row(b"[\n", "en") is None
        assert extract_entity_row(b"]\n", "en") is None
        assert extract_entity_row(b"\n", "en") is None

    def test_trailing_comma_stripped(self) -> None:
        line = b'{"type":"item","id":"Q1","labels":{}},\n'
        row = extract_entity_row(line, "en")
        assert row is not None
        assert row.qid == "Q1"

    def test_non_item_entities_skipped(self) -> None:
        line = b'{"type":"property","id":"P31","labels":{}},\n'
        assert extract_entity_row(line, "en") is None

    def test_entity_without_labels_or_claims(self) -> None:
        row = extract_entity_row(b'{"type":"item","id":"Q2"}\n', "en")
        assert row == EntityRow(
            qid="Q2",
            p31=(),
            sitelink_count=0,
            label_count=0,
            label_len_primary=None,
            label_len_min=None,
            label_len_mean=None,
            label_len_max=None,
        )

    def test_novalue_p31_snak_skipped(self) -> None:
        line = b'{"type":"item","id":"Q3","claims":{"P31":[{"mainsnak":{"snaktype":"novalue"}}]}}\n'
        row = extract_entity_row(line, "en")
        assert row is not None
        assert row.p31 == ()


def _run(config: Config, out_dir: Path, checkpoint_dir: Path) -> ExtractionSummary:
    with DUMP_EXCERPT.open("rb") as stream:
        return extract_entities(
            stream,
            config=config,
            out_path=out_dir / "entities.parquet",
            checkpoint_dir=checkpoint_dir,
            input_name=DUMP_EXCERPT.name,
        )


def test_golden_manifest_on_committed_excerpt(config: Config, tmp_path: Path) -> None:
    summary = _run(config, tmp_path, tmp_path / "ckpt")
    assert summary.rows == 60

    table = pq.read_table(tmp_path / "entities.parquet")
    assert table.num_rows == 60
    rows = {row["qid"]: row for row in table.to_pylist()}
    for qid, expected in GOLDEN_ROWS.items():
        assert rows[qid] == expected, qid

    # Rows are in dump order.
    qids = table.column("qid").to_pylist()
    assert qids == [f"Q{9000 + i}" for i in range(60)]

    # Dump identity comes from config (mirror checksum file), never computed
    # by hashing the stream.
    with (tmp_path / "entities.parquet.meta.json").open(encoding="utf-8") as sidecar_file:
        sidecar = json.load(sidecar_file)
    assert sidecar["details"]["dump_date"] == config.extraction.dump.date
    assert sidecar["details"]["dump_sha256"] == config.extraction.dump.sha256
    assert sidecar["details"]["rows_sha256"] == summary.rows_sha256


class _ExplodingStream:
    """Delegates readline() to a real file, then raises mid-run."""

    def __init__(self, opened: IO[bytes], explode_after_lines: int) -> None:
        self._file = opened
        self._remaining = explode_after_lines

    def readline(self) -> bytes:
        if self._remaining <= 0:
            raise RuntimeError("simulated crash")
        self._remaining -= 1
        return self._file.readline()

    def seek(self, offset: int) -> None:
        self._file.seek(offset)


def test_interrupted_resume_produces_identical_outputs(config: Config, tmp_path: Path) -> None:
    # config.checkpoint_interval is 20 in the fixture config: the crash at
    # ~55 lines (54 entities) lands mid-interval, after two checkpoints.
    baseline_dir = tmp_path / "baseline"
    baseline = _run(config, baseline_dir, baseline_dir / "ckpt")

    resumed_dir = tmp_path / "resumed"
    with DUMP_EXCERPT.open("rb") as excerpt_file:
        stream = _ExplodingStream(excerpt_file, explode_after_lines=55)
        with pytest.raises(RuntimeError, match="simulated crash"):
            extract_entities(
                stream,
                config=config,
                out_path=resumed_dir / "entities.parquet",
                checkpoint_dir=resumed_dir / "ckpt",
                input_name=DUMP_EXCERPT.name,
            )
    assert (resumed_dir / "ckpt" / "checkpoint.json").exists()
    assert not (resumed_dir / "entities.parquet").exists()

    resumed = _run(config, resumed_dir, resumed_dir / "ckpt")

    # Row-level hash equality plus full table and byte equality.
    assert resumed.rows_sha256 == baseline.rows_sha256
    baseline_table = pq.read_table(baseline_dir / "entities.parquet")
    resumed_table = pq.read_table(resumed_dir / "entities.parquet")
    assert baseline_table.equals(resumed_table)
    assert (baseline_dir / "entities.parquet").read_bytes() == (
        resumed_dir / "entities.parquet"
    ).read_bytes()


def test_completed_run_reruns_as_identical_noop(config: Config, tmp_path: Path) -> None:
    first = _run(config, tmp_path, tmp_path / "ckpt")
    bytes_first = (tmp_path / "entities.parquet").read_bytes()
    second = _run(config, tmp_path, tmp_path / "ckpt")
    assert second.rows_sha256 == first.rows_sha256
    assert (tmp_path / "entities.parquet").read_bytes() == bytes_first
