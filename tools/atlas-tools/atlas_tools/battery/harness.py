"""Suite harness behind ``battery run --suite ... --engines ... --out ...``.

Executes generators x engines x seeds, computes all metrics, and emits into the output
directory:

- ``datasets/<shape>-s<seed>/``: dataset artifacts (see :mod:`atlas_tools.battery.datasets`).
- ``layouts/<engine>/<shape>-s<seed>/<variant>/layout.npz``: engine output.
- ``results.parquet``: tidy long format, one row per (shape, engine, seed, variant, metric)
  with a float ``value``.
- ``report.md``: per-shape tables; every number is annotated with the rerun-noise floor
  (spread = max - min across seed reruns).
- ``gates.json``: the :class:`atlas_tools.battery.gates.GatesReport` dump, structured pass/fail
  per configured threshold plus the hard noise differential.
- ``manifest.json``: suite and engine config hashes, dataset content hashes, seeds, and library
  versions, so every number is reproducible from the manifest alone.

Suite YAML schema (version 1)::

    version: 1
    name: smoke
    seeds: [0, 1]                    # seeds both the dataset and the engine per rerun
    knn_ks: [15, 30, 50]
    tc_neighbors: 15                 # trustworthiness/continuity k
    tc_sample: 500                   # seeded query sample for trustworthiness/continuity
    silhouette_sample: 1000          # seeded sample for silhouette
    merge_tree: {grid_size: 256, bandwidth_px: 3.0,
                 floor_frac: 0.005, persistence_frac: 0.05}
    datasets:
      - {shape: clique_communities, n: 800, params: {dim: 32}}
    gates: [...]                     # see battery.gates

Rerun-noise floor: each entry in ``seeds`` seeds a full rerun, covering dataset generation and
the engine command, and the per-metric spread (max - min) across reruns is reported as the
noise floor. This floor is slightly conservative (it includes dataset resampling variation, not
just engine nondeterminism), which only makes gates harder to pass.

No-edges variants: for every engine whose command consumes ``{edges}`` and that defines
``command_no_edges``, the harness additionally runs the edges-disabled variant on the
``noise_edges`` datasets. Those runs feed the noise differential and the ``contraction_factor``
metric (layout std of the with-edges layout relative to its same-seed no-relation twin); on
shapes without a no-edges twin, ``contraction_factor`` is null.
"""

import os
import platform
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from importlib import metadata as importlib_metadata
from pathlib import Path
from typing import Final, Literal, Self

import numpy as np
import pandas as pd
import yaml
from pydantic import (
    BaseModel,
    ConfigDict,
    DirectoryPath,
    Field,
    PositiveInt,
    model_validator,
)

from atlas_tools.battery.datasets import (
    Dataset,
    DatasetHashes,
    StrPath,
    write_dataset,
)
from atlas_tools.battery.engine_runner import (
    EngineFile,
    EngineSpec,
    load_aligned_layout,
    load_engine_file,
    run_engine,
)
from atlas_tools.battery.gates import (
    NOISE_SHAPE,
    GateConfig,
    GatesReport,
    Variant,
    evaluate_gates,
)
from atlas_tools.battery.generators import Generator
from atlas_tools.battery.merge_tree import MergeTreeConfig, merge_tree_persistence
from atlas_tools.battery.metrics import (
    KnnRecallMetric,
    LayoutMetrics,
    contraction_factor,
    edge_binding_ratio,
    knn_recall,
    metric_column,
    metric_columns,
    pendant_diffusion,
    silhouette_on_labels,
    trustworthiness_continuity,
)
from atlas_tools.common.data import K, Sha256Hex
from atlas_tools.common.provenance import (
    Provenance,
    canonical_json_bytes,
    sha256_bytes,
    write_sidecar,
)

_VERSIONED_LIBS: Final = (
    "numpy",
    "scipy",
    "scikit-learn",
    "umap-learn",
    "pandas",
    "pyarrow",
)

_RESULT_COLUMNS: Final = ("shape", "engine", "seed", "variant", "metric", "value")


def _default_knn_ks() -> list[K]:
    return [K(15), K(30), K(50)]


class Suite(BaseModel):
    version: Literal[1]
    # Defaults to the suite file's stem when omitted (see load_suite).
    name: str = ""
    seeds: list[int] = Field(min_length=1)
    knn_ks: list[K] = Field(default_factory=_default_knn_ks, min_length=1)
    tc_neighbors: PositiveInt = 15
    tc_sample: PositiveInt = 2000
    silhouette_sample: PositiveInt = 5000
    merge_tree: MergeTreeConfig = Field(default_factory=MergeTreeConfig)
    datasets: list[Generator] = Field(min_length=1)
    gates: list[GateConfig] = Field(default_factory=list)

    model_config = ConfigDict(extra="forbid")

    @model_validator(mode="after")
    def check_unique_shapes(self) -> Self:
        shapes = self.shapes()
        duplicates = sorted({shape for shape in shapes if shapes.count(shape) > 1})

        if duplicates:
            raise ValueError(f"duplicate shapes in suite: {duplicates}")

        return self

    @model_validator(mode="after")
    def check_gates_scoped_to_suite(self) -> Self:
        """Reject gates naming shapes or knn ks that the suite does not compute."""
        shapes = set(self.shapes())
        ks = set(self.knn_ks)

        for index, gate in enumerate(self.gates):
            label = f"gate #{index} ({metric_column(gate.metric)})"

            unknown = [shape for shape in gate.shapes or [] if shape not in shapes]
            if unknown:
                raise ValueError(f"{label}: shapes {unknown} not in suite shapes {sorted(shapes)}")

            if isinstance(gate.metric, KnnRecallMetric) and gate.metric.k not in ks:
                raise ValueError(f"{label}: k={gate.metric.k} not in suite knn_ks {sorted(ks)}")

        return self

    def shapes(self) -> list[str]:
        return [generator.shape for generator in self.datasets]


def load_suite(path: StrPath) -> Suite:
    """Load and validate a versioned suite YAML; fill defaults."""
    data = yaml.safe_load(Path(path).read_text(encoding="utf-8"))

    suite = Suite.model_validate(data)
    if not suite.name:
        suite.name = Path(path).stem

    return suite


class RunDetails(BaseModel):
    """Run-level facts recorded in ``manifest.json``.

    This is the reproducibility contract: every reported number is derivable from the manifest.
    """

    suite_path: Path
    engines_path: Path

    suite_config_hash: Sha256Hex
    engines_config_hash: Sha256Hex

    seeds: list[int]
    datasets: dict[str, DatasetHashes]
    versions: dict[str, str]


class RunConfig(BaseModel):
    """The resolved suite and engine configs, embedded verbatim in the manifest.

    The pair is hashed into the manifest's ``config_hash``.
    """

    suite: Suite
    engines: EngineFile


RunProvenance = Provenance[RunDetails, RunConfig]


@dataclass(frozen=True)
class RunResult:
    """Everything ``battery run`` produced, in memory and on disk."""

    out_dir: Path
    results_path: Path
    report_path: Path
    gates_path: Path
    manifest_path: Path
    results: pd.DataFrame
    gates: GatesReport
    suite: Suite


class _Task(BaseModel):
    spec: EngineSpec
    shape: str
    seed: int
    variant: Variant
    dataset_dir: DirectoryPath
    layout_path: Path


def _compute_metrics(
    dataset: Dataset,
    xy: np.ndarray,
    suite: Suite,
    seed: int,
    *,
    baseline_xy: np.ndarray | None,
) -> LayoutMetrics:
    """Compute all metrics of one run.

    ``baseline_xy`` is the same-seed no-edges twin layout; ``None`` (when the engine has no such
    twin on this shape) makes the contraction factor not applicable.
    """
    merge_tree = merge_tree_persistence(xy, suite.merge_tree)
    trust, continuity = trustworthiness_continuity(
        dataset.embeddings,
        xy,
        n_neighbors=suite.tc_neighbors,
        sample_size=suite.tc_sample,
        seed=seed,
    )

    return LayoutMetrics(
        leaf_count=float(merge_tree.leaf_count),
        total_persistence=merge_tree.total_persistence,
        normalized_persistence=merge_tree.normalized_persistence,
        knn_recall=knn_recall(xy, dataset.embeddings, suite.knn_ks),
        trustworthiness=trust,
        continuity=continuity,
        silhouette=silhouette_on_labels(
            xy, dataset.labels, sample_size=suite.silhouette_sample, seed=seed
        ),
        pendant_diffusion=pendant_diffusion(xy, dataset.edges, dataset.labels),
        edge_binding=edge_binding_ratio(xy, dataset.edges, seed=seed),
        contraction_factor=(
            contraction_factor(xy, baseline_xy) if baseline_xy is not None else None
        ),
    )


def _generate_datasets(
    suite: Suite, out: Path
) -> tuple[dict[tuple[str, int], tuple[Dataset, Path]], dict[str, DatasetHashes]]:
    """Generate and write every (shape, seed) dataset; deterministic in (generator, seed)."""
    datasets: dict[tuple[str, int], tuple[Dataset, Path]] = {}
    dataset_hashes: dict[str, DatasetHashes] = {}

    for generator in suite.datasets:
        for seed in suite.seeds:
            dataset = generator.run(seed)
            dataset_directory = out / "datasets" / f"{dataset.shape}-s{seed}"
            dataset_hashes[f"{dataset.shape}-s{seed}"] = write_dataset(dataset, dataset_directory)

            datasets[(dataset.shape, seed)] = (dataset, dataset_directory)

    return datasets, dataset_hashes


def _build_tasks(
    engines: list[EngineSpec],
    datasets: dict[tuple[str, int], tuple[Dataset, Path]],
    out: Path,
) -> list[_Task]:
    """Build the run matrix: every engine on every dataset, plus no-edges twins on noise_edges."""
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

            if shape == NOISE_SHAPE and spec.uses_edges and spec.command_no_edges is not None:
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

    return tasks


def _execute_tasks(tasks: list[_Task], jobs: int) -> None:
    """Execute the engine commands as parallel subprocesses."""

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


def _results_frame(
    tasks: list[_Task],
    datasets: dict[tuple[str, int], tuple[Dataset, Path]],
    suite: Suite,
) -> pd.DataFrame:
    """Load and align the produced layouts, compute all metrics, and build the tidy frame.

    The with-edges variant sees its same-seed no-edges twin (when one was run) so the
    contraction factor can compare against it.
    """
    layouts: dict[tuple[str, str, int, Variant], np.ndarray] = {}

    for task in tasks:
        dataset, _ = datasets[(task.shape, task.seed)]
        artifact = load_aligned_layout(task.layout_path, dataset.n)
        layouts[(task.spec.name, task.shape, task.seed, task.variant)] = artifact.xy

    rows: list[tuple[str, str, int, str, str, float]] = []

    for task in tasks:
        dataset, _ = datasets[(task.shape, task.seed)]
        xy = layouts[(task.spec.name, task.shape, task.seed, task.variant)]
        baseline_xy = (
            layouts.get((task.spec.name, task.shape, task.seed, "no_edges"))
            if task.variant == "edges"
            else None
        )

        metrics = _compute_metrics(dataset, xy, suite, task.seed, baseline_xy=baseline_xy)

        for column, value in metrics.column_values().items():
            rows.append(
                (
                    task.shape,
                    task.spec.name,
                    task.seed,
                    task.variant,
                    column,
                    float(value) if value is not None else np.nan,
                )
            )

    return pd.DataFrame(rows, columns=pd.Index(_RESULT_COLUMNS))


def _library_versions() -> dict[str, str]:
    """Collect the python and library versions recorded in the manifest."""
    versions = {"python": platform.python_version()}

    for library in _VERSIONED_LIBS:
        try:
            versions[library] = importlib_metadata.version(library)
        except importlib_metadata.PackageNotFoundError:  # pragma: no cover
            versions[library] = "unknown"

    return versions


def run_suite(
    suite_path: StrPath,
    engines_path: StrPath,
    out_dir: StrPath,
    *,
    jobs: int | None = None,
) -> RunResult:
    """Run the full battery; return paths, the results frame, and the gates report."""
    suite = load_suite(suite_path)
    engine_file = load_engine_file(engines_path)
    engines = engine_file.engines

    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    jobs = jobs or min(8, os.cpu_count() or 1)

    datasets, dataset_hashes = _generate_datasets(suite, out)
    tasks = _build_tasks(engines, datasets, out)
    _execute_tasks(tasks, jobs)

    frame = _results_frame(tasks, datasets, suite)
    results_path = out / "results.parquet"
    frame.to_parquet(results_path, index=False)

    gates_report = evaluate_gates(
        frame, engines, suite_shapes=suite.shapes(), gate_configs=suite.gates
    )
    gates_path = write_sidecar(out / "gates.json", gates_report.model_dump(mode="json"))

    # Manifest hashes exclude created_at by provenance convention.
    suite_hash = sha256_bytes(canonical_json_bytes(suite))
    engines_hash = sha256_bytes(canonical_json_bytes(engine_file))

    manifest = RunProvenance.make(
        producer="battery.run",
        config=RunConfig(suite=suite, engines=engine_file),
        details=RunDetails(
            suite_path=Path(suite_path),
            engines_path=Path(engines_path),
            suite_config_hash=suite_hash,
            engines_config_hash=engines_hash,
            seeds=suite.seeds,
            datasets=dataset_hashes,
            versions=_library_versions(),
        ),
    )
    manifest_path = manifest.write(out / "manifest.json")

    report = _render_report(frame, suite, engines, gates_report, suite_hash, engines_hash)
    report_path = out / "report.md"
    report_path.write_text(report, encoding="utf-8")

    return RunResult(
        out_dir=out,
        results_path=results_path,
        report_path=report_path,
        gates_path=gates_path,
        manifest_path=manifest_path,
        results=frame,
        gates=gates_report,
        suite=suite,
    )


def _render_report(
    frame: pd.DataFrame,
    suite: Suite,
    engines: list[EngineSpec],
    gates_report: GatesReport,
    suite_hash: str,
    engines_hash: str,
) -> str:
    """Render the Markdown report: per-shape metric tables plus the gate verdicts.

    Every cell shows the mean across seed reruns and its spread (max - min), the rerun-noise
    floor that annotates all comparative claims.
    """
    metric_names = metric_columns(suite.knn_ks)
    engine_names = [spec.name for spec in engines]

    lines = [
        f"# Battery report: {suite.name}",
        "",
        f"- suite config hash: `{suite_hash}`",
        f"- engines config hash: `{engines_hash}`",
        f"- seeds (reruns): {list(suite.seeds)}",
        "",
        "Every value is `mean ±spread` across seed reruns; the spread"
        " (max - min) is the rerun-noise floor that annotates all"
        " comparative claims. `—` marks a metric that is not applicable"
        " to a shape.",
        "",
    ]

    for generator in suite.datasets:
        shape = generator.shape
        lines.append(f"## Shape: {shape} (n={generator.n})")
        lines.append("")
        lines.append("| metric | " + " | ".join(engine_names) + " |")
        lines.append("|---" * (len(engine_names) + 1) + "|")
        for metric in metric_names:
            cells = []
            for name in engine_names:
                selection = frame[
                    (frame["engine"] == name)
                    & (frame["shape"] == shape)
                    & (frame["metric"] == metric)
                    & (frame["variant"] == "edges")
                ]["value"].dropna()
                if len(selection) == 0:
                    cells.append("—")
                else:
                    cells.append(
                        f"{selection.mean():.4f} ±{(selection.max() - selection.min()):.4f}"
                    )
            lines.append(f"| {metric} | " + " | ".join(cells) + " |")
        lines.append("")

    lines.append("## Gates")
    lines.append("")

    for name in engine_names:
        engine_report = gates_report.engines[name]
        status = "PASS" if engine_report.passed else "FAIL"
        lines.append(f"### {name}: {status}")
        lines.append("")

        failed = [outcome for outcome in engine_report.gates if not outcome.passed]
        if failed:
            lines.append("Failed gate entries:")
            lines.extend(
                f"- `{metric_column(outcome.gate.metric)}`"
                f" [{outcome.gate.type}] on `{outcome.shape}`:"
                f" {outcome.reason}"
                for outcome in failed
            )
        else:
            lines.append("All configured gate entries passed.")

        differential = engine_report.noise_differential
        differential_status = "PASS" if differential.passed else "FAIL"
        lines.append(f"- noise differential: {differential_status} — {differential.reason}")
        lines.append("")

    return "\n".join(lines) + "\n"
