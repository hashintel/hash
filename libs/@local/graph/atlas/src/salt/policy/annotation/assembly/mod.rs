//! Classifier training-set assembly over a validated annotation corpus.
//!
//! [`assemble`] produces everything the classifier fit consumes from an [`AnnotationCorpus`]. It
//! renders each admitted card through the canonical card template and embeds the rendered text.
//! Each row then carries a smoothed soft target and a vote weight, and it joins the indivisible
//! validation group its leakage axes and near-duplicate neighbours imply. The output is
//! deterministic in the corpus bytes, the embedding provider, and the [`AssemblyConfig`], so one
//! corpus always yields the same training set.
//!
//! Rendering goes through the same template, budgets, and lint as generation-time production cards,
//! so classifier-time and generation-time card text cannot drift from each other. The adapters live
//! in [`render`], and the grouping and subdivision machinery lives in [`groups`].
//!
//! # Card policy
//!
//! Flags record facts, and this module holds the explicit policy that decides what they mean for
//! training:
//!
//! - shot-excluded cards stay out of training, because judging prompts disclosed their verdicts and
//!   training on such a card would teach the model the prompt material;
//! - holdout cards stay out of training and keep their human verdict as the answer. The assembly
//!   still renders and embeds them, and [`AssembledCorpus::holdouts`] carries them beside their
//!   verdicts as the fitted model's evaluation set;
//! - cards whose votes assert no geometry class (all unclear or abstain) drop with zero weight, so
//!   uncertainty discounts a card without distorting its target;
//! - `prescreen_stratum` is a stratification fact and has no effect here.
//!
//! [`AssemblyEvidence`] counts every exclusion.
//!
//! # Targets and weights
//!
//! With `n_k` the card's votes for geometry class `k` (of `K = 3` classes) and `m = Σ_k n_k` its
//! geometry-vote total, the soft target is the Dirichlet posterior mean
//!
//! ```text
//! q_k = (n_k + α) / (m + K · α),    α = 1/2,
//! ```
//!
//! the Jeffreys prior. A card's target stays a proper distribution at any vote count, and few-vote
//! cards shrink toward uniform instead of asserting certainty their evidence does not carry. The
//! row weight is `m`, so the fit's cross-entropy counts each geometry vote once.
//!
//! # Validation groups
//!
//! Rows whose shared content leaks across a train/validation split share one group. A union-find
//! joins cards through every value-keyed leakage axis (relation family, inverse pair through the
//! named identity on or off corpus, and base URL) and through near-duplication of the rendered
//! cards themselves. Any two rows join when the cosine distance `1 - cos` between their embeddings
//! is at most a boundary derived from the corpus, and the exact all-pairs graph is affordable at
//! annotation-corpus scale.
//!
//! The boundary is the geometric midpoint of the widest multiplicative void among the sorted
//! pairwise distances within `(0, median · NEAR_DUPLICATE_CEILING_FRACTION]`, with the trailing
//! void ending at the ceiling included and the leading gap from zero excluded. A duplicate cluster
//! sits decades below the corpus bulk, and the void between them is the boundary's evidence. A
//! corpus without such structure over-joins only its few closest pairs, and subdivision cuts far
//! near-duplicate edges first, so the failure direction is toward more conservative validation. The
//! evidence records the derived boundary with its void and its ceiling. The group label is the
//! SHA-256 over the component's member identity URLs in ascending byte order, so it is stable under
//! any traversal order.
//!
//! A component larger than [`AssemblyConfig::maximum_group_fraction`] of the trained rows is too
//! large for grouped validation, so subdivision relaxes its axes in information order, and the axis
//! whose one edge says least about leakage goes first. Family edges drop inside the component, then
//! base-URL edges, then near-duplicate edges cut farthest-first (the kept cut is the largest
//! distance under which every part fits the budget). Identity and inverse edges never relax, so a
//! part they alone hold over budget stays one group, and the evidence records it. Relaxation is
//! per-component, and groups already within budget keep every axis.
//!
//! Publisher is not a union axis. On the live corpus it collapses the 1,684 cards into 5 components
//! (1,619 under `wikidata`), leaving grouped validation nothing to validate, and a publisher axis
//! would teach fold assignment to segregate publishers where validation wants them intermingled.
//! The axis stays on the wire as a recorded fact for stratified evaluation.

use groups::{dirichlet_target, validation_groups, weight};
use hashql_core::id::{IdSlice, IdVec};
use render::render_card;

use super::{AnnotationCorpus, CardIdentity, HoldoutClass};
use crate::{
    dataset::card,
    identity::CardRow,
    progress::Progress,
    salt::{
        embedding::{
            CardEmbedder, CardEmbeddingError, CardEmbeddingStats, CardEmbeddingTable, embed_cards,
        },
        policy::classifier::TrainingRow,
    },
};

mod groups;
mod render;

#[cfg(test)]
mod tests;

/// The Dirichlet smoothing strength: the Jeffreys prior for a three-class multinomial.
const DIRICHLET_ALPHA: f64 = 0.5;

/// The near-duplicate search region's top, as a fraction of the median pairwise distance.
///
/// The boundary derivation looks for a duplicate/bulk void strictly below the corpus's typical
/// inter-card distance. The median is that typical distance by construction, and the quarter stands
/// the region off from the bulk's lower tail. The derivation picks the widest void within the
/// region, so the fraction only bounds the search: any value materially below one and above the
/// duplicate scale finds the same void on a corpus with duplicate structure.
const NEAR_DUPLICATE_CEILING_FRACTION: f64 = 0.25;

/// The prose language every corpus card must declare.
///
/// This is a constant rather than a configuration field. The template renders exactly one language,
/// and its sentence segmentation, token budgets, and connective phrases all follow that language,
/// so a knob offering languages the template cannot render would be a lever wired to nothing.
///
/// The per-card `language` field exists on the wire so a corpus declares what it holds and a
/// mismatch fails here instead of rendering garbage. When a second template arrives, the tag
/// becomes that template's property.
const CARD_LANGUAGE: &str = "en";

/// Assembly settings.
#[derive(Debug, Copy, Clone, PartialEq, Default)]
pub(crate) struct AssemblyConfig {
    /// The largest fraction of the trained rows one validation group may hold, in `(0, 1]`.
    ///
    /// Beyond it, subdivision relaxes the group's weakest axes.
    pub maximum_group_fraction: f64 = 0.1,
}

/// Assembling the corpus into a training set failed.
#[derive(Debug)]
pub enum AssemblyError<E> {
    /// A card declares a prose language the template does not render.
    Language {
        /// The card's corpus index.
        card: usize,
        /// The declared language tag.
        language: Box<str>,
    },
    /// An endpoint constraint's minimum target count exceeds its maximum.
    Cardinality {
        /// The card's corpus index.
        card: usize,
    },
    /// A card failed to render under the canonical template.
    Render {
        /// The card's corpus index.
        card: usize,
        /// The template's error.
        error: card::CardError<card::ReservedTokenError>,
    },
    /// The embedding provider failed to produce the card table.
    Embedding(CardEmbeddingError<CardRow, E>),
    /// Policy left no card to train on.
    Empty,
}

impl<E: core::fmt::Display> core::fmt::Display for AssemblyError<E> {
    fn fmt(&self, fmt: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        match self {
            Self::Language { card, language } => write!(
                fmt,
                "card {card} declares the language {language}, and the template renders \
                 {CARD_LANGUAGE}",
            ),
            Self::Cardinality { card } => write!(
                fmt,
                "an endpoint constraint of card {card} requires more targets than it allows",
            ),
            Self::Render { card, error } => write!(fmt, "card {card} failed to render: {error}"),
            Self::Embedding(error) => error.fmt(fmt),
            Self::Empty => fmt.write_str("no corpus card is admissible for training"),
        }
    }
}

impl<E: core::error::Error + 'static> core::error::Error for AssemblyError<E> {
    fn source(&self) -> Option<&(dyn core::error::Error + 'static)> {
        match self {
            Self::Render { error, .. } => Some(error),
            Self::Embedding(error) => Some(error),
            Self::Language { .. } | Self::Cardinality { .. } | Self::Empty => None,
        }
    }
}

/// What one assembly admitted, dropped, and derived.
///
/// Destined for the generation metadata beside the fit evidence, so a published classifier names
/// the corpus policy outcomes its training ran under.
#[derive(Debug, Copy, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub(crate) struct AssemblyEvidence {
    /// Cards the corpus supplied.
    pub supplied: usize,
    /// Cards excluded as shot material.
    pub shot_excluded: usize,
    /// Cards excluded as human-verdict holdouts.
    pub holdouts_excluded: usize,
    /// Cards dropped for a zero geometry-vote weight.
    pub zero_weight_dropped: usize,
    /// Rows assembled into the training set.
    pub trained: usize,
    /// Distinct card texts embedded.
    pub unique_texts: usize,
    /// Rows whose rendering exceeded the `hard_token_budget` or dropped more than half their
    /// examples.
    pub severely_truncated: usize,
    /// Indivisible validation groups over the trained rows, after subdivision.
    pub fold_groups: usize,
    /// Near-duplicate pairs found at the derived boundary.
    pub near_duplicate_pairs: usize,
    /// The derived cosine-distance boundary under which rows joined as near-duplicates.
    pub near_duplicate_epsilon: f64,
    /// The winning void's edges the boundary bisects geometrically.
    ///
    /// Zeros when the derivation found no void.
    #[serde(default)]
    pub near_duplicate_void: [f64; 2],
    /// The derivation's search ceiling, which is the median pairwise distance scaled by the
    /// fraction.
    #[serde(default)]
    pub near_duplicate_ceiling: f64,
    /// Over-budget components subdivision split.
    #[serde(default)]
    pub subdivided_groups: usize,
    /// Groups accepted over budget because identity and near-duplication alone hold them together.
    #[serde(default)]
    pub oversized_accepted: usize,
    /// The weakest axis rank subdivision engaged.
    #[serde(default)]
    pub deepest_relaxation: Relaxation,
}

/// The axis rank a subdivision relaxed.
///
/// Ordered by the leakage information one edge of the axis carries.
#[derive(
    Debug,
    Copy,
    Clone,
    PartialEq,
    Eq,
    PartialOrd,
    Ord,
    Default,
    serde::Serialize,
    serde::Deserialize,
)]
#[serde(rename_all = "kebab-case")]
pub(crate) enum Relaxation {
    /// Every group fit the budget under the full union.
    #[default]
    None,
    /// Subdivision dropped relation-family edges inside over-budget groups.
    Family,
    /// Subdivision dropped base-URL edges inside over-budget groups.
    Base,
    /// Subdivision cut near-duplicate edges farthest-first inside over-budget groups.
    NearDuplicate,
}

/// One human-verdict holdout card, rendered and embedded beside the training rows.
#[derive(Debug)]
pub(crate) struct HoldoutCard {
    /// The card's identity.
    pub identity: CardIdentity,
    /// The held-out human verdict.
    pub verdict: HoldoutClass,
    /// The card's row in the embedding table.
    pub row: CardRow,
}

/// One assembled training set and its provenance.
///
/// Row `i` of the embedding table, the training rows, and the identities all describe the same
/// card; holdout cards occupy the table rows after the trained rows, addressed through
/// [`holdouts`](Self::holdouts). The table is the artifact shape the fit stages and maps; the
/// mapped embedding matrix's leading trained rows and [`rows`](Self::rows) together satisfy the
/// classifier's training-set contract.
#[derive(Debug)]
pub(crate) struct AssembledCorpus {
    table: CardEmbeddingTable,
    rows: IdVec<CardRow, TrainingRow>,
    identities: IdVec<CardRow, CardIdentity>,
    holdouts: Vec<HoldoutCard>,
    evidence: AssemblyEvidence,
}

impl AssembledCorpus {
    /// Returns the row-aligned card-embedding table.
    #[inline]
    pub(crate) const fn table(&self) -> &CardEmbeddingTable {
        &self.table
    }

    /// Returns the labelled training rows.
    #[inline]
    pub(crate) const fn rows(&self) -> &IdSlice<CardRow, TrainingRow> {
        &self.rows
    }

    /// Returns each row's card identity.
    #[inline]
    pub(crate) const fn identities(&self) -> &IdSlice<CardRow, CardIdentity> {
        &self.identities
    }

    /// Returns the holdout evaluation set.
    #[inline]
    pub(crate) const fn holdouts(&self) -> &[HoldoutCard] {
        &self.holdouts
    }

    /// Returns the policy and derivation counts.
    #[inline]
    pub(crate) const fn evidence(&self) -> &AssemblyEvidence {
        &self.evidence
    }
}

/// Assembles the classifier training set from a validated corpus.
///
/// See the module documentation for the card policy, the target arithmetic, and the grouping
/// semantics.
///
/// # Errors
///
/// Returns an [`AssemblyError`] when a card declares a language the template does not render,
/// carries an impossible endpoint cardinality, fails template rendering, when the embedding
/// provider fails, or when policy admits no card.
pub(crate) async fn assemble<E, P>(
    corpus: &AnnotationCorpus,
    embedder: &E,
    config: AssemblyConfig,
    progress: &P,
) -> Result<AssembledCorpus, AssemblyError<E::Error>>
where
    E: CardEmbedder + Sync,
    P: Progress + Sync,
{
    let mut evidence = AssemblyEvidence {
        supplied: corpus.cards().len(),
        shot_excluded: 0,
        holdouts_excluded: 0,
        zero_weight_dropped: 0,
        trained: 0,
        unique_texts: 0,
        severely_truncated: 0,
        fold_groups: 0,
        near_duplicate_pairs: 0,
        near_duplicate_epsilon: 0.0,
        near_duplicate_void: [0.0; 2],
        near_duplicate_ceiling: 0.0,
        subdivided_groups: 0,
        oversized_accepted: 0,
        deepest_relaxation: Relaxation::None,
    };

    let mut trained = Vec::new();
    let mut held_out = Vec::new();
    for (index, corpus_card) in corpus.cards().iter().enumerate() {
        if corpus_card.flags.shot_excluded {
            evidence.shot_excluded += 1;
            continue;
        }

        if let Some(verdict) = corpus_card.flags.holdout {
            evidence.holdouts_excluded += 1;
            held_out.push((index, corpus_card, verdict));
            continue;
        }

        let counts = corpus_card.vote_counts();
        if counts.weight() == 0 {
            evidence.zero_weight_dropped += 1;
            continue;
        }

        trained.push((index, corpus_card, counts));
    }

    if trained.is_empty() {
        return Err(AssemblyError::Empty);
    }
    evidence.trained = trained.len();

    let mut rendered = trained
        .iter()
        .map(|&(index, corpus_card, _)| render_card(index, corpus_card))
        .collect::<Result<IdVec<CardRow, _>, _>>()?;
    evidence.severely_truncated = rendered
        .iter()
        .filter(|finished| finished.severely_truncated())
        .count();

    // Holdout rows render and embed after every trained row, so the
    // trained rows keep their positions and the group derivation's
    // trained-row scan bound holds. Each push hands back the holdout
    // card's assigned row in the table.
    let mut holdout_rows = Vec::with_capacity(held_out.len());
    for &(index, corpus_card, _) in &held_out {
        holdout_rows.push(rendered.push(render_card(index, corpus_card)?));
    }

    let (table, stats) = embed_cards(embedder, &rendered, None, progress)
        .await
        .map_err(AssemblyError::Embedding)?;
    let CardEmbeddingStats { reused, embedded } = stats;
    evidence.unique_texts = reused + embedded;

    let groups = validation_groups(&trained, table.view(), config, &mut evidence);
    progress.assembly_boundary_derived(evidence.near_duplicate_epsilon);

    let rows = trained
        .iter()
        .zip(&groups)
        .map(|(&(_, _, counts), &group)| TrainingRow {
            target: dirichlet_target(&counts),
            weight: weight(&counts),
            group,
        })
        .collect();

    let holdouts = held_out
        .into_iter()
        .zip(holdout_rows)
        .map(|((_, corpus_card, verdict), row)| HoldoutCard {
            identity: corpus_card.identity.clone(),
            verdict,
            row,
        })
        .collect();

    Ok(AssembledCorpus {
        table,
        rows,
        identities: trained
            .into_iter()
            .map(|(_, corpus_card, _)| corpus_card.identity.clone())
            .collect(),
        holdouts,
        evidence,
    })
}
