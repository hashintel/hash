"""Baseline and adversarial engine CLIs.

Every module here is a standalone command run as
``{python} -m atlas_tools.battery.engines.<name>`` that reads embeddings (and optionally edges)
and writes a ``layout.npz`` artifact via the shared :mod:`atlas_tools.common.layout` contract.
The battery harness talks to them only through subprocess calls and artifact files, the same
interface external engines use.

Baselines: ``pca_cli`` (deterministic PCA-2D) and ``umap_cli`` (umap-learn).

Adversarial toys, used only by tests to keep the acceptance criteria honest: ``cheat_cli``
(manufactures clusters from edges), ``collapse_cli`` (PCA followed by a uniform 0.01
contraction), and ``shuffle_cli`` (PCA followed by permuting xy rows relative to row_id).
"""

import numpy as np
from sklearn.decomposition import PCA

from atlas_tools.common.knn import l2_normalize


def pca_coordinates(embeddings: np.ndarray, *, normalize: bool = True) -> np.ndarray:
    """Project embeddings to a deterministic 2-D PCA layout.

    Rows are L2-normalized by default so the euclidean PCA geometry matches the battery's
    cosine neighbor truth; the full (LAPACK) SVD solver keeps the projection deterministic for
    a given input.
    """
    x = np.asarray(embeddings, dtype=np.float32)
    if normalize:
        x = l2_normalize(x)

    xy = PCA(n_components=2, svd_solver="full").fit_transform(x.astype(np.float64))
    return xy.astype(np.float32)
