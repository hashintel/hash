"""Orchestration: sample -> alpha ladder of layouts -> serving encoders.

The ladder embeds F(alpha) = alpha*S + (1-alpha)*R for a descending list
of alphas (see `app.layout`), each level warm-started from its neighbor
so the ladder reads as one coherent deformation (and so the client can
tween between levels). alpha = 1.0 is the pure semantic map; the
alpha = 1.0 layout and encoder double as the warm-start state for the
next refit, exactly like the old single-layout pipeline.

Encoders are distilled per level from structure features (see
`app.features`: embedding + capped neighbor mean + coherence + degree),
chained the same way: the first level fine-tunes from the previous
refit's encoder, each subsequent level from its ladder neighbor.
"""

import json
import logging
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Literal, Self

import numpy as np

from app.features import StructureFeatureParams, feature_meta, structure_features
from app.layout import (
    LayoutGraph,
    LayoutGraphParams,
    RelationSet,
    RelationSetParams,
    SemanticSetParams,
    relation_set,
    semantic_set,
)
from app.mlp import MLP
from app.sample import Sample, row_lookup


@dataclass(frozen=True)
class Layout:
    """
    A fitted 2D layout: `xy` is (n, 2) float32, aligned row-for-row with
    `metadata` (METADATA_DT records identifying the entities). One is
    persisted per alpha level; the alpha=1.0 one warm-starts the next
    refit.
    """

    metadata: np.ndarray
    xy: np.ndarray

    def save(self, path: Path) -> None:
        np.savez_compressed(path, metadata=self.metadata, xy=self.xy)

    @classmethod
    def load(cls, path: Path) -> Self:
        with np.load(path) as data:
            return cls(metadata=data["metadata"], xy=data["xy"])


def layout_path(out_dir: Path, alpha: float) -> Path:
    return out_dir / f"layout-a{round(alpha * 100):03d}.npz"


def encoder_path(out_dir: Path, alpha: float) -> Path:
    return out_dir / f"encoder-a{round(alpha * 100):03d}.safetensors"


def warm_init(
    previous: Layout,
    *,
    metadata: np.ndarray,
    semantic: LayoutGraph,
    rng: np.random.Generator,
) -> np.ndarray | None:
    """
    Build an (n, 2) init from a previous refit's layout, so successive
    refits stay visually stable instead of reshuffling on every refresh:

    - entities that were in the previous layout keep their coordinates;
    - new entities start at the weighted mean of their carried-over
      neighbors in the semantic fuzzy set (that neighborhood is where
      the optimizer will pull them anyway, so this mostly saves epochs
      and avoids long-range flights across the plot);
    - new entities with no carried-over neighbor are dropped near the
      centre of the previous layout, with a little jitter so coincident
      starts don't lock together.
    """
    if previous.metadata.size == 0:
        return None

    rows, found = row_lookup(previous.metadata)(metadata)

    init = np.zeros((len(metadata), 2), dtype=np.float32)
    init[found] = previous.xy[rows[found]]

    new = np.nonzero(~found)[0]
    if new.size:
        neighbours = semantic.graph.tocsr()
        # Fallback placement is relative to the previous layout as a
        # whole: its centre, jittered proportionally to its spread.
        center = previous.xy.mean(axis=0)
        spread = float(previous.xy.std(axis=0).mean()) or 1.0

        for row in new:
            start, stop = neighbours.indptr[row], neighbours.indptr[row + 1]
            nbrs = neighbours.indices[start:stop]
            weights = neighbours.data[start:stop]

            old = found[nbrs]
            if old.any():
                w = weights[old]
                init[row] = (init[nbrs[old]] * (w / w.sum())[:, None]).sum(axis=0)
            else:
                init[row] = center + rng.normal(scale=0.05 * spread, size=2)

    logging.info(f"Warm start: {int(found.sum())} carried over, {new.size} new")
    return init


@dataclass(frozen=True)
class LadderParams:
    # Descending order is how they're fitted; alpha=1.0 must be present
    # if refits are meant to warm-chain (its layout seeds the next run).
    alphas: tuple[float, ...] = (1.0, 0.75, 0.5, 0.25)
    min_dist: float = 0.1
    # Full optimization for the first level; warm-started ones converge
    # in far fewer epochs since they start near their neighbor's answer.
    n_epochs_first: int = 200
    n_epochs_chained: int = 100
    # Full step size for a cold start, but gentler whenever the init is
    # a previous layout: at lr 1.0 even a short warm run rearranges
    # about half the map (measured: median drift ~0.5x the layout's
    # spread over 20 epochs), defeating the point of warm-starting.
    # The trade-off: lower lr fits each rung slightly less tightly to
    # its own F(alpha) in exchange for rung-to-rung (and refit-to-refit)
    # stability.
    sgd_learning_rate_cold: float = 1.0
    sgd_learning_rate_warm: float = 0.3
    # Cold-start init for the very first level of the very first run;
    # afterwards everything is chained from arrays.
    init: Literal["pca", "random", "spectral", "tswspectral"] = "pca"


def fit_alpha_ladder(
    *,
    sample: Sample,
    semantic: LayoutGraph,
    relation: LayoutGraph,
    out_dir: Path,
    rng: np.random.Generator,
    ladder: LadderParams = LadderParams(),
    previous: Path | None = None,
) -> dict[float, Layout]:
    """
    Fit the full alpha ladder over prebuilt graphs, warm-chaining each
    level from the previous. `previous` is the prior refit's alpha=1.0
    layout file; it seeds the first level the same way each level seeds
    the next.
    """
    out_dir.mkdir(parents=True, exist_ok=True)
    alphas = tuple(sorted(ladder.alphas, reverse=True))

    init: np.ndarray | str = ladder.init
    if previous is not None and previous.exists():
        warm = warm_init(
            Layout.load(previous), metadata=sample.metadata, semantic=semantic, rng=rng
        )
        if warm is not None:
            init = warm

    xs = np.asarray(sample.embeddings)
    layouts: dict[float, Layout] = {}
    n_epochs = ladder.n_epochs_first

    for alpha in alphas:
        # Any ndarray init, previous refit or ladder neighbor, is
        # already near its answer; take gentler SGD steps from there.
        lr = (
            ladder.sgd_learning_rate_cold
            if isinstance(init, str)
            else ladder.sgd_learning_rate_warm
        )
        logging.info(f"embedding alpha={alpha:.2f} (n_epochs={n_epochs}, lr={lr})")

        xy = semantic.fuse(relation, alpha=alpha).embed(
            xs=xs,
            params=LayoutGraphParams(
                min_dist=ladder.min_dist,
                n_epochs=n_epochs,
                sgd_learning_rate=lr,
                init=init,
            ),
            rng=rng,
        )

        layout = Layout(metadata=sample.metadata, xy=xy)
        layout.save(layout_path(out_dir, alpha))
        layouts[alpha] = layout

        init = xy  # chain
        n_epochs = ladder.n_epochs_chained

    return layouts


@dataclass(frozen=True)
class EncoderParams:
    # The first encoder trains (or fine-tunes from the previous refit)
    # in full; ladder neighbors differ by small warm-chained deltas, so
    # a few epochs suffice for the rest.
    epochs_first: int = 30
    epochs_chained: int = 8


def fit_alpha_encoders(
    *,
    sample: Sample,
    layouts: dict[float, Layout],
    out_dir: Path,
    params: EncoderParams = EncoderParams(),
    features: StructureFeatureParams = StructureFeatureParams(),
    exclude: np.ndarray | None = None,
    previous: Path | None = None,
    seed: int = 0,
) -> dict[float, float]:
    """
    Distill each ladder level into a serving encoder
    (`encoder-a{100*alpha:03d}.safetensors`). `previous` is the prior
    refit's alpha=1.0 encoder, fine-tuned for drift control; each
    subsequent level fine-tunes from its ladder neighbor. `exclude` is
    the frozen hub set (rows) from the relation graph, mirrored into
    the structure features per their serving contract. Returns
    alpha -> validation RMSE in layout units.
    """
    out_dir.mkdir(parents=True, exist_ok=True)
    emb = np.asarray(sample.embeddings)
    dim = emb.shape[1]

    xs, deg_norm = structure_features(
        emb, sample.edges, params=features, exclude=exclude
    )
    meta = feature_meta(dim, deg_norm, mrl_dim=dim, params=features)

    rmses: dict[float, float] = {}
    prev_encoder = previous
    epochs = params.epochs_first

    for alpha in sorted(layouts, reverse=True):
        layout = layouts[alpha]
        assert len(layout.xy) == len(xs)
        tag = f"a{round(alpha * 100):03d}"

        network = MLP(input_dim=xs.shape[1], logger=logging.getLogger(tag))
        if prev_encoder is not None and prev_encoder.exists():
            network.import_(prev_encoder)

        # The network trains on standardized coordinates; export folds
        # the de-standardization back into the last layer (see app.mlp).
        center = layout.xy.mean(axis=0)
        scale = layout.xy.std(axis=0)
        np.maximum(scale, 1e-6, out=scale)
        ys = ((layout.xy - center) / scale).astype(np.float32)

        val_rmse = network.fit(xs=xs, ys=ys, epochs=epochs, seed=seed)
        rmses[alpha] = val_rmse * float(scale.mean())
        logging.info(f"{tag}: val RMSE {rmses[alpha]:.4f} layout units")

        out = encoder_path(out_dir, alpha)
        network.export(
            out, scale=scale, center=center, meta={**meta, "alpha": f"{alpha:g}"}
        )

        prev_encoder = out  # chain down the ladder
        epochs = params.epochs_chained

    return rmses


def fit(
    *,
    sample: Sample,
    out_dir: Path,
    rng: np.random.Generator,
    semantic: SemanticSetParams = SemanticSetParams(),
    relation: RelationSetParams = RelationSetParams(),
    ladder: LadderParams = LadderParams(),
    encoder: EncoderParams = EncoderParams(),
    features: StructureFeatureParams = StructureFeatureParams(),
    cold: bool = False,
) -> dict[float, float]:
    """
    End-to-end refit into `out_dir`: the alpha ladder of layouts, then
    the encoder per level. Unless `cold`, the previous refit's alpha=1.0
    layout and encoder in the same directory are used as warm starts.
    Returns alpha -> encoder validation RMSE in layout units.
    """
    previous_layout = None if cold else layout_path(out_dir, 1.0)
    previous_encoder = None if cold else encoder_path(out_dir, 1.0)
    out_dir.mkdir(parents=True, exist_ok=True)

    logging.info("building semantic fuzzy set")
    s = semantic_set(sample=sample, params=semantic, rng=rng)
    logging.info(f"building relation set ({len(sample.edges)} raw edges)")
    r: RelationSet = relation_set(sample=sample, params=relation)

    # The hub set is frozen fit-time state: the features exclude these
    # entities' edges, and serving must reuse this exact set rather than
    # re-deriving it from live degrees (see app.features). Ship it as
    # canonical `web_id~entity_uuid` strings (not row indices -- rows
    # are sample-specific): JSON that serde-deserializes directly into
    # Vec<EntityId> on the Rust side.
    hubs = [
        f"{uuid.UUID(bytes=record['web_id'].tobytes())}"
        f"~{uuid.UUID(bytes=record['entity_uuid'].tobytes())}"
        for record in sample.metadata[r.hubs]
    ]
    (out_dir / "hubs.json").write_text(json.dumps(hubs, indent=2) + "\n")

    layouts = fit_alpha_ladder(
        sample=sample,
        semantic=s,
        relation=r,
        out_dir=out_dir,
        rng=rng,
        ladder=ladder,
        previous=previous_layout,
    )

    return fit_alpha_encoders(
        sample=sample,
        layouts=layouts,
        out_dir=out_dir,
        params=encoder,
        features=features,
        exclude=r.hubs,
        previous=previous_encoder,
        seed=int(rng.integers(2**32)),
    )
