"""Harness acceptance tests (W3.3): end-to-end subprocess runs against the
committed smoke suite, including the adversarial engines.

The `adversarial_run` session fixture runs the smoke suite once with
pca2d + shuffle + collapse; several tests read from that single run. The
umap acceptance test runs the full default engine roster and is marked
``slow`` (umap subprocesses pay numba JIT costs).
"""

import json

import pandas as pd
import pytest
import yaml

from atlas_tools.battery.harness import load_suite, run_suite
from atlas_tools.common.provenance import read_sidecar

from .conftest import SMOKE_SUITE, write_engines_yaml

# Gates whose metrics depend on which node sits where. Merge-tree
# persistence is deliberately NOT here: it is identity-blind (a row shuffle
# preserves the multiset of positions), which is exactly why the suite
# pairs it with these.
STRUCTURE_METRICS = {
    "knn_recall_15",
    "knn_recall_30",
    "knn_recall_50",
    "trustworthiness",
    "continuity",
    "silhouette",
    "pendant_diffusion",
    "edge_binding",
}


def test_artifacts_exist_and_are_self_consistent(adversarial_run):
    result = adversarial_run
    out = result["out_dir"]
    for key in ("results_path", "report_path", "gates_path", "manifest_path"):
        assert result[key].exists(), key

    # results.parquet: tidy long format
    df = pd.read_parquet(result["results_path"])
    assert list(df.columns) == ["shape", "engine", "seed", "variant", "metric", "value"]
    assert set(df["engine"]) == {"pca2d", "shuffle", "collapse"}
    assert set(df["shape"]) == {
        "bipartite_star",
        "clique_communities",
        "chains",
        "lattice_product",
        "noise_edges",
        "isolates",
        "mixed",
    }
    assert set(df["seed"]) == {0, 1}
    expected_metrics = {
        "leaf_count",
        "total_persistence",
        "normalized_persistence",
        "knn_recall_15",
        "knn_recall_30",
        "knn_recall_50",
        "trustworthiness",
        "continuity",
        "silhouette",
        "pendant_diffusion",
        "edge_binding",
        "contraction_factor",
    }
    assert set(df["metric"]) == expected_metrics
    # none of these engines consume edges: exactly one variant per cell
    assert set(df["variant"]) == {"edges"}
    assert len(df) == 3 * 7 * 2 * len(expected_metrics)

    # gates.json matches the in-memory payload and the parquet numbers
    gates = json.loads(result["gates_path"].read_text())
    assert gates == result["gates"]
    assert gates["version"] == 1
    entry = next(
        e
        for e in gates["engines"]["pca2d"]["gates"]
        if e["metric"] == "knn_recall_15" and e["shape"] == "clique_communities"
    )
    sel = df[
        (df["engine"] == "pca2d")
        & (df["shape"] == "clique_communities")
        & (df["metric"] == "knn_recall_15")
    ]["value"]
    assert entry["value"] == pytest.approx(sel.mean())
    assert entry["noise_floor"] == pytest.approx(sel.max() - sel.min())

    # report.md: per-shape tables with noise-floor annotations
    report = result["report_path"].read_text()
    for shape in set(df["shape"]):
        assert f"## Shape: {shape}" in report
    assert "±" in report
    assert "rerun-noise floor" in report

    # manifest.json: config hashes + dataset hashes + seeds + versions
    manifest = read_sidecar(result["manifest_path"])
    assert manifest["details"]["suite_config_hash"]
    assert manifest["details"]["engines_config_hash"]
    assert manifest["config_hash"]
    assert manifest["details"]["seeds"] == [0, 1]
    assert set(manifest["details"]["datasets"]) == {
        f"{shape}-s{seed}" for shape in set(df["shape"]) for seed in (0, 1)
    }
    for hashes in manifest["details"]["datasets"].values():
        for key in (
            "embeddings_sha256",
            "edges_sha256",
            "labels_sha256",
            "truth_config_hash",
        ):
            assert hashes[key]
    assert "numpy" in manifest["details"]["versions"]

    # dataset + layout artifacts actually on disk
    assert (out / "datasets" / "mixed-s0" / "truth.json").exists()
    assert (out / "layouts" / "pca2d" / "mixed-s0" / "edges" / "layout.npz").exists()


def test_pca_baseline_passes_smoke_gates(adversarial_run):
    pca = adversarial_run["gates"]["engines"]["pca2d"]
    failed = [e for e in pca["gates"] if not e["pass"]]
    assert not failed, f"pca2d failed gates: {failed}"
    assert pca["noise_differential"]["pass"]
    assert pca["pass"]


def test_shuffle_fails_every_structure_gate(adversarial_run):
    shuffle = adversarial_run["gates"]["engines"]["shuffle"]
    assert not shuffle["pass"]
    structure_entries = [
        e for e in shuffle["gates"] if e["metric"] in STRUCTURE_METRICS
    ]
    assert structure_entries
    still_passing = [e for e in structure_entries if e["pass"]]
    assert not still_passing, f"shuffle passed structure gates: {still_passing}"
    # Documented blind spot: persistence is identity-blind, so the shuffle
    # sails through the persistence floor — the neighbor gates catch it.
    persistence_entries = [
        e for e in shuffle["gates"] if e["metric"] == "normalized_persistence"
    ]
    assert persistence_entries and all(e["pass"] for e in persistence_entries)


def test_collapse_gains_no_persistence_after_normalization(adversarial_run):
    """The contraction rig: normalized persistence must not exceed the pca
    baseline beyond the rerun-noise floor (it is pca2d scaled by 0.01)."""
    df = adversarial_run["df"]

    def stat(engine, shape):
        sel = df[
            (df["engine"] == engine)
            & (df["shape"] == shape)
            & (df["metric"] == "normalized_persistence")
            & (df["variant"] == "edges")
        ]["value"].dropna()
        return float(sel.mean()), float(sel.max() - sel.min())

    for shape in sorted(set(df["shape"])):
        collapse_mean, _ = stat("collapse", shape)
        pca_mean, pca_spread = stat("pca2d", shape)
        assert collapse_mean <= pca_mean + pca_spread + 1e-9, shape

    collapse = adversarial_run["gates"]["engines"]["collapse"]
    persistence_entries = [
        e for e in collapse["gates"] if e["metric"] == "normalized_persistence"
    ]
    assert persistence_entries and all(e["pass"] for e in persistence_entries)


def _mini_noise_suite(path):
    suite = {
        "version": 1,
        "name": "mini-noise",
        "seeds": [0, 1],
        "knn_ks": [15],
        "tc_neighbors": 15,
        "tc_sample": 300,
        "silhouette_sample": 500,
        "merge_tree": {"grid_size": 128, "bandwidth_px": 3.0},
        "datasets": [{"shape": "noise_edges", "n": 600, "params": {"dim": 16}}],
        "gates": [],
    }
    path.write_text(yaml.safe_dump(suite), encoding="utf-8")
    return path


def test_cheat_trips_noise_differential_and_fail_closed(tmp_path):
    """W3.2.8 acceptance: the cheating engine that manufactures clusters
    from random edges fails the hard differential; an engine that consumes
    edges without a no-edges command fails closed; an edges-ignoring engine
    passes trivially."""
    suite = _mini_noise_suite(tmp_path / "suite.yaml")
    engines_yaml = write_engines_yaml(
        tmp_path / "engines.yaml", ["pca2d", "cheat", "cheat_noeval"]
    )
    result = run_suite(suite, engines_yaml, tmp_path / "run", jobs=4)
    gates = result["gates"]["engines"]

    cheat = gates["cheat"]["noise_differential"]
    assert cheat["evaluated"]
    assert not cheat["pass"]
    failing = [c for c in cheat["checks"] if not c["pass"]]
    assert any(c["metric"] == "normalized_persistence" for c in failing)
    assert not gates["cheat"]["pass"]

    noeval = gates["cheat_noeval"]["noise_differential"]
    assert not noeval["pass"]
    assert "not evaluable" in noeval["reason"]
    assert not gates["cheat_noeval"]["pass"]

    pca = gates["pca2d"]["noise_differential"]
    assert pca["pass"]
    assert "does not consume" in pca["reason"]
    assert gates["pca2d"]["pass"]

    # the with/no-edges runs both exist in the tidy results
    df = result["df"]
    assert set(df[df["engine"] == "cheat"]["variant"]) == {"edges", "no_edges"}
    # contraction factor is reported against the same-seed no-edges twin
    contraction = df[
        (df["engine"] == "cheat")
        & (df["metric"] == "contraction_factor")
        & (df["variant"] == "edges")
    ]["value"].dropna()
    assert len(contraction) == 2


@pytest.mark.slow
def test_umap_baselines_pass_smoke_gates(tmp_path):
    """Acceptance: the tuned umap-learn baseline PASSES the default suite
    (smoke scale). Exercises the real with/no-edges differential path for
    umap_tuned, whose command consumes {edges} (and ignores them)."""
    engines_yaml = write_engines_yaml(
        tmp_path / "engines.yaml", ["pca2d", "umap_tuned", "umap_default"]
    )
    result = run_suite(SMOKE_SUITE, engines_yaml, tmp_path / "run", jobs=4)
    for name in ("umap_tuned", "umap_default", "pca2d"):
        engine = result["gates"]["engines"][name]
        failed = [e for e in engine["gates"] if not e["pass"]]
        assert not failed, f"{name} failed gates: {failed}"
        assert engine["noise_differential"]["pass"]
        assert engine["pass"]
    # umap_tuned's differential was actually evaluated from real runs
    tuned = result["gates"]["engines"]["umap_tuned"]["noise_differential"]
    assert tuned["evaluated"] and tuned["checks"]


def test_suite_loading_validation(tmp_path):
    ok = load_suite(SMOKE_SUITE)
    assert ok.version == 1
    assert ok.shapes().count("noise_edges") == 1
    assert ok.merge_tree.floor_frac == 0.005

    bad_version = tmp_path / "v.yaml"
    bad_version.write_text("version: 3\n", encoding="utf-8")
    # Pydantic's Literal[1] rejection message: "version ... Input should be 1".
    with pytest.raises(ValueError, match=r"version\s+Input should be 1"):
        load_suite(bad_version)

    bad_shape = tmp_path / "s.yaml"
    bad_shape.write_text(
        yaml.safe_dump(
            {
                "version": 1,
                "seeds": [0],
                "datasets": [{"shape": "nope", "n": 10}],
            }
        ),
        encoding="utf-8",
    )
    # Discriminated-union rejection names the bad tag and the known ones.
    with pytest.raises(ValueError, match="'nope'.*does not match any of the"):
        load_suite(bad_shape)

    bad_gate = tmp_path / "g.yaml"
    bad_gate.write_text(
        yaml.safe_dump(
            {
                "version": 1,
                "seeds": [0],
                "datasets": [{"shape": "chains", "n": 10}],
                "gates": [{"metric": "silhouette", "type": "between"}],
            }
        ),
        encoding="utf-8",
    )
    with pytest.raises(ValueError, match="type must be one of"):
        load_suite(bad_gate)
