"""Engine CLI and runner tests.

These run real subprocesses through the same interface the harness uses: shlex splitting, no
shell, and the layout.npz artifact contract.
"""

from pathlib import Path

import numpy as np
import pytest

from atlas_tools.battery.datasets import Dataset, write_dataset
from atlas_tools.battery.engine_runner import (
    EngineSpec,
    load_aligned_layout,
    load_engines,
    render_command,
    run_engine,
)
from atlas_tools.battery.generators import (
    CliqueCommunitiesGenerator,
    CliqueCommunitiesParams,
)
from atlas_tools.common.layout import LayoutArtifact, load_layout, write_layout

PCA = (
    "{python} -m atlas_tools.battery.engines.pca_cli"
    " --embeddings {embeddings} --out {out} --seed {seed}"
)
SHUFFLE = (
    "{python} -m atlas_tools.battery.engines.shuffle_cli"
    " --embeddings {embeddings} --out {out} --seed {seed}"
)
COLLAPSE = (
    "{python} -m atlas_tools.battery.engines.collapse_cli"
    " --embeddings {embeddings} --out {out} --seed {seed} --scale 0.01"
)
CHEAT = (
    "{python} -m atlas_tools.battery.engines.cheat_cli"
    " --embeddings {embeddings} --edges {edges} --out {out} --seed {seed}"
)
CHEAT_NO_EDGES = (
    "{python} -m atlas_tools.battery.engines.cheat_cli"
    " --embeddings {embeddings} --out {out} --seed {seed}"
)


@pytest.fixture(scope="module")
def dataset_dir(tmp_path_factory: pytest.TempPathFactory) -> tuple[Path, Dataset]:
    root = tmp_path_factory.mktemp("engine-cli-dataset")
    dataset = CliqueCommunitiesGenerator(n=150, params=CliqueCommunitiesParams(dim=8)).run(0)
    write_dataset(dataset, root)
    return root, dataset


def _run(
    template: str,
    dataset_dir: Path,
    out_path: Path,
    seed: int = 0,
    name: str = "test",
    no_edges: str | None = None,
) -> LayoutArtifact:
    spec = EngineSpec(name=name, command=template, command_no_edges=no_edges)
    run_engine(spec, dataset_dir=dataset_dir, out_path=out_path, seed=seed)
    return load_aligned_layout(out_path, 150)


def test_pca_cli_valid_and_deterministic(tmp_path: Path, dataset_dir: tuple[Path, Dataset]) -> None:
    dataset_directory, _ = dataset_dir
    a = _run(PCA, dataset_directory, tmp_path / "a" / "layout.npz")
    b = _run(PCA, dataset_directory, tmp_path / "b" / "layout.npz")
    assert a.xy.shape == (150, 2)
    assert np.array_equal(a.xy, b.xy)
    # provenance sidecar written with the source embedding hash
    provenance = load_layout(tmp_path / "a" / "layout.npz").provenance
    assert provenance is not None
    assert provenance.details.engine == "pca2d"
    assert provenance.details.source_embedding_hash is not None
    assert provenance.details.rows == 150


def test_shuffle_cli_permutes_coordinates_relative_to_row_id(
    tmp_path: Path, dataset_dir: tuple[Path, Dataset]
) -> None:
    dataset_directory, _ = dataset_dir
    pca = _run(PCA, dataset_directory, tmp_path / "pca" / "layout.npz")
    shuffled = _run(SHUFFLE, dataset_directory, tmp_path / "shuf" / "layout.npz")
    # same multiset of positions...
    assert np.allclose(np.sort(pca.xy, axis=0), np.sort(shuffled.xy, axis=0), atol=1e-6)
    # ...but decoupled from node identity
    assert not np.allclose(pca.xy, shuffled.xy)


def test_collapse_cli_scales_pca_coordinates(
    tmp_path: Path, dataset_dir: tuple[Path, Dataset]
) -> None:
    dataset_directory, _ = dataset_dir
    pca = _run(PCA, dataset_directory, tmp_path / "pca" / "layout.npz")
    collapsed = _run(COLLAPSE, dataset_directory, tmp_path / "col" / "layout.npz")
    assert np.allclose(collapsed.xy, pca.xy * 0.01, atol=1e-6)


def test_cheat_cli_manufactures_clusters_only_when_given_edges(
    tmp_path: Path, dataset_dir: tuple[Path, Dataset]
) -> None:
    dataset_directory, dataset = dataset_dir
    with_edges = _run(CHEAT, dataset_directory, tmp_path / "we" / "layout.npz")
    without = _run(CHEAT_NO_EDGES, dataset_directory, tmp_path / "wo" / "layout.npz")

    # with edges: nodes snap to tight blobs on a radius-10 circle
    radii = np.linalg.norm(with_edges.xy.astype(np.float64), axis=1)
    degree = np.bincount(dataset.edges.ravel(), minlength=dataset.n)
    connected = degree > 0
    assert connected.sum() > 100
    assert np.abs(radii[connected] - 10.0).max() < 1.0
    # without edges: unstructured unit gaussian scatter, nowhere near r=10
    radii_no = np.linalg.norm(without.xy.astype(np.float64), axis=1)
    assert np.median(radii_no) < 3.0


def test_render_command_and_placeholder_errors(tmp_path: Path) -> None:
    # A directory name with a space pins that substitution happens after splitting.
    embeddings_path = str(tmp_path / "a dir" / "e.f32")
    out_path = str(tmp_path / "o.npz")
    argv = render_command(
        "{python} -m x --embeddings {embeddings} --out {out}",
        {"python": "py", "embeddings": embeddings_path, "out": out_path},
    )
    assert argv == [
        "py",
        "-m",
        "x",
        "--embeddings",
        embeddings_path,
        "--out",
        out_path,
    ]
    with pytest.raises(ValueError, match="unknown placeholder"):
        render_command("{python} --nope {bogus}", {"python": "py"})


def test_engine_spec_no_edges_resolution() -> None:
    uses = EngineSpec(name="a", command="run --edges {edges}", command_no_edges="run")
    assert uses.uses_edges
    assert uses.resolve_no_edges_command() == "run"
    no_cmd = EngineSpec(name="b", command="run --edges {edges}")
    assert no_cmd.resolve_no_edges_command() is None
    ignores = EngineSpec(name="c", command="run --embeddings {embeddings}")
    assert not ignores.uses_edges
    assert ignores.resolve_no_edges_command() == ignores.command


def test_run_engine_failures(tmp_path: Path, dataset_dir: tuple[Path, Dataset]) -> None:
    dataset_directory, _ = dataset_dir
    bad = EngineSpec(name="bad", command="{python} -c 'import sys; sys.exit(3)'")
    with pytest.raises(RuntimeError, match="exit code 3"):
        run_engine(bad, dataset_dir=dataset_directory, out_path=tmp_path / "layout.npz", seed=0)
    silent = EngineSpec(name="silent", command="{python} -c 'pass'")
    with pytest.raises(RuntimeError, match="wrote no layout"):
        run_engine(
            silent,
            dataset_dir=dataset_directory,
            out_path=tmp_path / "layout.npz",
            seed=0,
        )
    edges_only = EngineSpec(name="e", command="run --edges {edges}")
    with pytest.raises(ValueError, match="command_no_edges"):
        run_engine(
            edges_only,
            dataset_dir=dataset_directory,
            out_path=tmp_path / "layout.npz",
            seed=0,
            use_edges=False,
        )


def test_load_aligned_layout_validation_and_realignment(tmp_path: Path) -> None:
    xy = np.arange(10, dtype=np.float32).reshape(5, 2)
    permutation = np.array([2, 0, 3, 4, 1], dtype=np.int64)
    write_layout(tmp_path / "layout.npz", xy, permutation, engine="t")
    aligned = load_aligned_layout(tmp_path / "layout.npz", 5)
    # row j stores node permutation[j], so that node's aligned coordinates equal xy[j]
    assert np.array_equal(aligned.xy[permutation], xy)

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


def test_load_engines_validation(tmp_path: Path) -> None:
    good = tmp_path / "engines.yaml"
    good.write_text("version: 1\nengines:\n  - name: a\n    command: run\n", encoding="utf-8")
    specs = load_engines(good)
    assert specs[0].name == "a"

    bad_version = tmp_path / "v.yaml"
    bad_version.write_text("version: 2\nengines: []\n", encoding="utf-8")
    # Pydantic's Literal[1] rejection message: "version ... Input should be 1".
    with pytest.raises(ValueError, match=r"version\s+Input should be 1"):
        load_engines(bad_version)

    dup = tmp_path / "dup.yaml"
    dup.write_text(
        "version: 1\nengines:\n  - {name: a, command: run}\n  - {name: a, command: run}\n",
        encoding="utf-8",
    )
    with pytest.raises(ValueError, match="unique names"):
        load_engines(dup)
