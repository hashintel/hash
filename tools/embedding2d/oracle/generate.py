from __future__ import annotations

import argparse
import importlib.metadata
import json
import platform
import shutil
import sys
from pathlib import Path
from typing import Any, Literal

import numpy as np
import scipy
import scipy.sparse as sp
from umap import umap_

sys.path.insert(0, str(Path(__file__).parent.parent))
from app.features import StructureFeatureParams, structure_features

GENERATOR_REVISION = 2
DEFAULT_OUTPUT = Path(__file__).parent / "fixtures" / "v1"
Stage = Literal["all", "semantic", "relation", "features", "fusion", "optimizer"]


class FixtureWriter:
    def __init__(self, output: Path, stage: Stage) -> None:
        self.output = output
        self.stage = stage
        self.files: dict[str, dict[str, Any]] = {}
        self.parameters: dict[str, Any] = {}

    def enabled(self, stage: str) -> bool:
        return self.stage == "all" or self.stage == stage

    def save(self, relative_path: str, value: np.ndarray) -> None:
        array = np.ascontiguousarray(value)
        path = self.output / relative_path
        path.parent.mkdir(parents=True, exist_ok=True)
        np.save(path, array, allow_pickle=False)
        self.files[relative_path] = {
            "dtype": array.dtype.str,
            "shape": list(array.shape),
        }

    def save_csr(self, prefix: str, matrix: Any) -> sp.csr_matrix:
        csr = canonical_csr(matrix)
        self.save(f"{prefix}-indptr.npy", csr.indptr.astype(np.int64))
        self.save(f"{prefix}-indices.npy", csr.indices.astype(np.int64))
        self.save(f"{prefix}-values.npy", csr.data.astype(np.float32))
        return csr

    def finish(self) -> None:
        manifest = {
            "fixture_format_revision": 1,
            "generator_revision": GENERATOR_REVISION,
            "stage": self.stage,
            "versions": {
                "python": platform.python_version(),
                "numpy": np.__version__,
                "scipy": scipy.__version__,
                "umap-learn": importlib.metadata.version("umap-learn"),
            },
            "parameters": self.parameters,
            "files": dict(sorted(self.files.items())),
        }
        (self.output / "manifest.json").write_text(
            json.dumps(manifest, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )


def canonical_csr(matrix: Any) -> sp.csr_matrix:
    csr = sp.csr_matrix(matrix, dtype=np.float32)
    csr.sum_duplicates()
    csr.eliminate_zeros()
    csr.sort_indices()
    return csr


def semantic_fixture(writer: FixtureWriter) -> sp.csr_matrix:
    knn_indices = np.array(
        [
            [0, 1, 2, 3, 4],
            [1, 0, 2, 3, 4],
            [2, 1, 0, 3, 5],
            [3, 2, 4, 1, 5],
            [4, 3, 5, 2, 6],
            [5, 4, 6, 3, 7],
            [6, 7, 5, 4, 3],
            [7, 6, 5, 4, 3],
        ],
        dtype=np.int64,
    )
    knn_distances = np.array(
        [
            [0.00, 0.00, 0.12, 0.45, 0.90],
            [0.00, 0.00, 0.20, 0.50, 0.85],
            [0.00, 0.20, 0.22, 0.25, 0.70],
            [0.00, 0.25, 0.28, 0.52, 0.60],
            [0.00, 0.28, 0.30, 0.48, 0.55],
            [0.00, 0.30, 0.32, 0.60, 0.62],
            [0.00, 0.10, 0.32, 0.55, 0.80],
            [0.00, 0.10, 0.62, 0.75, 0.90],
        ],
        dtype=np.float32,
    )
    local_connectivity = 1.0
    bandwidth = 1.0
    neighbors = knn_indices.shape[1]

    sigmas, rhos = umap_.smooth_knn_dist(
        knn_distances,
        float(neighbors),
        local_connectivity=local_connectivity,
        bandwidth=bandwidth,
    )
    rows, columns, values, _ = umap_.compute_membership_strengths(
        knn_indices,
        knn_distances,
        sigmas,
        rhos,
        return_dists=False,
    )

    directed = sp.coo_matrix(
        (values, (rows, columns)),
        shape=(knn_indices.shape[0], knn_indices.shape[0]),
        dtype=np.float32,
    )
    directed.eliminate_zeros()
    directed = canonical_csr(directed)

    transpose = directed.transpose()
    product = directed.multiply(transpose)
    fuzzy_union = canonical_csr(directed + transpose - product)

    if writer.enabled("semantic"):
        writer.parameters["semantic"] = {
            "bandwidth": bandwidth,
            "local_connectivity": local_connectivity,
            "neighbors": neighbors,
        }
        writer.save("semantic/knn-indices.npy", knn_indices)
        writer.save("semantic/knn-distances.npy", knn_distances)
        writer.save("semantic/sigmas.npy", sigmas.astype(np.float32))
        writer.save("semantic/rhos.npy", rhos.astype(np.float32))
        writer.save("semantic/membership-rows.npy", rows.astype(np.int64))
        writer.save("semantic/membership-indices.npy", columns.astype(np.int64))
        writer.save("semantic/membership-values.npy", values.astype(np.float32))
        writer.save_csr("semantic/directed", directed)
        writer.save_csr("semantic/fuzzy-union", fuzzy_union)

    return fuzzy_union


def top_k_per_row(matrix: sp.csr_matrix, k: int) -> sp.csr_matrix:
    row_count = matrix.indptr.size - 1
    keep = np.zeros(matrix.nnz, dtype=np.bool_)
    for row in range(row_count):
        start, stop = matrix.indptr[row], matrix.indptr[row + 1]
        if stop - start <= k:
            keep[start:stop] = True
        else:
            top = np.argpartition(matrix.data[start:stop], -k)[-k:]
            keep[start + top] = True

    rows = np.repeat(np.arange(row_count), np.diff(matrix.indptr))
    return canonical_csr(
        sp.coo_matrix(
            (matrix.data[keep], (rows[keep], matrix.indices[keep])),
            shape=(row_count, row_count),
        )
    )


def relation_fixture(writer: FixtureWriter) -> tuple[sp.csr_matrix, sp.csr_matrix]:
    rows = 8
    raw_edges = np.array(
        [
            [0, 1],
            [1, 0],
            [0, 1],
            [0, 2],
            [0, 3],
            [0, 4],
            [0, 5],
            [0, 6],
            [0, 7],
            [1, 2],
            [2, 1],
            [1, 3],
            [2, 3],
            [4, 5],
            [5, 4],
            [5, 6],
            [6, 7],
            [7, 7],
        ],
        dtype=np.int64,
    )
    hub_quantile = 0.75
    hub_min_ratio = 1.8
    shared_neighbors = 2
    shared_weight = 1.0
    hops = 2
    hop_decay = 0.5

    source, target = raw_edges[:, 0], raw_edges[:, 1]
    keep = source != target
    adjacency = sp.coo_matrix(
        (
            np.ones(np.count_nonzero(keep), dtype=np.float32),
            (source[keep], target[keep]),
        ),
        shape=(rows, rows),
    ).tocsr()
    adjacency = adjacency.maximum(adjacency.transpose()).tocsr()
    adjacency.data[:] = 1.0
    adjacency = canonical_csr(adjacency)

    degree_before = np.asarray(adjacency.sum(axis=1)).ravel().astype(np.float32)
    positive = degree_before[degree_before > 0]
    hub_cut = max(
        float(np.quantile(positive, hub_quantile)),
        hub_min_ratio * float(np.median(positive)),
    )
    hubs = np.nonzero(degree_before > hub_cut)[0].astype(np.int64)

    mask = np.ones(rows, dtype=np.float32)
    mask[hubs] = 0.0
    keep_diagonal = sp.diags(mask)
    adjacency = canonical_csr(keep_diagonal @ adjacency @ keep_diagonal)
    degree_after = np.asarray(adjacency.sum(axis=1)).ravel().astype(np.float32)

    with np.errstate(divide="ignore"):
        inverse_sqrt_degree = np.where(
            degree_after > 0,
            1.0 / np.sqrt(np.maximum(degree_after, 1.0e-12)),
            0.0,
        )
    degree_normalizer = sp.diags(inverse_sqrt_degree.astype(np.float32))
    direct = canonical_csr(degree_normalizer @ adjacency @ degree_normalizer)

    combined = direct
    if shared_neighbors:
        power = direct
        for hop in range(2, hops + 1):
            power = canonical_csr(direct @ power)
            power = canonical_csr(power - sp.diags(power.diagonal()))
            power = top_k_per_row(power, shared_neighbors)
            weight = shared_weight * hop_decay ** (hop - 2)
            shared = power.maximum(power.transpose()) * weight
            combined = canonical_csr(combined.maximum(shared))

    relation = canonical_csr(combined)
    if relation.nnz:
        relation.data /= relation.data.max()

    if writer.enabled("relation"):
        writer.parameters["relation"] = {
            "hop_decay": hop_decay,
            "hops": hops,
            "hub_min_ratio": hub_min_ratio,
            "hub_quantile": hub_quantile,
            "shared_neighbors": shared_neighbors,
            "shared_weight": shared_weight,
        }
        writer.save("relation/raw-edges.npy", raw_edges)
        writer.save("relation/degree-before-hub-removal.npy", degree_before)
        writer.save("relation/hub-cut.npy", np.array(hub_cut, dtype=np.float64))
        writer.save("relation/hubs.npy", hubs)
        writer.save("relation/degree-after-hub-removal.npy", degree_after)
        writer.save_csr("relation/adjacency", adjacency)
        writer.save_csr("relation/direct", direct)
        writer.save_csr("relation/combined", relation)

    return relation, adjacency


def feature_fixture(writer: FixtureWriter, adjacency: sp.csr_matrix) -> None:
    embeddings = np.array(
        [
            [1.0, 0.0, 0.0, 0.0],
            [0.8, 0.6, 0.0, 0.0],
            [0.7, 0.0, 0.7, 0.0],
            [0.5, 0.5, 0.5, 0.5],
            [0.0, 1.0, 0.0, 0.0],
            [0.0, 0.8, 0.6, 0.0],
            [0.0, 0.7, 0.0, 0.7],
            [0.0, 0.0, 1.0, 0.0],
        ],
        dtype=np.float32,
    )
    embeddings /= np.linalg.norm(embeddings, axis=1, keepdims=True)
    adjacency = canonical_csr(adjacency)
    rows, columns = adjacency.nonzero()
    edges = np.stack([rows, columns], axis=1).astype(np.int64)
    options = StructureFeatureParams(cap=2, salt=np.uint64(0x5EED_00D5))
    features, degree_normalizer = structure_features(
        embeddings,
        edges,
        params=options,
    )

    if writer.enabled("features"):
        writer.parameters["features"] = {
            "cap": options.cap,
            "degree_normalizer": degree_normalizer,
            "salt": int(options.salt),
        }
        writer.save("features/embeddings.npy", embeddings)
        writer.save_csr("features/adjacency", adjacency)
        writer.save("features/values.npy", features)


def fusion_fixture(
    writer: FixtureWriter,
    semantic: sp.csr_matrix,
    relation: sp.csr_matrix,
) -> dict[float, sp.csr_matrix]:
    alphas = (1.0, 0.65, 0.0)
    fused_graphs: dict[float, sp.csr_matrix] = {}

    for alpha in alphas:
        fused = (alpha * semantic + (1.0 - alpha) * relation).tocoo()
        fused.eliminate_zeros()
        fused_graphs[alpha] = canonical_csr(umap_.reset_local_connectivity(fused))

    if writer.enabled("fusion"):
        writer.parameters["fusion"] = {"alphas": list(alphas)}
        writer.save_csr("fusion/semantic", semantic)
        writer.save_csr("fusion/relation", relation)
        for alpha, graph in fused_graphs.items():
            tag = round(alpha * 100)
            writer.save_csr(f"fusion/fused-a{tag:03}", graph)

    return fused_graphs


def optimizer_fixture(writer: FixtureWriter, graph: sp.csr_matrix) -> None:
    epochs = 20
    completed_epoch_checkpoints = (1, 2, 5)
    min_dist = 0.1
    spread = 1.0
    initial_alpha = 1.0
    gamma = 1.0
    negative_sample_rate = 5.0
    seed = 42

    graph = canonical_csr(graph)
    threshold = float(graph.data.max()) / epochs
    graph.data[graph.data < threshold] = 0.0
    graph = canonical_csr(graph)
    coo = graph.tocoo()

    epochs_per_sample = umap_.make_epochs_per_sample(coo.data, epochs)
    epochs_per_negative_sample = epochs_per_sample / negative_sample_rate

    initial_layout = np.array(
        [
            [-2.0, -1.0],
            [-1.5, 0.4],
            [-0.5, -0.8],
            [0.2, 0.6],
            [1.2, -0.6],
            [1.8, 0.3],
            [2.4, -0.1],
            [3.0, 1.0],
        ],
        dtype=np.float32,
    )
    optimizer_initial_layout = (
        10.0
        * (initial_layout - np.min(initial_layout, axis=0))
        / (np.max(initial_layout, axis=0) - np.min(initial_layout, axis=0))
    ).astype(np.float32, order="C")

    a, b = umap_.find_ab_params(spread=spread, min_dist=min_dist)
    random_state = np.random.RandomState(seed)
    rng_state = random_state.randint(
        umap_.INT32_MIN,
        umap_.INT32_MAX,
        3,
    ).astype(np.int64)

    embedding = optimizer_initial_layout.copy()
    checkpoint_markers = [epoch - 1 for epoch in completed_epoch_checkpoints]
    checkpoint_markers.append(epochs)
    layouts = umap_.optimize_layout_euclidean(
        embedding,
        embedding,
        coo.row,
        coo.col,
        checkpoint_markers,
        graph.indptr.size - 1,
        epochs_per_sample,
        a,
        b,
        rng_state,
        gamma=gamma,
        initial_alpha=initial_alpha,
        negative_sample_rate=negative_sample_rate,
        parallel=False,
        verbose=False,
        move_other=True,
    )

    epoch_alphas = np.empty(epochs, dtype=np.float64)
    alpha = initial_alpha
    for epoch in range(epochs):
        epoch_alphas[epoch] = alpha
        alpha = initial_alpha * (1.0 - epoch / epochs)

    if writer.enabled("optimizer"):
        writer.parameters["optimizer"] = {
            "completed_epoch_checkpoints": list(completed_epoch_checkpoints),
            "epochs": epochs,
            "gamma": gamma,
            "initial_alpha": initial_alpha,
            "min_dist": min_dist,
            "negative_sample_rate": negative_sample_rate,
            "seed": seed,
            "spread": spread,
            "weak_edge_threshold": threshold,
        }
        writer.save_csr("optimizer/graph", graph)
        writer.save("optimizer/head.npy", coo.row.astype(np.int64))
        writer.save("optimizer/tail.npy", coo.col.astype(np.int64))
        writer.save("optimizer/weights.npy", coo.data.astype(np.float32))
        writer.save(
            "optimizer/epochs-per-sample.npy",
            epochs_per_sample.astype(np.float64),
        )
        writer.save(
            "optimizer/epochs-per-negative-sample.npy",
            epochs_per_negative_sample.astype(np.float64),
        )
        writer.save(
            "optimizer/epoch-of-next-sample.npy",
            epochs_per_sample.astype(np.float64),
        )
        writer.save(
            "optimizer/epoch-of-next-negative-sample.npy",
            epochs_per_negative_sample.astype(np.float64),
        )
        writer.save("optimizer/epoch-alphas.npy", epoch_alphas)
        writer.save("optimizer/ab.npy", np.array([a, b], dtype=np.float64))
        writer.save("optimizer/rng-state.npy", rng_state)
        writer.save("optimizer/initial-layout.npy", initial_layout)
        writer.save("optimizer/normalized-initial-layout.npy", optimizer_initial_layout)
        for completed_epochs, layout in zip(
            completed_epoch_checkpoints,
            layouts[:-1],
            strict=True,
        ):
            writer.save(
                f"optimizer/layout-epoch-{completed_epochs:03}.npy",
                layout.astype(np.float32),
            )
        writer.save("optimizer/final-layout.npy", layouts[-1].astype(np.float32))


def generate(stage: Stage, output: Path) -> None:
    if output.exists():
        shutil.rmtree(output)
    output.mkdir(parents=True)

    writer = FixtureWriter(output, stage)
    semantic = semantic_fixture(writer)
    relation, adjacency = relation_fixture(writer)
    feature_fixture(writer, adjacency)
    fused = fusion_fixture(writer, semantic, relation)
    optimizer_fixture(writer, fused[0.65])
    writer.finish()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate deterministic Atlas projection oracle fixtures."
    )
    parser.add_argument(
        "stage",
        choices=("all", "semantic", "relation", "features", "fusion", "optimizer"),
        nargs="?",
        default="all",
    )
    parser.add_argument(
        "--output",
        type=Path,
        help="output directory (defaults to fixtures/v1 for the all stage)",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if args.output is None:
        if args.stage != "all":
            raise SystemExit("--output is required when generating a single stage")
        output = DEFAULT_OUTPUT
    else:
        output = args.output.resolve()

    generate(args.stage, output)
    print(f"generated {args.stage} oracle fixture at {output}")


if __name__ == "__main__":
    main()
