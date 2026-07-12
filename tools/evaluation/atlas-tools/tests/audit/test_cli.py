"""CLI tests via click.testing.CliRunner (offline, in-test fixtures only)."""

import json
from pathlib import Path

import numpy as np
from click.testing import CliRunner

from atlas_tools.audit.cli import main
from atlas_tools.audit.evaluation import Dim, RunnerProvenance, RunnerReport
from atlas_tools.common.matrix import load_matrix


def test_synth_fixture_writes_valid_matrix(tmp_path: Path) -> None:
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

    vectors, details = load_matrix(out)
    assert (details.rows, details.dim) == (200, 32)
    # Signal lives only in dimensions 16..32: the low block is pure small noise.
    assert np.abs(vectors[:, :16]).max() < 1.0
    assert np.abs(vectors[:, 16:]).max() > 1.0
    assert labels.exists()


def test_run_end_to_end_with_strata(tmp_path: Path) -> None:
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

    # On disk, dim/k map keys are JSON strings.
    raw_report = json.loads((out / "report.json").read_text())
    assert set(raw_report["overall"]) == {"16", "64"}
    assert set(raw_report["overall"]["16"]) == {"5", "10"}

    # The typed model coerces them back to ints.
    report = RunnerReport.model_validate_json((out / "report.json").read_text())
    assert sorted(report.overall) == [16, 64]
    assert sorted(report.overall[Dim(16)]) == [5, 10]
    assert report.groups  # strata groups were evaluated

    # Loading the envelope re-validates config_hash against config.
    provenance = RunnerProvenance.load(out / "report.meta.json")
    assert provenance.input_hashes is not None
    assert provenance.input_hashes["embeddings"]
    assert provenance.input_hashes["strata"]
    assert provenance.seed == 0
    assert provenance.details.sample_rows_sha256
    assert provenance.config_hash
    assert provenance.tool_version is not None
