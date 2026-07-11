"""Baseline and adversarial engine CLIs.

Every module here is a standalone command run as
``{python} -m atlas_tools.battery.engines.<name>`` that reads embeddings
(and optionally edges) and writes a ``layout.npz`` artifact via the shared
:mod:`atlas_tools.common.layout` contract. The battery harness talks to
them only through subprocess + artifact files — the same interface external
engines use.

Baselines: ``pca_cli`` (deterministic PCA-2D), ``umap_cli`` (umap-learn).

Adversarial toys (used ONLY by tests to keep the acceptance criteria
honest): ``cheat_cli`` (manufactures clusters from edges), ``collapse_cli``
(PCA then x0.01 contraction rig), ``shuffle_cli`` (PCA then permutes xy
rows relative to row_id).
"""

import numpy as np
from sklearn.decomposition import PCA

from atlas_tools.common.knn import l2_normalize


def pca_coords(embeddings: np.ndarray, *, normalize: bool = True) -> np.ndarray:
    """Deterministic PCA-2D used by the pca/collapse/shuffle engines.

    Rows are L2-normalized by default so the euclidean PCA geometry matches
    the battery's cosine neighbor truth; the full (LAPACK) SVD solver keeps
    the projection deterministic for a given input.
    """
    x = np.asarray(embeddings, dtype=np.float32)
    if normalize:
        x = l2_normalize(x)

    xy = PCA(n_components=2, svd_solver="full").fit_transform(x.astype(np.float64))
    return xy.astype(np.float32)
