"""Subprocess engine interface: a command that reads embeddings/edges and writes layout.npz.

Engines are configured in a versioned YAML file::

    version: 1
    engines:
      - name: umap_tuned
        command: "{python} -m atlas_tools.battery.engines.umap_cli
                  --embeddings {embeddings} --edges {edges} --out {out}
                  --seed {seed} --n-neighbors 30 --min-dist 0.1"
        command_no_edges: "{python} -m ... (same, without --edges)"

Placeholders are substituted per token after shlex splitting, so paths with spaces are safe:
``{python}`` (sys.executable), ``{embeddings}`` (path to the raw .f32 matrix), ``{edges}``
(edges.npy), ``{labels}`` (labels.npy), ``{out}`` (the layout.npz path the engine writes), and
``{seed}``.

Commands run as subprocesses without a shell. The produced layout is loaded through
:func:`atlas_tools.common.layout.load_layout`, validated (row count matches the dataset,
``row_id`` is a permutation of ``arange(n)``), and the coordinates are re-aligned by ``row_id``
so metrics always see node ``i`` at row ``i``.

``command_no_edges`` is required to evaluate the no-structure-from-noise differential for
engines whose ``command`` consumes ``{edges}``. If such an engine omits it, the differential
gate fails as "not evaluable"; the gate fails closed (see :mod:`atlas_tools.battery.gates`).
"""

import shlex
import subprocess
import sys
from os import PathLike
from pathlib import Path
from typing import Literal, Self

import numpy as np
import yaml
from pydantic import BaseModel, model_validator

from atlas_tools.battery.datasets import (
    EDGES_FILE,
    EMBEDDINGS_FILE,
    LABELS_FILE,
)
from atlas_tools.common.layout import LayoutArtifact, load_layout


class EngineFile(BaseModel):
    version: Literal[1]
    engines: list[EngineSpec]

    @model_validator(mode="after")
    def _validate_no_duplicate_engines(self) -> Self:
        names = {engine.name for engine in self.engines}

        if len(names) != len(self.engines):
            raise ValueError("engines must have unique names")

        return self


class EngineSpec(BaseModel):
    name: str
    command: str
    command_no_edges: str | None = None

    @property
    def uses_edges(self) -> bool:
        return "{edges}" in self.command

    def resolve_no_edges_command(self) -> str | None:
        """Resolve the command for the edges-disabled variant.

        Engines that never consume ``{edges}`` are their own no-edges variant. Engines that
        consume edges must define ``command_no_edges`` explicitly; otherwise the result is
        ``None`` (not evaluable, and the differential gate fails closed).
        """
        if self.command_no_edges is not None:
            return self.command_no_edges

        if not self.uses_edges:
            return self.command

        return None


def load_engine_file(path: PathLike) -> EngineFile:
    """Load and validate a versioned engines YAML file."""
    data = yaml.safe_load(Path(path).read_text(encoding="utf-8"))

    return EngineFile.model_validate(data)


def load_engines(path: PathLike) -> list[EngineSpec]:
    """Load the engine specs of a versioned engines YAML file."""
    return load_engine_file(path).engines


def render_command(template: str, mapping: dict[str, str]) -> list[str]:
    """Split the template with shlex, then substitute placeholders per token."""
    argv = []

    for token in shlex.split(template):
        try:
            argv.append(token.format(**mapping))
        except KeyError as error:
            raise ValueError(
                f"unknown placeholder {error} in engine command: {template}"
            ) from error

    return argv


def run_engine(
    spec: EngineSpec,
    *,
    dataset_dir: PathLike,
    out_path: PathLike,
    seed: int,
    use_edges: bool = True,
) -> None:
    """Execute the engine command as a subprocess (no shell).

    Raises :class:`RuntimeError` when the command exits non-zero or exits zero without writing
    a layout at ``out_path``, and :class:`ValueError` when the edges-disabled variant is
    requested but not runnable.
    """
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
    # Running operator-configured engine commands is this module's purpose; argv is a list, no
    # shell is involved, and the exit code is checked explicitly below.
    result = subprocess.run(argv, capture_output=True, text=True, check=False)  # noqa: S603

    if result.returncode != 0:
        raise RuntimeError(
            f"engine {spec.name!r} failed with exit code {result.returncode}:"
            f" {' '.join(argv)}\nstderr (tail): {result.stderr[-2000:]}"
        )

    if not out_path.exists():
        raise RuntimeError(f"engine {spec.name!r} exited 0 but wrote no layout at {out_path}")


def load_aligned_layout(path: PathLike, expected_n: int) -> LayoutArtifact:
    """Load a layout, validate it against the dataset, and align xy by row_id."""
    artifact = load_layout(Path(path))

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
