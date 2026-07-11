"""CLI tests via click.testing.CliRunner (offline, in-test fixtures only)."""

import json

import numpy as np
from click.testing import CliRunner

from atlas_tools.audit.cli import main
from atlas_tools.common.matrix import load_matrix


def test_synth_fixture_writes_valid_matrix(tmp_path):
    out = tmp_path / "synth.f32"
    labels = tmp_path / "labels.parquet"
    result = CliRunner().invoke(
        main,
        [
            "synth-fixture",
            "--out",
            str(out),
            "--rows",
            "200",
            "--dim",
            "32",
            "--clusters",
            "4",
            "--signal-start",
            "16",
            "--noise-scale",
            "0.1",
            "--seed",
            "3",
            "--labels-out",
            str(labels),
        ],
    )
    assert result.exit_code == 0, result.output

    vectors, meta = load_matrix(out)
    assert (meta.rows, meta.dim) == (200, 32)
    # Signal lives only in dims 16..32: the low block is pure small noise.
    assert np.abs(vectors[:, :16]).max() < 1.0
    assert np.abs(vectors[:, 16:]).max() > 1.0
    assert labels.exists()


def test_run_end_to_end_with_strata(tmp_path):
    runner = CliRunner()
    embeddings = tmp_path / "synth.f32"
    strata = tmp_path / "strata.parquet"
    out = tmp_path / "report"

    result = runner.invoke(
        main,
        [
            "synth-fixture",
            "--out",
            str(embeddings),
            "--rows",
            "600",
            "--dim",
            "64",
            "--clusters",
            "6",
            "--signal-start",
            "48",
            "--seed",
            "1",
            "--labels-out",
            str(strata),
        ],
    )
    assert result.exit_code == 0, result.output

    result = runner.invoke(
        main,
        [
            "run",
            "--embeddings",
            str(embeddings),
            "--dims",
            "16,64",
            "--k",
            "5,10",
            "--sample",
            "150",
            "--strata",
            str(strata),
            "--out",
            str(out),
            "--seed",
            "0",
            "--min-group-size",
            "10",
        ],
    )
    assert result.exit_code == 0, result.output

    for name in ("report.json", "report.md", "report.meta.json"):
        assert (out / name).exists(), f"missing {name}"

    markdown = (out / "report.md").read_text()
    # One table per k.
    assert markdown.count("## k = ") == 2
    assert "| dim | recall@5 |" in markdown
    assert "| dim | recall@10 |" in markdown
    assert "## Strata" in markdown

    report = json.loads((out / "report.json").read_text())
    assert set(report["overall"]) == {"16", "64"}
    assert set(report["overall"]["16"]) == {"5", "10"}
    assert report["groups"]  # strata groups were evaluated

    meta = json.loads((out / "report.meta.json").read_text())
    assert meta["input_hashes"]["embeddings"]
    assert meta["input_hashes"]["strata"]
    assert meta["seed"] == 0
    assert meta["details"]["sample_rows_sha256"]
    assert meta["config_hash"]
    assert meta["tool_version"]
