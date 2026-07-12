"""Layout gate battery: the engine-agnostic instrument that accepts or rejects layout engines.

The battery evaluates layout engines and loss-term changes. It consumes ``layout.npz``
artifacts through :mod:`atlas_tools.common.layout` only and never imports engine code. Its
engine interface is a command that reads embeddings/edges and writes ``layout.npz`` (see
:mod:`atlas_tools.battery.engine_runner`).

Modules:

- ``datasets``: the planted-shape dataset artifact contract.
- ``generators``: the seven seeded planted-shape generators.
- ``merge_tree``: merge-tree leaf persistence, the primary structure metric.
- ``metrics``: kNN recall, trustworthiness/continuity, silhouette, pendant diffusion, edge
  binding, and the contraction factor.
- ``engine_runner``: the subprocess engine interface plus layout validation.
- ``gates``: the threshold gate schema and the hard no-structure-from-noise differential.
- ``harness``: ``battery run``, which executes generators x engines x seeds and emits
  ``results.parquet``, ``report.md``, ``gates.json``, and ``manifest.json``.
- ``calibrate``: merge-tree calibration against a reference layout.
- ``engines``: baseline engine CLIs (PCA-2D, umap-learn) plus adversarial toy engines used
  only by tests.
"""
