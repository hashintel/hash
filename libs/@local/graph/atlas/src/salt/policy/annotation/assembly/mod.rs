//! Classifier training-set assembly over a validated annotation corpus.
//!
//! [`assemble`] turns an [`AnnotationCorpus`] into everything the
//! classifier fit consumes: each admitted card is rendered through the
//! canonical card template, embedded, given a smoothed soft target and
//! a vote weight, and assigned to the indivisible validation group its
//! leakage axes and near-duplicate neighbours imply. The output is
//! deterministic in the corpus bytes, the embedding provider, and the
//! [`AssemblyConfig`], so one corpus assembles to one training set.
//!
//! Rendering goes through the same template, budgets, and lint as
//! generation-time production cards, so classifier-time and
//! generation-time card text cannot drift from each other.
//!
//! # Card policy
//!
//! Flags record facts; this module is the explicit policy deciding
//! what they mean for training:
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
//! With `n_k` the card's votes for geometry class `k` (of `K = 3`
//! classes) and `m = sum_k n_k` its geometry-vote total, the soft
//! target is the Dirichlet posterior mean
//!
//! ```text
//! q_k = (n_k + alpha) / (m + K * alpha),    alpha = 1/2,
//! ```
//!
//! the Jeffreys prior: a card's target stays a proper distribution at
//! any vote count, and few-vote cards shrink toward uniform instead
//! of asserting certainty their evidence does not carry. The row
//! weight is `m`, so the fit's cross-entropy counts each geometry
//! vote once.
//!
//! # Validation groups
//!
//! Rows that could leak shared content across a train/validation
//! split must share a group. A union-find joins cards through every
//! value-keyed leakage axis - relation family, inverse pair (through
//! the named identity, on or off corpus), base URL - and through
//! near-duplication of the rendered cards themselves: two rows join
//! when the cosine distance `1 - cos` between their embeddings is at
//! most [`AssemblyConfig::near_duplicate_epsilon`], and the exact
//! all-pairs graph is affordable at annotation-corpus scale. The
//! group label is the SHA-256 over the component's member identity
//! URLs in ascending byte order, so it is stable under any traversal
//! order.
//!
//! Publisher is not a union axis: on the live corpus it collapses the
//! 1,684 cards into 5 components (1,619 under `wikidata`), leaving
//! grouped validation nothing to validate. The axis stays on the wire
//! as a recorded fact for stratified evaluation.

use std::collections::HashMap;

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

/// The Dirichlet smoothing strength: the Jeffreys prior for a
/// three-class multinomial.
const DIRICHLET_ALPHA: f64 = 0.5;

/// The prose language every corpus card must declare.
///
/// The template's sentence segmentation and token budgets are
/// properties of one corpus language, and production cards render
/// under the same tag.
const CARD_LANGUAGE: &str = "en";

/// Assembly settings.
#[derive(Debug, Copy, Clone, PartialEq, Default)]
pub(crate) struct AssemblyConfig {
    /// The cosine-distance threshold under which two rendered cards
    /// count as near-duplicates and share a validation group, on the
    /// `1 - cos` scale in `[0, 2]`. Positive. Defaults to `2e-3`, the
    /// near-tie threshold established for this embedding family.
    pub near_duplicate_epsilon: f64 = 2.0e-3,
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
    /// An endpoint constraint's minimum target count exceeds its
    /// maximum.
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
/// Destined for the generation metadata beside the fit evidence, so a
/// published classifier names the corpus policy outcomes it was
/// trained under.
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
    /// Rows whose rendering exceeded the hard budget or dropped more
    /// than half their examples.
    pub severely_truncated: usize,
    /// Indivisible validation groups over the trained rows.
    pub fold_groups: usize,
    /// Near-duplicate pairs found at the configured threshold.
    pub near_duplicate_pairs: usize,
    /// The threshold the near-duplicate derivation ran under.
    pub near_duplicate_epsilon: f64,
}

/// One human-verdict holdout card, rendered and embedded beside the
/// training rows.
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
/// Row `i` of the embedding table, the training rows, and the
/// identities all describe the same card; holdout cards occupy the
/// table rows after the trained rows, addressed through
/// [`holdouts`](Self::holdouts). The table is the artifact shape the
/// fit stages and maps; the mapped embedding matrix's leading trained
/// rows and [`rows`](Self::rows) together satisfy the classifier's
/// training-set contract.
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
/// See the module documentation for the card policy, the target
/// arithmetic, and the grouping semantics.
///
/// # Errors
///
/// Returns an [`AssemblyError`] when a card declares a language the
/// template does not render, carries an impossible endpoint
/// cardinality, fails template rendering, when the embedding provider
/// fails, or when policy admits no card.
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
/// The returned digests align with `trained`; the evidence gains the
/// group count and the near-duplicate pair count.
fn validation_groups(
    trained: &[(usize, &Card, VoteCounts)],
    view: CardEmbeddingView<'_>,
    config: AssemblyConfig,
    evidence: &mut AssemblyEvidence,
) -> Vec<Sha256Digest> {
    let rows = trained.len();

    // Value-keyed axis nodes join cards sharing an axis value; an
    // inverse pair meets at the named identity's node whether or not
    // that identity is itself on the corpus.
    let mut keys = HashMap::new();
    let intern = |keys: &mut HashMap<String, usize>, key: String| {
        let next = rows + keys.len();
        *keys.entry(key).or_insert(next)
    };

    let mut edges = Vec::new();
    for (row, (_, corpus_card, _)) in trained.iter().enumerate() {
        let axes = &corpus_card.axes;
        let identity = corpus_card.identity.canonical_url();

        for key in [
            format!("id:{identity}"),
            format!("family:{}", axes.family),
            format!("base:{}", axes.base_url),
        ] {
            edges.push((row, intern(&mut keys, key)));
        }

        for inverse in &axes.inverse_of {
            edges.push((row, intern(&mut keys, format!("id:{inverse}"))));
        }
    }

    let mut components = DisjointSet::new(rows + keys.len());
    // The constructor asserts the whole domain fits the u32 encoding,
    // so every node index converts.
    let node = |value: usize| u32::try_from(value).expect("the domain is bound to u32");
    for (row, key) in edges {
        components.unite(node(row), node(key));
    }

    for left in 0..rows {
        let embedding = view
            .embedding(OntologyRowId::new(left as u64))
            .expect("the table holds one row per trained card");
        for right in (left + 1)..rows {
            let other = view
                .embedding(OntologyRowId::new(right as u64))
                .expect("the table holds one row per trained card");

            if f64::from(embedding.cosine_distance(other)) <= config.near_duplicate_epsilon {
                evidence.near_duplicate_pairs += 1;
                components.unite(node(left), node(right));
            }
        }
    }

    // Trained rows ascend by card identity (the corpus order), so each
    // component's members are already in ascending byte order.
    let mut members: HashMap<u32, Vec<usize>> = HashMap::new();
    for row in 0..rows {
        members
            .entry(components.find(node(row)))
            .or_default()
            .push(row);
    }
    evidence.fold_groups = members.len();

    let digests: HashMap<u32, Sha256Digest> = members
        .into_iter()
        .map(|(representative, member_rows)| {
            let mut hasher = Sha256::new();
            for row in member_rows {
                let (_, corpus_card, _) = &trained[row];
                hasher.update(corpus_card.identity.canonical_url().as_bytes());
                hasher.update(b"\n");
            }

            (representative, hasher.finalize())
        })
        .collect();

    (0..rows)
        .map(|row| digests[&components.find(node(row))])
        .collect()
}

/// Returns the Dirichlet posterior-mean target over the geometry
/// classes.
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
