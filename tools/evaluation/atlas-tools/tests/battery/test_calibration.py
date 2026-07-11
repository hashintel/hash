"""Calibration fixture + CLI tests (W3.2.1 calibration mechanism)."""

import numpy as np
import yaml
from atlas_tools.battery.calibrate import run_calibration
from atlas_tools.battery.cli import main
from atlas_tools.battery.datasets import load_dataset
from click.testing import CliRunner

from .conftest import FIXTURES_DIR

CALIBRATION_DIR = FIXTURES_DIR / "calibration"
LAYOUT = CALIBRATION_DIR / "layout.npz"
MANIFEST = CALIBRATION_DIR / "calibration.yaml"


def _perturbed_manifest(tmp_path, **overrides):
    manifest = yaml.safe_load(MANIFEST.read_text(encoding="utf-8"))
    manifest["expected"] = {**manifest["expected"], **overrides}
    path = tmp_path / "perturbed.yaml"
    path.write_text(yaml.safe_dump(manifest), encoding="utf-8")
    return path


def test_committed_fixture_passes_calibration():
    result = run_calibration(LAYOUT, MANIFEST)
    assert result["pass"], result["checks"]
    by_name = {c["name"]: c for c in result["checks"]}
    assert by_name["leaf_count"]["actual"] == 4.0
    assert by_name["leaf_count"]["tolerance_frac"] == 0.03
    assert by_name["normalized_persistence"]["tolerance_frac"] == 0.05


def test_perturbation_beyond_tolerance_fails(tmp_path):
    reference = yaml.safe_load(MANIFEST.read_text(encoding="utf-8"))
    np_expected = reference["expected"]["normalized_persistence"]

    # +10 % persistence: outside the ±5 % tolerance
    bad_np = _perturbed_manifest(tmp_path, normalized_persistence=np_expected * 1.10)
    result = run_calibration(LAYOUT, bad_np)
    assert not result["pass"]
    failing = {c["name"] for c in result["checks"] if not c["pass"]}
    assert failing == {"normalized_persistence"}

    # wrong leaf count: 4 vs 5 is far outside ±3 %
    bad_leaves = _perturbed_manifest(tmp_path, leaf_count=5)
    result = run_calibration(LAYOUT, bad_leaves)
    assert not result["pass"]

    # +4 % persistence stays within the ±5 % tolerance
    ok = _perturbed_manifest(tmp_path, normalized_persistence=np_expected * 1.04)
    assert run_calibration(LAYOUT, ok)["pass"]


def test_calibrate_cli_exit_codes(tmp_path):
    runner = CliRunner()
    good = runner.invoke(
        main, ["calibrate", "--layout", str(LAYOUT), "--manifest", str(MANIFEST)]
    )
    assert good.exit_code == 0, good.output
    assert '"pass": true' in good.output

    bad_manifest = _perturbed_manifest(tmp_path, leaf_count=40)
    bad = runner.invoke(
        main,
        ["calibrate", "--layout", str(LAYOUT), "--manifest", str(bad_manifest)],
    )
    assert bad.exit_code == 1


def test_generate_cli_writes_dataset(tmp_path):
    runner = CliRunner()
    out = tmp_path / "ds"
    result = runner.invoke(
        main,
        [
            "generate",
            "--shape",
            "bipartite_star",
            "--n",
            "200",
            "--dim",
            "8",
            "--seed",
            "5",
            "--params",
            '{"items_per_doc": 4}',
            "--out",
            str(out),
        ],
    )
    assert result.exit_code == 0, result.output
    ds = load_dataset(out)
    assert ds.shape == "bipartite_star"
    assert ds.n == 200
    assert ds.embeddings.shape == (200, 8)
    assert ds.config["items_per_doc"] == 4
    assert ds.seed == 5
    degree = np.bincount(ds.edges.ravel(), minlength=200)
    assert (degree[ds.truth["n_docs"] :] == 1).all()
