"""Measure dump-extractor throughput on a generated dump slice.

Excluded from the test suite. Usage (from the atlas-tools root):

    uv run --no-sync python -m atlas_tools.wikidata.benchmarks.measure_throughput \
        --target-mb 50

Generates a synthetic dump slice of roughly ``--target-mb`` MB in a
temporary directory, streams it through ``extract_entities`` (row hashing
disabled, as a production run at scale would), and reports MB/s plus the
projected end-to-end wall time for a ~140 GB uncompressed dump. Record
results in ``atlas_tools/wikidata/BENCHMARK.md``.
"""

import json
import tempfile
import time
from pathlib import Path

from pydantic import BaseModel, Field, PositiveInt

from atlas_tools.common.cli import echo, run_cli
from atlas_tools.wikidata.config import Config
from atlas_tools.wikidata.dump import extract_entities

DUMP_UNCOMPRESSED_GB = 140

_CLASSES = ["Q5", "Q4830453", "Q515", "Q571", "Q11424", "Q3305213"]


def _entity_line(i: int, *, last: bool) -> str:
    cls = _CLASSES[i % len(_CLASSES)]
    entity = {
        "type": "item",
        "id": f"Q{i + 1}",
        "labels": {
            "en": {"language": "en", "value": f"Synthetic entity {i:09d}"},
            "de": {"language": "de", "value": f"Synthetisches Objekt {i:09d}"},
        },
        "descriptions": {
            "en": {
                "language": "en",
                "value": "a synthetic benchmark entity with a plausible description length",
            }
        },
        "claims": {
            "P31": [
                {
                    "mainsnak": {
                        "snaktype": "value",
                        "property": "P31",
                        "datavalue": {
                            "type": "wikibase-entityid",
                            "value": {"entity-type": "item", "id": cls},
                        },
                    },
                    "type": "statement",
                    "rank": "normal",
                }
            ],
            # Ballast claims approximating real entity JSON weight.
            "P361": [
                {
                    "mainsnak": {
                        "snaktype": "value",
                        "property": "P361",
                        "datavalue": {
                            "type": "wikibase-entityid",
                            "value": {
                                "entity-type": "item",
                                "id": f"Q{(i % 1000) + 1}",
                            },
                        },
                    },
                    "type": "statement",
                    "rank": "normal",
                }
            ]
            * 3,
        },
        "sitelinks": {
            f"site{j}wiki": {
                "site": f"site{j}wiki",
                "title": f"Synthetic entity {i:09d}",
            }
            for j in range(i % 12)
        },
    }
    return json.dumps(entity, ensure_ascii=False) + ("\n" if last else ",\n")


def generate_slice(path: Path, target_bytes: int) -> int:
    written = 0
    with path.open("w", encoding="utf-8") as slice_file:
        written += slice_file.write("[\n")
        i = 0
        while written < target_bytes:
            i += 1
            written += slice_file.write(_entity_line(i, last=False))
        written += slice_file.write(_entity_line(i + 1, last=True))
        written += slice_file.write("]\n")
    return written


class ThroughputCli(BaseModel):
    """Measure dump-extractor throughput on a generated dump slice."""

    target_mb: PositiveInt = Field(default=50, description="Slice size to generate.")
    checkpoint_interval: PositiveInt = 100_000

    def cli_cmd(self) -> None:
        config = Config.model_validate(
            {"extraction": {"checkpoint_interval": self.checkpoint_interval}}
        )
        with tempfile.TemporaryDirectory(prefix="wikidata-bench-") as tmp:
            tmpdir = Path(tmp)
            slice_path = tmpdir / "slice.json"
            size = generate_slice(slice_path, self.target_mb * 1_000_000)
            size_mb = size / 1_000_000

            start = time.perf_counter()
            with slice_path.open("rb") as stream:
                summary = extract_entities(
                    stream,
                    config=config,
                    out_path=tmpdir / "entities.parquet",
                    checkpoint_dir=tmpdir / "ckpt",
                    input_name="benchmark-slice",
                    hash_rows=False,
                )
            elapsed = time.perf_counter() - start

            mb_per_s = size_mb / elapsed
            projected_hours = (DUMP_UNCOMPRESSED_GB * 1000) / mb_per_s / 3600
            echo(f"slice: {size_mb:.1f} MB, {summary.rows} entities")
            echo(f"elapsed: {elapsed:.2f} s -> {mb_per_s:.1f} MB/s")
            echo(
                f"projected for ~{DUMP_UNCOMPRESSED_GB} GB uncompressed:"
                f" {projected_hours:.1f} h (single stream, parse only)"
            )


def main(args: list[str] | None = None) -> None:
    """Run the dump-throughput benchmark CLI."""
    run_cli(ThroughputCli, args)


if __name__ == "__main__":
    main()
