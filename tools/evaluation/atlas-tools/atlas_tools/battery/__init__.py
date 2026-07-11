"""Layout gate battery (W3): the engine-agnostic instrument that accepts or
rejects layout engines and loss-term changes.

The battery consumes ``layout.npz`` artifacts through
:mod:`atlas_tools.common.layout` only and never imports engine code. Its
engine interface is "a command that reads embeddings/edges and writes
layout.npz" (see :mod:`atlas_tools.battery.engine_runner`).

Modules:

- ``datasets``: planted-shape dataset artifact contract (W3.1).
- ``generators``: the seven seeded planted-shape generators (W3.1).
- ``merge_tree``: merge-tree leaf persistence, the primary structure metric.
- ``metrics``: kNN recall, trustworthiness/continuity, silhouette, pendant
  diffusion, edge binding, contraction factor (W3.2).
- ``engine_runner``: subprocess engine interface + layout validation.
- ``gates``: threshold gate schema and the hard no-structure-from-noise
  differential (W3.2.8).
- ``harness``: ``battery run`` — generators x engines x seeds, emitting
  ``results.parquet``, ``report.md``, ``gates.json``, ``manifest.json``.
- ``calibrate``: merge-tree calibration against a reference layout.
- ``engines``: baseline engine CLIs (PCA-2D, umap-learn) plus adversarial
  toy engines used only by tests.
"""
