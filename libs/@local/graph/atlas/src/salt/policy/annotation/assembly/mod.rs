//! Classifier training-set assembly over a validated annotation corpus.
//!
//! [`assemble`] turns an [`AnnotationCorpus`] into everything the classifier fit consumes: each
//! admitted card is rendered through the canonical card template, embedded, given a smoothed soft
//! target and a vote weight, and assigned to the indivisible validation group its leakage axes and
//! near-duplicate neighbours imply. The output is deterministic in the corpus bytes, the embedding
//! provider, and the [`AssemblyConfig`], so one corpus assembles to one training set.
//!
//! Rendering goes through the same template, budgets, and lint as generation-time production cards,
//! so classifier-time and generation-time card text cannot drift from each other.
//!
//! # Card policy
//!
//! Flags record facts; this module is the explicit policy deciding what they mean for training:
//!
//! - shot-excluded cards are excluded: their verdicts were disclosed in judging prompts, so
//!   training on them would leak the prompt material into the model;
//! - holdout cards are excluded from training: they answer to their human verdict. They are still
//!   rendered and embedded, and [`AssembledCorpus::holdouts`] carries them beside their verdicts as
//!   the fitted model's evaluation set;
//! - cards whose votes assert no geometry class (all unclear or abstain) drop with zero weight:
//!   uncertainty discounts a card without distorting its target;
//! - `prescreen_stratum` is a stratification fact and has no effect here.
//!
//! Every exclusion is counted in [`AssemblyEvidence`].
//!
//! # Targets and weights
//!
//! With `n_k` the card's votes for geometry class `k` (of `K = 3` classes) and `m = sum_k n_k` its
//! geometry-vote total, the soft target is the Dirichlet posterior mean
//!
//! ```text
//! q_k = (n_k + alpha) / (m + K * alpha),    alpha = 1/2,
//! ```
//!
//! the Jeffreys prior: a card's target stays a proper distribution at any vote count, and few-vote
//! cards shrink toward uniform instead of asserting certainty their evidence does not carry. The
//! row weight is `m`, so the fit's cross-entropy counts each geometry vote once.
//!
//! # Validation groups
//!
//! Rows that could leak shared content across a train/validation split must share a group. A
//! union-find joins cards through every value-keyed leakage axis - relation family, inverse pair
//! (through the named identity, on or off corpus), base URL - and through near-duplication of the
//! rendered cards themselves: two rows join when the cosine distance `1 - cos` between their
//! embeddings is at most [`AssemblyConfig::near_duplicate_epsilon`], and the exact all-pairs graph
//! is affordable at annotation-corpus scale. The group label is the SHA-256 over the component's
//! member identity URLs in ascending byte order, so it is stable under any traversal order.
//!
//! A component larger than [`AssemblyConfig::maximum_group_fraction`] of the trained rows would
//! starve grouped validation, so subdivision relaxes its axes in information order - the axis whose
//! one edge says least about leakage goes first. Family edges drop inside the component, then
//! base-URL edges, then near-duplicate edges cut farthest-first (the kept cut is the largest
//! distance under which every part fits the budget). Identity and inverse edges never relax: a part
//! they alone hold over budget is accepted and recorded in the evidence rather than split.
//! Relaxation is per-component - groups already within budget keep every axis.
//!
//! Publisher is not a union axis: on the live corpus it collapses the 1,684 cards into 5 components
//! (1,619 under `wikidata`), leaving grouped validation nothing to validate - and a publisher axis
//! would teach fold assignment to segregate publishers, where validation wants them intermingled.
//! The axis stays on the wire as a recorded fact for stratified evaluation.

use std::collections::{HashMap, HashSet, hash_map::Entry};

use super::{AnnotationCorpus, Card, CardIdentity, Content, Direction, HoldoutClass, VoteCounts};
use crate::{
    dataset::{OntologyRowId, card},
    disjoint::DisjointSet,
    integrity::{Sha256, Sha256Digest, Update as _},
    salt::{
        embedding::{
            CardEmbedder, CardEmbeddingError, CardEmbeddingStats, CardEmbeddingTable,
            CardEmbeddingView, embed_cards,
        },
        policy::{GeometryClass, classifier::TrainingRow},
    },
};

#[cfg(test)]
mod tests;

/// The Dirichlet smoothing strength: the Jeffreys prior for a three-class multinomial.
const DIRICHLET_ALPHA: f64 = 0.5;

/// The prose language every corpus card must declare.
///
/// The template's sentence segmentation and token budgets are properties of one corpus language,
/// and production cards render under the same tag.
const CARD_LANGUAGE: &str = "en";

/// Assembly settings.
#[derive(Debug, Copy, Clone, PartialEq, Default)]
pub(crate) struct AssemblyConfig {
    /// The cosine-distance threshold under which two rendered cards count as near-duplicates and share a validation group, on the `1 - cos` scale in `[0, 2]`. Positive. Defaults to `2e-3`, the near-tie threshold established for this embedding family.
    pub near_duplicate_epsilon: f64 = 2.0e-3,

    /// The largest fraction of the trained rows one validation group may hold before subdivision relaxes its weakest axes, in `(0, 1]`. Defaults to `0.1`.
    pub maximum_group_fraction: f64 = 0.1,
}

/// The corpus could not be assembled into a training set.
#[derive(Debug)]
pub(crate) enum AssemblyError<E> {
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
    Embedding(CardEmbeddingError<E>),
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
/// the corpus policy outcomes it was trained under.
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
    /// Rows whose rendering exceeded the hard budget or dropped more than half their examples.
    pub severely_truncated: usize,
    /// Indivisible validation groups over the trained rows, after subdivision.
    pub fold_groups: usize,
    /// Near-duplicate pairs found at the configured threshold.
    pub near_duplicate_pairs: usize,
    /// The threshold the near-duplicate derivation ran under.
    pub near_duplicate_epsilon: f64,
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
    /// Relation-family edges were dropped inside over-budget groups.
    Family,
    /// Base-URL edges were dropped inside over-budget groups.
    Base,
    /// Near-duplicate edges were cut farthest-first inside over-budget groups.
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
    pub row: usize,
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
    rows: Vec<TrainingRow>,
    identities: Vec<CardIdentity>,
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
    pub(crate) const fn rows(&self) -> &[TrainingRow] {
        &self.rows
    }

    /// Returns each row's card identity.
    #[inline]
    pub(crate) const fn identities(&self) -> &[CardIdentity] {
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
pub(crate) async fn assemble<E>(
    corpus: &AnnotationCorpus,
    embedder: &E,
    config: AssemblyConfig,
) -> Result<AssembledCorpus, AssemblyError<E::Error>>
where
    E: CardEmbedder + Sync,
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
        near_duplicate_epsilon: config.near_duplicate_epsilon,
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
        .collect::<Result<Vec<_>, _>>()?;
    evidence.severely_truncated = rendered
        .iter()
        .filter(|finished| finished.severely_truncated())
        .count();

    // Holdout rows render and embed after every trained row, so the
    // trained rows keep their positions and the group derivation's
    // trained-row scan bound holds.
    for &(index, corpus_card, _) in &held_out {
        rendered.push(render_card(index, corpus_card)?);
    }

    let (table, stats) = embed_cards(embedder, &rendered, None)
        .await
        .map_err(AssemblyError::Embedding)?;
    let CardEmbeddingStats { reused, embedded } = stats;
    evidence.unique_texts = reused + embedded;

    let groups = validation_groups(&trained, table.view(), config, &mut evidence);

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
        .enumerate()
        .map(|(offset, (_, corpus_card, verdict))| HoldoutCard {
            identity: corpus_card.identity.clone(),
            verdict,
            row: trained.len() + offset,
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

/// Renders one corpus card through the canonical template.
fn render_card<E>(index: usize, corpus_card: &Card) -> Result<card::Card, AssemblyError<E>> {
    let content = &corpus_card.content;
    if content.language != CARD_LANGUAGE {
        return Err(AssemblyError::Language {
            card: index,
            language: content.language.as_str().into(),
        });
    }

    let template = card::CardContext {
        language: CARD_LANGUAGE,
        segmenter: card::UnicodeSegmenter,
        tokenizer: card::Cl100kTokenizer,
    };

    let contents = card::CardContents {
        prelude: card::Prelude {
            relation: content.title.as_str().into(),
            description: content.description.as_deref().map(Into::into),
            aliases: content
                .aliases
                .iter()
                .map(|alias| alias.as_str().into())
                .collect(),
            inverse: content
                .inverse
                .as_ref()
                .and_then(|inverse| phrase(inverse, &template)),
        },
        ancestors: content
            .ancestors
            .iter()
            .filter_map(|ancestor| phrase(ancestor, &template))
            .collect(),
        source_types: content
            .source_types
            .iter()
            .filter_map(|source| phrase(source, &template))
            .collect(),
        target_types: content
            .target_types
            .iter()
            .filter_map(|target| phrase(target, &template))
            .collect(),
        endpoint_constraints: endpoint_constraints(index, content, &template)?,
        constraints: card::Constraints {
            symmetric: content.constraints.symmetric,
            transitive: content.constraints.transitive,
            singleton: content.constraints.single_value,
            distinct: content.constraints.distinct_values,
            direction: match content.constraints.direction {
                Direction::Symmetric => card::Direction::Symmetric,
                Direction::SourceToTarget => card::Direction::SourceToTarget,
            },
        },
        examples: examples(content, &template),
        epilogue: card::Epilogue {
            slug: content.slug.as_str().into(),
        },
    };

    // The wikidata entity token is the card's resolved source
    // identifier; hash identities are URLs, which the structural lint
    // already forbids.
    let forbidden = match &corpus_card.identity {
        CardIdentity::Wikidata { url, .. } => url.rsplit('/').next(),
        CardIdentity::Hash(_) => None,
    };

    card::build_card(
        contents,
        card::CardsConfig::default(),
        &template.tokenizer,
        forbidden.as_slice(),
    )
    .map_err(|error| AssemblyError::Render { card: index, error })
}

/// Builds one card's rendered endpoint constraints.
fn endpoint_constraints<'text, E>(
    index: usize,
    content: &'text Content,
    template: &card::CardContext<card::UnicodeSegmenter, card::Cl100kTokenizer>,
) -> Result<Vec<card::EndpointConstraint<'text>>, AssemblyError<E>> {
    let mut constraints = Vec::with_capacity(content.endpoint_constraints.len());
    for constraint in &content.endpoint_constraints {
        // A constraint whose source label normalizes away has no
        // association to render; its targets render nothing either.
        let Some(source) = phrase(&constraint.source_type, template) else {
            continue;
        };

        let targets = constraint
            .target_types
            .iter()
            .filter_map(|target| phrase(target, template))
            .collect();
        let Some(constraint) = card::EndpointConstraint::new(
            source,
            targets,
            constraint.minimum_targets.map(|minimum| minimum as usize),
            constraint.maximum_targets.map(|maximum| maximum as usize),
        ) else {
            return Err(AssemblyError::Cardinality { card: index });
        };

        constraints.push(constraint);
    }

    Ok(constraints)
}

/// Builds one card's rendered example pairs.
fn examples<'text>(
    content: &'text Content,
    template: &card::CardContext<card::UnicodeSegmenter, card::Cl100kTokenizer>,
) -> Vec<card::GroupItem<'text, card::Example<'text>>> {
    content
        .examples
        .iter()
        .filter_map(|example| {
            let Ok(source) = card::Phrase::new(&example.subject, None, template);
            let Ok(target) = card::Phrase::new(&example.object, None, template);

            Some(card::GroupItem {
                data: card::Example {
                    source: source?,
                    target: target?,
                },
                group: example.stratum.as_deref().map(Into::into),
            })
        })
        .collect()
}

/// Normalizes one wire phrase for the template.
fn phrase<'text>(
    input: &'text super::Phrase,
    context: &card::CardContext<card::UnicodeSegmenter, card::Cl100kTokenizer>,
) -> Option<card::Phrase<'text>> {
    let Ok(phrase) = card::Phrase::new(&input.label, input.description.as_deref(), context);
    phrase
}

/// Assigns every trained row its validation-group digest.
///
/// The returned digests align with `trained`; the evidence gains the group count and the
/// near-duplicate pair count.
fn validation_groups(
    trained: &[(usize, &Card, VoteCounts)],
    view: CardEmbeddingView<'_>,
    config: AssemblyConfig,
    evidence: &mut AssemblyEvidence,
) -> Vec<Sha256Digest> {
    let rows = trained.len();

    // Value-keyed axes join cards sharing an axis value; an inverse
    // pair meets at the named identity's key whether or not that
    // identity is itself on the corpus.
    let mut keys: HashMap<String, u32> = HashMap::new();
    let mut intern = |key: String| {
        let next = u32::try_from(keys.len()).expect("the axis-value domain is bound to u32");
        *keys.entry(key).or_insert(next)
    };

    let mut axes_by_row = Vec::with_capacity(rows);
    for (_, corpus_card, _) in trained {
        let axes = &corpus_card.axes;
        let mut identity = vec![intern(format!(
            "id:{}",
            corpus_card.identity.canonical_url()
        ))];
        identity.extend(
            axes.inverse_of
                .iter()
                .map(|inverse| intern(format!("id:{inverse}"))),
        );

        axes_by_row.push(RowAxes {
            identity,
            family: intern(format!("family:{}", axes.family)),
            base: intern(format!("base:{}", axes.base_url)),
        });
    }

    let mut pairs = Vec::new();
    for left in 0..rows {
        let embedding = view
            .embedding(OntologyRowId::new(left as u64))
            .expect("the table holds one row per trained card");
        for right in (left + 1)..rows {
            let other = view
                .embedding(OntologyRowId::new(right as u64))
                .expect("the table holds one row per trained card");

            let distance = f64::from(embedding.cosine_distance(other));
            if distance <= config.near_duplicate_epsilon {
                let node =
                    |value: usize| u32::try_from(value).expect("the row domain is bound to u32");
                pairs.push((node(left), node(right), distance));
            }
        }
    }
    evidence.near_duplicate_pairs = pairs.len();

    // A single row cannot leak against itself: the budget never
    // falls under one row.
    let budget = (config.maximum_group_fraction * integer(rows as u64)).max(1.0);
    let all: Vec<u32> = (0..rows)
        .map(|row| u32::try_from(row).expect("the row domain is bound to u32"))
        .collect();

    let mut groups = Vec::new();
    for component in partition(&all, &axes_by_row, &pairs, RANKS_ALL) {
        if integer(component.len() as u64) <= budget {
            groups.push(component);
            continue;
        }

        let produced = subdivide(
            &component,
            Relaxation::Family,
            &axes_by_row,
            &pairs,
            budget,
            evidence,
        );
        if produced.len() > 1 {
            evidence.subdivided_groups += 1;
        }
        groups.extend(produced);
    }
    evidence.fold_groups = groups.len();

    // Trained rows ascend by card identity (the corpus order), so each
    // group's members are already in ascending byte order.
    let mut assigned: Vec<Option<Sha256Digest>> = vec![None; rows];
    for group in groups {
        let mut hasher = Sha256::new();
        for &row in &group {
            let (_, corpus_card, _) = &trained[row as usize];
            hasher.update(corpus_card.identity.canonical_url().as_bytes());
            hasher.update(b"\n");
        }

        let digest = hasher.finalize();
        for row in group {
            assigned[row as usize] = Some(digest);
        }
    }

    assigned
        .into_iter()
        .map(|digest| digest.expect("every trained row belongs to exactly one group"))
        .collect()
}

/// One trained row's interned axis values.
struct RowAxes {
    /// The row's own identity and every inverse identity it names.
    identity: Vec<u32>,
    /// The relation family.
    family: u32,
    /// The base URL.
    base: u32,
}

/// Which axis ranks a partition unites through.
///
/// Beside the identity axis and the near-duplicate pairs it always honours.
#[derive(Copy, Clone)]
struct Ranks {
    family: bool,
    base: bool,
    /// The inclusive cosine-distance cut for near-duplicate pairs.
    cut: f64,
}

/// Every axis at full strength.
const RANKS_ALL: Ranks = Ranks {
    family: true,
    base: true,
    cut: f64::INFINITY,
};

/// Splits an over-budget component by relaxing its weakest remaining axis, recursing one rank
/// deeper wherever a part stays over budget.
///
/// The relaxation order is family, then base URL, then near-duplicate edges farthest-first;
/// identity edges never relax. A part the deepest relaxation cannot fit is accepted over budget and
/// counted in the evidence.
fn subdivide(
    component: &[u32],
    level: Relaxation,
    axes: &[RowAxes],
    pairs: &[(u32, u32, f64)],
    budget: f64,
    evidence: &mut AssemblyEvidence,
) -> Vec<Vec<u32>> {
    evidence.deepest_relaxation = evidence.deepest_relaxation.max(level);

    let (parts, deeper) = match level {
        Relaxation::None => unreachable!("subdivision engages at the family rank"),
        Relaxation::Family => (
            partition(
                component,
                axes,
                pairs,
                Ranks {
                    family: false,
                    ..RANKS_ALL
                },
            ),
            Relaxation::Base,
        ),
        Relaxation::Base => (
            partition(
                component,
                axes,
                pairs,
                Ranks {
                    family: false,
                    base: false,
                    ..RANKS_ALL
                },
            ),
            Relaxation::NearDuplicate,
        ),
        Relaxation::NearDuplicate => {
            let parts = farthest_first_cut(component, axes, pairs, budget);
            evidence.oversized_accepted += parts
                .iter()
                .filter(|part| integer(part.len() as u64) > budget)
                .count();
            return parts;
        }
    };

    let mut groups = Vec::with_capacity(parts.len());
    for part in parts {
        if integer(part.len() as u64) <= budget {
            groups.push(part);
        } else {
            groups.extend(subdivide(&part, deeper, axes, pairs, budget, evidence));
        }
    }
    groups
}

/// Cuts a component's near-duplicate edges farthest-first.
///
/// The kept cut is the largest distance under which every resulting part fits the budget, or the
/// empty cut when none does.
fn farthest_first_cut(
    component: &[u32],
    axes: &[RowAxes],
    pairs: &[(u32, u32, f64)],
    budget: f64,
) -> Vec<Vec<u32>> {
    // Candidate cuts are the distinct pair distances inside the
    // component, ascending; a cut keeps every pair at or under it.
    let mut distances: Vec<f64> = {
        let members: HashSet<u32> = component.iter().copied().collect();
        pairs
            .iter()
            .filter(|(left, right, _)| members.contains(left) && members.contains(right))
            .map(|&(_, _, distance)| distance)
            .collect()
    };
    distances.sort_unstable_by(f64::total_cmp);
    distances.dedup();

    let fits = |cut: f64| {
        partition(
            component,
            axes,
            pairs,
            Ranks {
                family: false,
                base: false,
                cut,
            },
        )
        .iter()
        .all(|part| integer(part.len() as u64) <= budget)
    };

    // Component size is monotone in the cut, so the fitting prefix of
    // the candidate list is contiguous and binary-searchable.
    let (mut fitting, mut exceeded) = (None, distances.len());
    let mut low = 0;
    while low < exceeded {
        let middle = usize::midpoint(low, exceeded);
        if fits(distances[middle]) {
            fitting = Some(distances[middle]);
            low = middle + 1;
        } else {
            exceeded = middle;
        }
    }

    // The empty cut keeps identity edges alone; the caller records
    // any part still over budget.
    partition(
        component,
        axes,
        pairs,
        Ranks {
            family: false,
            base: false,
            cut: fitting.unwrap_or(f64::NEG_INFINITY),
        },
    )
}

/// Unites a row subset through the admitted axis ranks and returns the resulting parts.
///
/// Members ascending, parts ordered by first member.
fn partition(
    subset: &[u32],
    axes: &[RowAxes],
    pairs: &[(u32, u32, f64)],
    ranks: Ranks,
) -> Vec<Vec<u32>> {
    let mut local_of: HashMap<u32, u32> = HashMap::with_capacity(subset.len());
    for (local, &row) in subset.iter().enumerate() {
        let local = u32::try_from(local).expect("the row domain is bound to u32");
        local_of.insert(row, local);
    }

    let mut components = DisjointSet::new(subset.len());
    let mut first_of_key: HashMap<u32, u32> = HashMap::new();
    for (local, &row) in subset.iter().enumerate() {
        let local = u32::try_from(local).expect("the row domain is bound to u32");
        let row_axes = &axes[row as usize];

        let mut join = |key: u32| match first_of_key.entry(key) {
            Entry::Occupied(first) => {
                components.unite(local, *first.get());
            }
            Entry::Vacant(slot) => {
                slot.insert(local);
            }
        };

        for &key in &row_axes.identity {
            join(key);
        }
        if ranks.family {
            join(row_axes.family);
        }
        if ranks.base {
            join(row_axes.base);
        }
    }

    for (left, right, distance) in pairs {
        if *distance <= ranks.cut
            && let (Some(&left), Some(&right)) = (local_of.get(left), local_of.get(right))
        {
            components.unite(left, right);
        }
    }

    let mut parts: Vec<Vec<u32>> = Vec::new();
    let mut part_of_representative: HashMap<u32, usize> = HashMap::new();
    for (local, &row) in subset.iter().enumerate() {
        let local = u32::try_from(local).expect("the row domain is bound to u32");
        let representative = components.find(local);
        let part = *part_of_representative
            .entry(representative)
            .or_insert_with(|| {
                parts.push(Vec::new());
                parts.len() - 1
            });
        parts[part].push(row);
    }

    parts
}

/// Returns the Dirichlet posterior-mean target over the geometry classes.
fn dirichlet_target(counts: &VoteCounts) -> [f64; GeometryClass::COUNT] {
    let total = integer(GeometryClass::COUNT as u64).mul_add(DIRICHLET_ALPHA, weight(counts));
    counts
        .geometry
        .map(|count| (integer(count) + DIRICHLET_ALPHA) / total)
}

/// Returns the card's geometry-vote total as the row weight.
fn weight(counts: &VoteCounts) -> f64 {
    integer(counts.weight())
}

/// Widens a vote count to `f64`.
#[expect(
    clippy::cast_precision_loss,
    reason = "vote counts are far below f64's 2^53 exact-integer range"
)]
const fn integer(count: u64) -> f64 {
    count as f64
}
