"""Engine CLI + runner tests: real subprocesses through the same interface
the harness uses (shlex split, no shell, layout.npz artifact contract)."""

import numpy as np
import pytest

from atlas_tools.battery.datasets import write_dataset
from atlas_tools.battery.engine_runner import (
    EngineSpec,
    load_aligned_layout,
    load_engines,
    render_command,
    run_engine,
)
from atlas_tools.battery.generators import generate
from atlas_tools.common.layout import load_layout, write_layout

PCA = "{python} -m atlas_tools.battery.engines.pca_cli --embeddings {embeddings} --out {out} --seed {seed}"
SHUFFLE = "{python} -m atlas_tools.battery.engines.shuffle_cli --embeddings {embeddings} --out {out} --seed {seed}"
COLLAPSE = "{python} -m atlas_tools.battery.engines.collapse_cli --embeddings {embeddings} --out {out} --seed {seed} --scale 0.01"
CHEAT = "{python} -m atlas_tools.battery.engines.cheat_cli --embeddings {embeddings} --edges {edges} --out {out} --seed {seed}"
CHEAT_NO_EDGES = "{python} -m atlas_tools.battery.engines.cheat_cli --embeddings {embeddings} --out {out} --seed {seed}"


@pytest.fixture(scope="module")
def dataset_dir(tmp_path_factory):
    root = tmp_path_factory.mktemp("engine-cli-dataset")
    ds = generate("clique_communities", {"n": 150, "dim": 8}, seed=0)
    write_dataset(ds, root)
    return root, ds


def _run(template, dataset_dir, out_path, seed=0, name="test", no_edges=None):
    spec = EngineSpec(name=name, command=template, command_no_edges=no_edges)
    run_engine(spec, dataset_dir=dataset_dir, out_path=out_path, seed=seed)
    return load_aligned_layout(out_path, 150)


def test_pca_cli_valid_and_deterministic(tmp_path, dataset_dir):
    ds_dir, ds = dataset_dir
    a = _run(PCA, ds_dir, tmp_path / "a" / "layout.npz")
    b = _run(PCA, ds_dir, tmp_path / "b" / "layout.npz")
    assert a.xy.shape == (150, 2)
    assert np.array_equal(a.xy, b.xy)
    # provenance sidecar written with the source embedding hash
    provenance = load_layout(tmp_path / "a" / "layout.npz").provenance
    assert provenance is not None
    assert provenance.details.engine == "pca2d"
    assert provenance.details.source_embedding_hash is not None
    assert provenance.details.rows == 150


def test_shuffle_cli_permutes_coordinates_relative_to_row_id(tmp_path, dataset_dir):
    ds_dir, _ = dataset_dir
    pca = _run(PCA, ds_dir, tmp_path / "pca" / "layout.npz")
    shuffled = _run(SHUFFLE, ds_dir, tmp_path / "shuf" / "layout.npz")
    # same multiset of positions...
    assert np.allclose(np.sort(pca.xy, axis=0), np.sort(shuffled.xy, axis=0), atol=1e-6)
    # ...but decoupled from node identity
    assert not np.allclose(pca.xy, shuffled.xy)


def test_collapse_cli_scales_pca_coordinates(tmp_path, dataset_dir):
    ds_dir, _ = dataset_dir
    pca = _run(PCA, ds_dir, tmp_path / "pca" / "layout.npz")
    collapsed = _run(COLLAPSE, ds_dir, tmp_path / "col" / "layout.npz")
    assert np.allclose(collapsed.xy, pca.xy * 0.01, atol=1e-6)


def test_cheat_cli_manufactures_clusters_only_when_given_edges(tmp_path, dataset_dir):
    ds_dir, ds = dataset_dir
    with_edges = _run(CHEAT, ds_dir, tmp_path / "we" / "layout.npz")
    without = _run(CHEAT_NO_EDGES, ds_dir, tmp_path / "wo" / "layout.npz")

    # with edges: nodes snap to tight blobs on a radius-10 circle
    radii = np.linalg.norm(with_edges.xy.astype(np.float64), axis=1)
    degree = np.bincount(ds.edges.ravel(), minlength=ds.n)
    connected = degree > 0
    assert connected.sum() > 100
    assert np.abs(radii[connected] - 10.0).max() < 1.0
    # without edges: unstructured unit gaussian scatter, nowhere near r=10
    radii_no = np.linalg.norm(without.xy.astype(np.float64), axis=1)
    assert np.median(radii_no) < 3.0


def test_render_command_and_placeholder_errors():
    argv = render_command(
        "{python} -m x --embeddings {embeddings} --out {out}",
        {"python": "py", "embeddings": "/tmp/a dir/e.f32", "out": "/tmp/o.npz"},
    )
    # paths with spaces survive because substitution happens after splitting
    assert argv == [
        "py",
        "-m",
        "x",
        "--embeddings",
        "/tmp/a dir/e.f32",
        "--out",
        "/tmp/o.npz",
    ]
    with pytest.raises(ValueError, match="unknown placeholder"):
        render_command("{python} --nope {bogus}", {"python": "py"})


def test_engine_spec_no_edges_resolution():
    uses = EngineSpec("a", "run --edges {edges}", "run")
    assert uses.uses_edges and uses.resolve_no_edges_command() == "run"
    no_cmd = EngineSpec("b", "run --edges {edges}")
    assert no_cmd.resolve_no_edges_command() is None
    ignores = EngineSpec("c", "run --embeddings {embeddings}")
    assert not ignores.uses_edges
    assert ignores.resolve_no_edges_command() == ignores.command


def test_run_engine_failures(tmp_path, dataset_dir):
    ds_dir, _ = dataset_dir
    bad = EngineSpec("bad", "{python} -c 'import sys; sys.exit(3)'")
    with pytest.raises(RuntimeError, match="exit code 3"):
        run_engine(bad, dataset_dir=ds_dir, out_path=tmp_path / "layout.npz", seed=0)
    silent = EngineSpec("silent", "{python} -c 'pass'")
    with pytest.raises(RuntimeError, match="wrote no layout"):
        run_engine(silent, dataset_dir=ds_dir, out_path=tmp_path / "layout.npz", seed=0)
    edges_only = EngineSpec("e", "run --edges {edges}")
    with pytest.raises(ValueError, match="command_no_edges"):
        run_engine(
            edges_only,
            dataset_dir=ds_dir,
            out_path=tmp_path / "layout.npz",
            seed=0,
            use_edges=False,
        )


def test_load_aligned_layout_validation_and_realignment(tmp_path):
    xy = np.arange(10, dtype=np.float32).reshape(5, 2)
    perm = np.array([2, 0, 3, 4, 1], dtype=np.int64)
    write_layout(tmp_path / "layout.npz", xy, perm, engine="t")
    aligned = load_aligned_layout(tmp_path / "layout.npz", 5)
    # row j stores node perm[j]: node perm[j]'s coords must equal xy[j]
    assert np.array_equal(aligned.xy[perm], xy)

    with pytest.raises(ValueError, match="rows"):
        load_aligned_layout(tmp_path / "layout.npz", 6)
    write_layout(
        tmp_path / "bad.npz",
        xy,
        np.array([0, 0, 1, 2, 3], dtype=np.int64),
        engine="t",
    )
    with pytest.raises(ValueError, match="permutation"):
        load_aligned_layout(tmp_path / "bad.npz", 5)


def test_load_engines_validation(tmp_path):
    good = tmp_path / "engines.yaml"
    good.write_text(
        "version: 1\nengines:\n  - name: a\n    command: run\n", encoding="utf-8"
    )
    specs = load_engines(good)
    assert specs[0].name == "a"

    bad_version = tmp_path / "v.yaml"
    bad_version.write_text("version: 2\nengines: []\n", encoding="utf-8")
    with pytest.raises(ValueError, match="version: 1"):
        load_engines(bad_version)

    dup = tmp_path / "dup.yaml"
    dup.write_text(
        "version: 1\nengines:\n"
        "  - {name: a, command: run}\n  - {name: a, command: run}\n",
        encoding="utf-8",
    )
    with pytest.raises(ValueError, match="duplicate"):
        load_engines(dup)
