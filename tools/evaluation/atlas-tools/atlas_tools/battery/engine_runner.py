"""Engine interface: "a command that reads embeddings/edges and writes
layout.npz" (W3.3).

Engines are configured in a versioned YAML file::

    version: 1
    engines:
      - name: umap_tuned
        command: "{python} -m atlas_tools.battery.engines.umap_cli
                  --embeddings {embeddings} --edges {edges} --out {out}
                  --seed {seed} --n-neighbors 30 --min-dist 0.1"
        command_no_edges: "{python} -m ... (same, without --edges)"

Placeholders — substituted per token AFTER shlex splitting, so paths with
spaces are safe: ``{python}`` (sys.executable), ``{embeddings}`` (path to
the raw .f32 matrix), ``{edges}`` (edges.npy), ``{labels}`` (labels.npy),
``{out}`` (layout.npz path the engine must write), ``{seed}``.

Commands run via subprocess with shell=False. The produced layout is loaded
through :func:`atlas_tools.common.layout.load_layout`, validated (row count
matches the dataset, ``row_id`` is a permutation of ``arange(n)``), and the
coordinates are re-aligned by ``row_id`` so metrics always see node ``i``
at row ``i``.

``command_no_edges`` is required to evaluate the no-structure-from-noise
differential for engines whose ``command`` consumes ``{edges}``. If such an
engine omits it, the differential gate fails as "not evaluable" — the gate
fails closed (see :mod:`atlas_tools.battery.gates`).
"""

from __future__ import annotations

import shlex
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np
import yaml

from atlas_tools.battery.datasets import EDGES_FILE, EMBEDDINGS_FILE, LABELS_FILE
from atlas_tools.common.layout import LayoutArtifact, load_layout


@dataclass(frozen=True)
class EngineSpec:
    name: str
    command: str
    command_no_edges: str | None = None

    @property
    def uses_edges(self) -> bool:
        return "{edges}" in self.command

    def resolve_no_edges_command(self) -> str | None:
        """Command for the edges-disabled variant.

        Engines that never consume ``{edges}`` are their own no-edges
        variant. Engines that consume edges must define
        ``command_no_edges`` explicitly; otherwise ``None`` (not
        evaluable — the differential gate fails closed).
        """
        if self.command_no_edges is not None:
            return self.command_no_edges
        if not self.uses_edges:
            return self.command
        return None


def load_engines(path: Path | str) -> list[EngineSpec]:
    """Load and validate a versioned engines YAML file."""
    with open(path, encoding="utf-8") as f:
        data = yaml.safe_load(f)
    if not isinstance(data, dict) or data.get("version") != 1:
        raise ValueError(f"{path}: engines config must declare 'version: 1'")
    entries = data.get("engines")
    if not entries:
        raise ValueError(f"{path}: engines config lists no engines")
    specs = []
    names = set()
    for entry in entries:
        name = entry.get("name")
        command = entry.get("command")
        if not name or not command:
            raise ValueError(f"{path}: every engine needs 'name' and 'command'")
        if name in names:
            raise ValueError(f"{path}: duplicate engine name {name!r}")
        names.add(name)
        specs.append(
            EngineSpec(
                name=name,
                command=command,
                command_no_edges=entry.get("command_no_edges"),
            )
        )
    return specs


def load_engines_raw(path: Path | str) -> dict[str, Any]:
    """The raw (validated) YAML dict, for hashing into the manifest."""
    load_engines(path)
    with open(path, encoding="utf-8") as f:
        return yaml.safe_load(f)


def render_command(template: str, mapping: dict[str, str]) -> list[str]:
    """shlex-split the template, then substitute placeholders per token."""
    argv = []
    for token in shlex.split(template):
        try:
            argv.append(token.format(**mapping))
        except KeyError as exc:
            raise ValueError(
                f"unknown placeholder {exc} in engine command: {template}"
            ) from exc
    return argv


def run_engine(
    spec: EngineSpec,
    *,
    dataset_dir: Path | str,
    out_path: Path | str,
    seed: int,
    use_edges: bool = True,
) -> None:
    """Execute the engine command as a subprocess (no shell)."""
    dataset_dir = Path(dataset_dir)
    out_path = Path(out_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    template = spec.command if use_edges else spec.resolve_no_edges_command()
    if template is None:
        raise ValueError(
            f"engine {spec.name!r} consumes {{edges}} but defines no"
            " command_no_edges; the edges-disabled variant is not runnable"
        )
    mapping = {
        "python": sys.executable,
        "embeddings": str(dataset_dir / EMBEDDINGS_FILE),
        "edges": str(dataset_dir / EDGES_FILE),
        "labels": str(dataset_dir / LABELS_FILE),
        "out": str(out_path),
        "seed": str(seed),
    }
    argv = render_command(template, mapping)
    result = subprocess.run(argv, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(
            f"engine {spec.name!r} failed with exit code {result.returncode}:"
            f" {' '.join(argv)}\nstderr (tail): {result.stderr[-2000:]}"
        )
    if not out_path.exists():
        raise RuntimeError(
            f"engine {spec.name!r} exited 0 but wrote no layout at {out_path}"
        )


def load_aligned_layout(path: Path | str, expected_n: int) -> LayoutArtifact:
    """Load a layout, validate it against the dataset, align xy by row_id."""
    artifact = load_layout(path)
    n = artifact.xy.shape[0]
    if n != expected_n:
        raise ValueError(f"{path}: layout has {n} rows, dataset has {expected_n}")
    row_id = artifact.row_id
    if not np.array_equal(np.sort(row_id), np.arange(expected_n, dtype=np.int64)):
        raise ValueError(f"{path}: row_id is not a permutation of arange(n)")
    aligned = np.empty_like(artifact.xy)
    aligned[row_id] = artifact.xy
    return LayoutArtifact(
        xy=aligned,
        row_id=np.arange(expected_n, dtype=np.int64),
        provenance=artifact.provenance,
    )
