"""Suite harness (W3.3): ``battery run --suite ... --engines ... --out ...``.

Executes generators x engines x seeds, computes all metrics, and emits into
the output directory:

- ``datasets/<shape>-s<seed>/`` — dataset artifacts (see battery.datasets)
- ``layouts/<engine>/<shape>-s<seed>/<variant>/layout.npz`` — engine output
- ``results.parquet`` — tidy long format: one row per
  (shape, engine, seed, variant, metric) with a float ``value``
- ``report.md`` — per-shape tables; every number is annotated with the
  rerun-noise floor (spread = max - min across seed reruns)
- ``gates.json`` — structured pass/fail per configured threshold plus the
  hard noise differential (see battery.gates)
- ``manifest.json`` — suite/engine config hashes, dataset content hashes,
  seeds and library versions, so every number is reproducible from the
  manifest alone

Suite YAML schema (version 1)::

    version: 1
    name: smoke
    seeds: [0, 1]                    # dataset AND engine seed per rerun
    knn_ks: [15, 30, 50]
    tc_neighbors: 15                 # trustworthiness/continuity k
    tc_sample: 500                   # seeded query sample for trust/cont
    silhouette_sample: 1000          # seeded sample for silhouette
    merge_tree: {grid_size: 256, bandwidth_px: 3.0,
                 floor_frac: 0.005, persistence_frac: 0.05}
    datasets:
      - {shape: clique_communities, n: 800, params: {dim: 32}}
    gates: [...]                     # see battery.gates

Rerun-noise floor (W3.2.7): each of the ``seeds`` seeds a full rerun —
dataset generation AND the engine command — and the per-metric spread
(max - min) across reruns is reported as the noise floor. This floor is
slightly conservative (it includes dataset resampling variation, not just
engine nondeterminism), which only makes gates harder to pass.

No-edges variants: for every engine whose command consumes ``{edges}`` and
that defines ``command_no_edges``, the harness additionally runs the
edges-disabled variant on the ``noise_edges`` datasets. Those runs feed the
noise differential and the ``contraction_factor`` metric (layout std of the
with-edges layout relative to its same-seed no-relation twin); on shapes
without a no-edges twin, ``contraction_factor`` is null.
"""

from __future__ import annotations

import json
import os
from concurrent.futures import ThreadPoolExecutor
from importlib import metadata as importlib_metadata
from pathlib import Path
from typing import Any, Literal

import numpy as np
import pandas as pd
import yaml
from pydantic import BaseModel, DirectoryPath, Field

from atlas_tools.battery.datasets import write_dataset
from atlas_tools.battery.engine_runner import (
    EngineSpec,
    load_aligned_layout,
    load_engines,
    load_engines_raw,
    run_engine,
)
from atlas_tools.battery.gates import (
    NOISE_SHAPE,
    evaluate_gates,
    validate_gates_config,
)
from atlas_tools.battery.generators import REGISTRY, Generator, generate
from atlas_tools.battery.merge_tree import merge_tree_persistence
from atlas_tools.battery.metrics import (
    contraction_factor,
    edge_binding_ratio,
    knn_recall,
    pendant_diffusion,
    silhouette_on_labels,
    trustworthiness_continuity,
)
from atlas_tools.common.provenance import (
    JsonDict,
    Provenance,
    canonical_json_bytes,
    sha256_bytes,
)

SUITE_DEFAULTS: dict[str, Any] = {
    "knn_ks": [15, 30, 50],
    "tc_neighbors": 15,
    "tc_sample": 2000,
    "silhouette_sample": 5000,
    "merge_tree": {},
    "gates": [],
}

MERGE_TREE_DEFAULTS: dict[str, Any] = {
    "grid_size": 1024,
    "bandwidth_px": 4.0,
    "floor_frac": 0.005,
    "persistence_frac": 0.05,
}

METRIC_ORDER = [
    "leaf_count",
    "total_persistence",
    "normalized_persistence",
    "trustworthiness",
    "continuity",
    "silhouette",
    "pendant_diffusion",
    "edge_binding",
    "contraction_factor",
]

_VERSIONED_LIBS = ("numpy", "scipy", "scikit-learn", "umap-learn", "pandas", "pyarrow")


class MergeTreeConfig(BaseModel):
    grid_size: int = 1024
    bandwidth_px: float = 4.0
    floor_frac: float = 0.005
    persistence_frac: float = 0.05


class Suite(BaseModel):
    version: Literal[1]
    name: str
    seeds: list[int]
    knn_ks: list[int] = Field(default_factory=lambda: [15, 30, 50])
    tc_neighbors: int = 15
    tc_sample: int = 2000
    silhouette_sample: int = 5000
    merge_tree: MergeTreeConfig = Field(default_factory=MergeTreeConfig)
    datasets: list[Generator]


def load_suite(path: Path | str) -> dict[str, Any]:
    """Load and validate a versioned suite YAML; fill defaults."""
    with open(path, encoding="utf-8") as f:
        data = yaml.safe_load(f)
    if not isinstance(data, dict) or data.get("version") != 1:
        raise ValueError(f"{path}: suite config must declare 'version: 1'")
    suite = {**SUITE_DEFAULTS, **data}
    suite["name"] = str(suite.get("name") or Path(path).stem)
    seeds = suite.get("seeds")
    if not seeds or not all(isinstance(s, int) for s in seeds):
        raise ValueError(f"{path}: suite needs a non-empty integer 'seeds' list")
    datasets = suite.get("datasets")
    if not datasets:
        raise ValueError(f"{path}: suite lists no datasets")
    shapes = []
    for entry in datasets:
        shape = entry.get("shape")
        if shape not in REGISTRY:
            raise ValueError(
                f"{path}: unknown shape {shape!r}; known: {sorted(REGISTRY)}"
            )
        if shape in shapes:
            raise ValueError(f"{path}: duplicate shape {shape!r} in suite")
        shapes.append(shape)
        if not isinstance(entry.get("n"), int) or entry["n"] <= 0:
            raise ValueError(f"{path}: dataset {shape!r} needs positive int 'n'")
    suite["merge_tree"] = {**MERGE_TREE_DEFAULTS, **(suite.get("merge_tree") or {})}
    validate_gates_config(suite["gates"], shapes)
    return suite


class RunDetails(BaseModel):
    """Run-level facts recorded in ``manifest.json`` (the reproducibility
    contract: every reported number is derivable from this manifest)."""

    suite_path: Path
    engines_path: Path

    suite_config_hash: str
    engines_config_hash: str

    seeds: list[int]
    datasets: dict[str, dict[str, str]]
    versions: dict[str, str]


# The manifest embeds the resolved suite + engine configs verbatim as
# free-form JSON; the harness only hashes them.
RunProvenance = Provenance[RunDetails, JsonDict]


class _Task(BaseModel):
    spec: EngineSpec
    shape: str
    seed: int
    variant: Literal["edges", "no_edges"]
    dataset_dir: DirectoryPath
    layout_path: Path


def _compute_metrics(
    dataset: SuiteDataset, xy: np.ndarray, suite: dict[str, Any], seed: int
) -> dict[str, float | None]:
    mt_cfg = suite["merge_tree"]
    mt = merge_tree_persistence(
        xy,
        grid_size=mt_cfg["grid_size"],
        bandwidth_px=mt_cfg["bandwidth_px"],
        floor_frac=mt_cfg["floor_frac"],
        persistence_frac=mt_cfg["persistence_frac"],
    )
    metrics: dict[str, float | None] = {
        "leaf_count": float(mt.leaf_count),
        "total_persistence": mt.total_persistence,
        "normalized_persistence": mt.normalized_persistence,
    }
    metrics.update(knn_recall(xy, dataset.embeddings, suite["knn_ks"]))
    trust, continuity = trustworthiness_continuity(
        dataset.embeddings,
        xy,
        n_neighbors=suite["tc_neighbors"],
        sample_size=suite["tc_sample"],
        seed=seed,
    )
    metrics["trustworthiness"] = trust
    metrics["continuity"] = continuity
    metrics["silhouette"] = silhouette_on_labels(
        xy, dataset.labels, sample_size=suite["silhouette_sample"], seed=seed
    )
    metrics["pendant_diffusion"] = pendant_diffusion(xy, dataset.edges, dataset.labels)
    metrics["edge_binding"] = edge_binding_ratio(xy, dataset.edges, seed=seed)
    return metrics


def run_suite(
    suite_path: Path | str,
    engines_path: Path | str,
    out_dir: Path | str,
    *,
    jobs: int | None = None,
) -> dict[str, Any]:
    """Run the full battery; returns paths, the results frame and gates."""
    suite = load_suite(suite_path)
    engines = load_engines(engines_path)
    engines_raw = load_engines_raw(engines_path)
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    jobs = jobs or min(8, os.cpu_count() or 1)

    # 1. Generate all datasets (deterministic in (config, seed)).
    datasets: dict[tuple[str, int], tuple[SuiteDataset, Path]] = {}
    dataset_hashes: dict[str, dict[str, str]] = {}
    for entry in suite["datasets"]:
        for seed in suite["seeds"]:
            config = {"n": entry["n"], **(entry.get("params") or {})}
            dataset = generate(entry["shape"], config, seed)
            dataset_directory = out / "datasets" / f"{dataset.shape}-s{seed}"
            dataset_hashes[f"{dataset.shape}-s{seed}"] = write_dataset(
                dataset, dataset_directory
            )
            datasets[(dataset.shape, seed)] = (dataset, dataset_directory)

    # 2. Build the run matrix (plus no-edges twins on noise_edges).
    tasks: list[_Task] = []
    for spec in engines:
        for (shape, seed), (_, dataset_directory) in datasets.items():
            base = out / "layouts" / spec.name / f"{shape}-s{seed}"
            tasks.append(
                _Task(
                    spec=spec,
                    shape=shape,
                    seed=seed,
                    variant="edges",
                    dataset_dir=dataset_directory,
                    layout_path=base / "edges" / "layout.npz",
                )
            )
            if (
                shape == NOISE_SHAPE
                and spec.uses_edges
                and spec.command_no_edges is not None
            ):
                tasks.append(
                    _Task(
                        spec=spec,
                        shape=shape,
                        seed=seed,
                        variant="no_edges",
                        dataset_dir=dataset_directory,
                        layout_path=base / "no_edges" / "layout.npz",
                    )
                )

    # 3. Execute engine commands (parallel subprocesses).
    def _execute(task: _Task) -> None:
        run_engine(
            task.spec,
            dataset_dir=task.dataset_dir,
            out_path=task.layout_path,
            seed=task.seed,
            use_edges=task.variant == "edges",
        )

    with ThreadPoolExecutor(max_workers=jobs) as pool:
        list(pool.map(_execute, tasks))

    # 4. Load + align layouts, compute metrics.
    layouts: dict[tuple[str, str, int, str], np.ndarray] = {}
    metric_rows: list[dict[str, Any]] = []
    per_task_metrics: dict[tuple[str, str, int, str], dict[str, float | None]] = {}
    for task in tasks:
        dataset, _ = datasets[(task.shape, task.seed)]
        artifact = load_aligned_layout(task.layout_path, dataset.n)
        layouts[(task.spec.name, task.shape, task.seed, task.variant)] = artifact.xy
        per_task_metrics[(task.spec.name, task.shape, task.seed, task.variant)] = (
            _compute_metrics(dataset, artifact.xy, suite, task.seed)
        )

    for task in tasks:
        key = (task.spec.name, task.shape, task.seed, task.variant)
        metrics = per_task_metrics[key]
        if task.variant == "edges":
            twin = layouts.get((task.spec.name, task.shape, task.seed, "no_edges"))
            metrics["contraction_factor"] = (
                contraction_factor(layouts[key], twin) if twin is not None else None
            )
        else:
            metrics["contraction_factor"] = None
        for metric, value in metrics.items():
            metric_rows.append(
                {
                    "shape": task.shape,
                    "engine": task.spec.name,
                    "seed": task.seed,
                    "variant": task.variant,
                    "metric": metric,
                    "value": float(value) if value is not None else np.nan,
                }
            )

    df = pd.DataFrame(
        metric_rows, columns=["shape", "engine", "seed", "variant", "metric", "value"]
    )
    results_path = out / "results.parquet"
    df.to_parquet(results_path, index=False)

    # 5. Gates.
    gates_payload = evaluate_gates(df, suite, engines)
    gates_path = out / "gates.json"
    gates_path.write_text(
        json.dumps(gates_payload, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )

    # 6. Manifest (hashes exclude created_at by provenance convention).
    suite_hash = sha256_bytes(canonical_json_bytes(suite))
    engines_hash = sha256_bytes(canonical_json_bytes(engines_raw))
    versions = {"python": _python_version()}
    for lib in _VERSIONED_LIBS:
        try:
            versions[lib] = importlib_metadata.version(lib)
        except importlib_metadata.PackageNotFoundError:  # pragma: no cover
            versions[lib] = "unknown"
    manifest = RunProvenance.make(
        producer="battery.run",
        config={"suite": suite, "engines": engines_raw},
        details=RunDetails(
            suite_path=str(suite_path),
            engines_path=str(engines_path),
            suite_config_hash=suite_hash,
            engines_config_hash=engines_hash,
            seeds=list(suite["seeds"]),
            datasets=dataset_hashes,
            versions=versions,
        ),
    )
    manifest_path = manifest.write(out / "manifest.json")

    # 7. Report.
    report = _render_report(df, suite, engines, gates_payload, suite_hash, engines_hash)
    report_path = out / "report.md"
    report_path.write_text(report, encoding="utf-8")

    return {
        "out_dir": out,
        "results_path": results_path,
        "report_path": report_path,
        "gates_path": gates_path,
        "manifest_path": manifest_path,
        "df": df,
        "gates": gates_payload,
        "suite": suite,
    }


def _python_version() -> str:
    import platform

    return platform.python_version()


def _render_report(
    df: pd.DataFrame,
    suite: dict[str, Any],
    engines: list[EngineSpec],
    gates_payload: dict[str, Any],
    suite_hash: str,
    engines_hash: str,
) -> str:
    """Per-shape tables. Every cell is ``mean ±spread`` where the spread
    (max - min across seed reruns) is the rerun-noise floor annotation."""
    metric_names = [f"knn_recall_{k}" for k in suite["knn_ks"]] + METRIC_ORDER
    engine_names = [spec.name for spec in engines]
    lines = [
        f"# Battery report: {suite['name']}",
        "",
        f"- suite config hash: `{suite_hash}`",
        f"- engines config hash: `{engines_hash}`",
        f"- seeds (reruns): {list(suite['seeds'])}",
        "",
        "Every value is `mean ±spread` across seed reruns; the spread"
        " (max − min) is the rerun-noise floor that annotates all"
        " comparative claims. `—` marks a metric that is not applicable"
        " to a shape.",
        "",
    ]
    for entry in suite["datasets"]:
        shape = entry["shape"]
        lines.append(f"## Shape: {shape} (n={entry['n']})")
        lines.append("")
        lines.append("| metric | " + " | ".join(engine_names) + " |")
        lines.append("|---" * (len(engine_names) + 1) + "|")
        for metric in metric_names:
            cells = []
            for name in engine_names:
                sel = df[
                    (df["engine"] == name)
                    & (df["shape"] == shape)
                    & (df["metric"] == metric)
                    & (df["variant"] == "edges")
                ]["value"].dropna()
                if len(sel) == 0:
                    cells.append("—")
                else:
                    cells.append(f"{sel.mean():.4f} ±{(sel.max() - sel.min()):.4f}")
            lines.append(f"| {metric} | " + " | ".join(cells) + " |")
        lines.append("")

    lines.append("## Gates")
    lines.append("")
    for name in engine_names:
        result = gates_payload["engines"][name]
        status = "PASS" if result["pass"] else "FAIL"
        lines.append(f"### {name}: {status}")
        lines.append("")
        failed = [e for e in result["gates"] if not e["pass"]]
        if failed:
            lines.append("Failed gate entries:")
            for e in failed:
                lines.append(
                    f"- `{e['metric']}` [{e['type']}] on `{e['shape']}`: {e['reason']}"
                )
        else:
            lines.append("All configured gate entries passed.")
        nd = result["noise_differential"]
        nd_status = "PASS" if nd["pass"] else "FAIL"
        lines.append(f"- noise differential: {nd_status} — {nd['reason']}")
        lines.append("")
    return "\n".join(lines) + "\n"
