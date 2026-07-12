"""Kill -9 idempotence for the dump extractor.

SIGKILL the extractor mid-run, resume with the same arguments, and require
outputs identical to an uninterrupted run.
"""

import json
import os
import signal
import subprocess
import sys
import time
from pathlib import Path

import pyarrow.parquet as pq

PACKAGE_ROOT = Path(__file__).resolve().parents[2]


def _write_config(path: Path) -> None:
    # Small checkpoint interval so checkpoints appear quickly.
    path.write_text(
        "extraction:\n"
        "  languages: [en]\n"
        "  seed: 0\n"
        "  checkpoint_interval: 1000\n"
        "  dump:\n"
        '    date: "2025-06-01"\n'
        '    sha256: "feedfeed"\n',
        encoding="utf-8",
    )


def _write_big_dump(path: Path, n_entities: int) -> None:
    with path.open("w", encoding="utf-8") as dump_file:
        dump_file.write("[\n")
        for i in range(n_entities):
            entity = {
                "type": "item",
                "id": f"Q{i + 1}",
                "labels": {"en": {"language": "en", "value": f"Entity {i:07d}"}},
                "claims": {
                    "P31": [
                        {
                            "mainsnak": {
                                "snaktype": "value",
                                "property": "P31",
                                "datavalue": {
                                    "type": "wikibase-entityid",
                                    "value": {
                                        "entity-type": "item",
                                        "id": f"Q{(i % 9) + 2}",
                                    },
                                },
                            }
                        }
                    ]
                },
                "sitelinks": {
                    f"site{j}wiki": {"site": f"site{j}wiki", "title": f"E{i}"} for j in range(i % 5)
                },
            }
            suffix = ",\n" if i < n_entities - 1 else "\n"
            dump_file.write(json.dumps(entity) + suffix)
        dump_file.write("]\n")


def _cli_args(config: Path, dump: Path, out: Path, checkpoint_dir: Path) -> list[str]:
    return [
        sys.executable,
        "-m",
        "atlas_tools.wikidata.cli",
        "entity-manifest",
        "--config",
        str(config),
        "--input",
        str(dump),
        "--out",
        str(out),
        "--checkpoint",
        str(checkpoint_dir),
    ]


def _run_to_completion(args: list[str]) -> None:
    # The argv is built locally from sys.executable plus literals.
    subprocess.run(args, cwd=PACKAGE_ROOT, check=True, capture_output=True)


def _sidecar_without_created_at(path: Path) -> dict:
    with path.open(encoding="utf-8") as sidecar_file:
        data = json.load(sidecar_file)
    data.pop("created_at", None)
    return data


def _spawn_and_sigkill_after_first_checkpoint(
    args: list[str], checkpoint_file: Path, timeout_s: float = 60.0
) -> bool:
    """Start the extractor and SIGKILL it once its first checkpoint lands.

    Returns True if the process died by SIGKILL mid-run.
    """
    process = subprocess.Popen(
        args, cwd=PACKAGE_ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
    )
    deadline = time.monotonic() + timeout_s
    try:
        while time.monotonic() < deadline:
            if checkpoint_file.exists():
                break
            if process.poll() is not None:
                return False  # finished (or died) before any checkpoint
            time.sleep(0.002)
        if process.poll() is not None:
            return False  # raced to completion before we could kill it
        os.kill(process.pid, signal.SIGKILL)
        process.wait(timeout=30)
        return process.returncode == -signal.SIGKILL
    finally:
        if process.poll() is None:
            process.kill()
            process.wait(timeout=30)


def test_kill9_and_resume_matches_uninterrupted_run(tmp_path: Path) -> None:
    config = tmp_path / "config.yaml"
    dump = tmp_path / "dump.json"
    _write_config(config)

    interrupted_out = tmp_path / "interrupted" / "entities.parquet"
    interrupted_checkpoint_dir = tmp_path / "interrupted" / "ckpt"

    # Grow the input until the SIGKILL demonstrably lands mid-run (guards
    # against the process racing to completion on a fast machine).
    killed = False
    for n_entities in (60_000, 240_000, 960_000):
        _write_big_dump(dump, n_entities)
        if interrupted_checkpoint_dir.exists():
            for stale in interrupted_checkpoint_dir.glob("*"):
                stale.unlink()
        if interrupted_out.exists():
            interrupted_out.unlink()
        killed = _spawn_and_sigkill_after_first_checkpoint(
            _cli_args(config, dump, interrupted_out, interrupted_checkpoint_dir),
            interrupted_checkpoint_dir / "checkpoint.json",
        )
        if killed:
            break
    assert killed, "could not SIGKILL the extractor mid-run even at 960k entities"
    assert not interrupted_out.exists(), "final parquet must not exist after kill"

    # Resume with the same arguments to completion.
    _run_to_completion(_cli_args(config, dump, interrupted_out, interrupted_checkpoint_dir))

    # Uninterrupted reference run over the same input.
    baseline_out = tmp_path / "baseline" / "entities.parquet"
    _run_to_completion(_cli_args(config, dump, baseline_out, tmp_path / "baseline" / "ckpt"))

    interrupted_table = pq.read_table(interrupted_out)
    baseline_table = pq.read_table(baseline_out)
    assert interrupted_table.equals(baseline_table)
    assert interrupted_out.read_bytes() == baseline_out.read_bytes()

    interrupted_meta = _sidecar_without_created_at(
        interrupted_out.with_name(interrupted_out.name + ".meta.json")
    )
    baseline_meta = _sidecar_without_created_at(
        baseline_out.with_name(baseline_out.name + ".meta.json")
    )
    # Includes rows_sha256: row-level content hash equality.
    assert interrupted_meta == baseline_meta
