"""End-to-end audit tests on the synthetic acceptance fixture.

The fixture is generated in-test (never committed): 10 well-separated cluster centroids
with signal only in dimensions 400..512 plus small independent noise, so a d=512 prefix
keeps the signal while a d=256 prefix sees mostly noise.
"""

import json
from pathlib import Path

import pytest

from atlas_tools.audit.evaluation import Dim, K
from atlas_tools.audit.runner import run_audit
from atlas_tools.audit.synthetic import make_synthetic, write_cluster_labels
from atlas_tools.common.knn import DEFAULT_MEMORY_CAP_BYTES
from atlas_tools.common.matrix import write_matrix

N_ROWS = 3000
DIM = 512


@pytest.fixture(scope="module")
def cluster_fixture(tmp_path_factory: pytest.TempPathFactory) -> tuple[Path, Path]:
    """Embeddings and strata paths for the corpus with signal in dimensions 400..512."""
    root = tmp_path_factory.mktemp("audit_fixture")
    corpus = make_synthetic(N_ROWS, DIM, n_clusters=10, signal_band=(400, 512), seed=0)

    embeddings = root / "synthetic.f32"
    write_matrix(embeddings, corpus.vectors, producer="tests.audit")

    strata = write_cluster_labels(root / "strata.parquet", corpus.cluster_labels)
    return embeddings, strata


def test_prefix_ordering_acceptance(cluster_fixture: tuple[Path, Path], tmp_path: Path) -> None:
    embeddings, _ = cluster_fixture
    report = run_audit(
        embeddings,
        tmp_path / "report",
        dims=[256, 512],
        ks=[15],
        sample=400,
        seed=0,
    )
    # dims/ks come back as ints on the model (coerced from JSON string keys).
    assert report.config.dims == [256, 512]
    assert report.config.ks == [15]

    metrics_256 = report.overall[Dim(256)][K(15)]
    metrics_512 = report.overall[Dim(512)][K(15)]
    # Signal lives in dimensions 400..512: d=512 keeps it, d=256 provably loses it.
    assert metrics_512.recall > 0.8
    assert metrics_256.recall < metrics_512.recall - 0.2
    # Intrusion moves the opposite direction: more truncation, more intruders.
    assert metrics_256.intrusion_rate > metrics_512.intrusion_rate
    # Displacement too: worse prefixes displace surviving neighbors further.
    assert metrics_256.mean_rank_displacement > metrics_512.mean_rank_displacement


def test_deterministic_across_runs(cluster_fixture: tuple[Path, Path], tmp_path: Path) -> None:
    embeddings, strata = cluster_fixture
    outputs: list[Path] = []
    for name in ("first", "second"):
        run_audit(
            embeddings,
            tmp_path / name,
            dims=[256, 512],
            ks=[15],
            sample=200,
            strata_path=strata,
            seed=7,
            min_group_size=10,
        )
        outputs.append(tmp_path / name)
    first, second = outputs

    assert (first / "report.json").read_bytes() == (second / "report.json").read_bytes()

    meta_a = json.loads((first / "report.meta.json").read_text())
    meta_b = json.loads((second / "report.meta.json").read_text())
    meta_a.pop("created_at")
    meta_b.pop("created_at")
    assert meta_a == meta_b  # only created_at may differ


def test_small_memory_cap_matches_default(
    cluster_fixture: tuple[Path, Path], tmp_path: Path
) -> None:
    embeddings, _ = cluster_fixture
    default_cap = run_audit(
        embeddings,
        tmp_path / "default_cap",
        dims=[256, 512],
        ks=[15],
        sample=200,
        seed=0,
        memory_cap_bytes=DEFAULT_MEMORY_CAP_BYTES,
    )
    # b = cap // (4 * (q + d)); with q=200, d=512 this cap forces ~64-row
    # blocks, i.e. ~47 corpus blocks instead of one.
    tiny_cap = 4 * (200 + DIM) * 64
    many_blocks = run_audit(
        embeddings,
        tmp_path / "tiny_cap",
        dims=[256, 512],
        ks=[15],
        sample=200,
        seed=0,
        memory_cap_bytes=tiny_cap,
    )
    assert many_blocks.overall == default_cap.overall
    assert many_blocks.flags == default_cap.flags


def test_dim_validation(cluster_fixture: tuple[Path, Path], tmp_path: Path) -> None:
    embeddings, _ = cluster_fixture
    with pytest.raises(ValueError, match="exceeds embedding dim"):
        run_audit(
            embeddings,
            tmp_path / "bad",
            dims=[1024],
            ks=[15],
            sample=100,
        )
