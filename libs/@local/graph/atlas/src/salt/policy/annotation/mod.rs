//! The supplied annotation corpus of relation cards and their votes.
//!
//! An annotation corpus is one JSON document supplied beside the
//! dataset, carrying every relation card in the classifier's training
//! deck: the structured content the card template renders, the
//! grouping axes that keep related cards in one evaluation fold, the
//! flags marking cards with special assembly-side handling, and the
//! verbatim per-vote annotation records. The document is the wire
//! boundary between the annotation tooling and the fit: rendered card
//! text, embeddings, class counts, and smoothed targets are all
//! derived in Rust from these fields.
//!
//! [`AnnotationCorpus::from_slice`] runs the whole wire contract at
//! construction - declared schema, cards strictly ascending by
//! identity in byte order, identity form per source, immutability
//! pins for unversioned sources, identifier-free content prose, flag
//! and vote coupling - so consumers read cards without re-checking.
//!
//! # Identity
//!
//! A card's identity is its canonical URL. Types from the hash store
//! are identified by their full versioned URL: versions are immutable
//! and distinct, and each version's card is its own annotation
//! subject. Wikidata records are unversioned at source, so their
//! entity-URL identity is pinned by a retrieval timestamp and the
//! digest of the retrieved source record ([`CardIdentity`]).
//!
//! # Vote semantics
//!
//! Votes are verbatim five-way records: the three [`GeometryClass`]es
//! plus `unclear` (the judge found the card ambiguous) and `abstain`
//! (the judge declined to answer). Class counts are derived by
//! counting the vote list ([`Card::vote_counts`]), so a document
//! cannot carry counts that disagree with their own provenance.
//! Unclear and abstain votes assert no geometry class: they are
//! excluded from both the per-class counts and the target weight,
//! discounting an uncertain card without distorting its target
//! distribution.
//!
//! # Content prose
//!
//! Every content string is identifier-free: the admission lint
//! rejects URL schemes and UUID-shaped tokens in card prose, carrying
//! the annotation tooling's sanitizer contract across the wire. Votes
//! were cast on rendered card text, and identifiers in prose would
//! let a judge bind an answer to a name instead of the content.

use alloc::collections::BTreeMap;
use core::{error::Error, fmt};

use type_system::ontology::id::VersionedUrl;

use crate::{integrity::Sha256Digest, salt::policy::GeometryClass};

pub(crate) mod assembly;

#[cfg(test)]
mod tests;

/// The schema identifier every accepted document must declare.
pub(crate) const ANNOTATION_CORPUS_SCHEMA: &str = "atlas-annotation-corpus/1";

/// The identity prefix of every wikidata entity URL.
const WIKIDATA_ENTITY_PREFIX: &str = "http://www.wikidata.org/entity/";

/// Deserializes a nullable field whose key must be present.
///
/// The canonical exporter writes every key; a fact the source does
/// not record is `null`, never an absent key. Serde defaults a
/// missing [`Option`] field to [`None`] silently, and routing the
/// field through this function restores the missing-key error.
fn nullable<'de, D, T>(deserializer: D) -> Result<Option<T>, D::Error>
where
    D: serde::Deserializer<'de>,
    T: serde::Deserialize<'de>,
{
    serde::Deserialize::deserialize(deserializer)
}

/// The annotation-corpus document violates its wire contract.
#[derive(Debug)]
pub(crate) enum InvalidAnnotationCorpus {
    /// The bytes are not the expected JSON shape.
    ///
    /// Unknown fields, unknown enum values, absent required keys, and
    /// noncanonical digests all surface here through their
    /// deserializers.
    Json(serde_json::Error),
    /// The document declares a schema this reader does not accept.
    Schema { found: Box<str> },
    /// A card is not strictly after its predecessor in byte order of
    /// identity, which also covers duplicated identities.
    UnorderedCards { index: usize },
    /// A card's identity does not parse under its source's identity
    /// form.
    IdentityForm { index: usize, source: Source },
    /// A wikidata card is missing an immutability pin.
    MissingPin { index: usize, field: &'static str },
    /// A hash card carries a pin reserved for unversioned sources.
    ForbiddenPin { index: usize, field: &'static str },
    /// A card field that must name something is empty.
    EmptyField { index: usize, field: &'static str },
    /// A content string carries a URL scheme or a UUID-shaped token.
    IdentifierInContent { index: usize, field: &'static str },
    /// An endpoint constraint's minimum exceeds its maximum.
    EndpointBounds { index: usize, constraint: usize },
    /// A shot-excluded card carries votes.
    ShotExcludedVotes { index: usize },
    /// A card that must carry evidence has no vote beyond abstention.
    NoEvidence { index: usize },
    /// A card's votes disagree on the card hash they judged.
    DisagreeingCardHash { index: usize },
    /// A vote field that must name something is empty.
    EmptyVoteField {
        index: usize,
        vote: usize,
        field: &'static str,
    },
    /// A vote's sampling temperature is not finite.
    NonFiniteTemperature { index: usize, vote: usize },
}

impl fmt::Display for InvalidAnnotationCorpus {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Json(_) => fmt.write_str("the annotation-corpus document is not valid JSON"),
            Self::Schema { found } => write!(
                fmt,
                "the document declares schema \"{found}\", not \"{ANNOTATION_CORPUS_SCHEMA}\"",
            ),
            Self::UnorderedCards { index } => write!(
                fmt,
                "card {index} is not strictly after its predecessor in byte order of identity",
            ),
            Self::IdentityForm { index, source } => write!(
                fmt,
                "card {index}'s identity does not parse under the {source} identity form",
            ),
            Self::MissingPin { index, field } => {
                write!(fmt, "wikidata card {index} is missing the {field} pin")
            }
            Self::ForbiddenPin { index, field } => write!(
                fmt,
                "hash card {index} carries the {field} pin reserved for unversioned sources",
            ),
            Self::EmptyField { index, field } => {
                write!(fmt, "card {index} has an empty {field}")
            }
            Self::IdentifierInContent { index, field } => write!(
                fmt,
                "card {index}'s {field} carries a URL scheme or UUID-shaped token",
            ),
            Self::EndpointBounds { index, constraint } => write!(
                fmt,
                "card {index}'s endpoint constraint {constraint} has a minimum above its maximum",
            ),
            Self::ShotExcludedVotes { index } => {
                write!(fmt, "shot-excluded card {index} carries votes")
            }
            Self::NoEvidence { index } => {
                write!(fmt, "card {index} carries no vote beyond abstention")
            }
            Self::DisagreeingCardHash { index } => {
                write!(
                    fmt,
                    "card {index}'s votes disagree on the card hash they judged"
                )
            }
            Self::EmptyVoteField { index, vote, field } => {
                write!(fmt, "card {index}'s vote {vote} has an empty {field}")
            }
            Self::NonFiniteTemperature { index, vote } => {
                write!(
                    fmt,
                    "card {index}'s vote {vote} has a non-finite temperature"
                )
            }
        }
    }
}

impl Error for InvalidAnnotationCorpus {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Json(error) => Some(error),
            Self::Schema { .. }
            | Self::UnorderedCards { .. }
            | Self::IdentityForm { .. }
            | Self::MissingPin { .. }
            | Self::ForbiddenPin { .. }
            | Self::EmptyField { .. }
            | Self::IdentifierInContent { .. }
            | Self::EndpointBounds { .. }
            | Self::ShotExcludedVotes { .. }
            | Self::NoEvidence { .. }
            | Self::DisagreeingCardHash { .. }
            | Self::EmptyVoteField { .. }
            | Self::NonFiniteTemperature { .. } => None,
        }
    }
}

/// The adapter namespace a card was exported from.
#[derive(Debug, Copy, Clone, PartialEq, Eq, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub(crate) enum Source {
    /// The hash store; identities are versioned URLs.
    Hash,
    /// Wikidata; identities are canonical entity URLs.
    Wikidata,
}

impl fmt::Display for Source {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str(match self {
            Self::Hash => "hash",
            Self::Wikidata => "wikidata",
        })
    }
}

/// A card's canonical identity, in its source's form.
///
/// The variant carries the facts its form requires: a versioned URL
/// is immutable by itself, while an unversioned wikidata record needs
/// a retrieval timestamp and the digest of the retrieved source
/// record to pin what the card was derived from.
#[derive(Debug, Clone, PartialEq)]
pub(crate) enum CardIdentity {
    /// A store type at an exact version.
    Hash(VersionedUrl),
    /// A wikidata record pinned at retrieval.
    Wikidata {
        /// The canonical entity URL.
        url: Box<str>,
        /// The retrieval instant, as the exporter recorded it.
        retrieved_at: Box<str>,
        /// The SHA-256 of the canonical-JSON bytes of the retrieved
        /// source record.
        source_record_hash: Sha256Digest,
    },
}

impl CardIdentity {
    /// Returns the canonical identity URL.
    #[must_use]
    pub(crate) fn canonical_url(&self) -> String {
        match self {
            Self::Hash(url) => url.to_string(),
            Self::Wikidata { url, .. } => url.to_string(),
        }
    }
}

/// A phrase with an optional gloss, as card prose renders it.
#[derive(Debug, Clone, PartialEq, serde::Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct Phrase {
    /// The phrase text.
    pub label: String,
    /// The gloss, when the source records one.
    #[serde(deserialize_with = "nullable")]
    pub description: Option<String>,
}

/// One endpoint cardinality constraint.
#[derive(Debug, Clone, PartialEq, serde::Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct EndpointConstraint {
    /// The source type's phrase.
    pub source_type: Phrase,
    /// The target types' phrases.
    pub target_types: Vec<Phrase>,
    /// The minimum target count, when the source records one.
    #[serde(deserialize_with = "nullable")]
    pub minimum_targets: Option<u32>,
    /// The maximum target count, when the source records one.
    #[serde(deserialize_with = "nullable")]
    pub maximum_targets: Option<u32>,
}

/// The directionality a relation's card asserts.
#[derive(Debug, Copy, Clone, PartialEq, Eq, serde::Deserialize)]
pub(crate) enum Direction {
    /// The relation reads the same from either endpoint.
    #[serde(rename = "symmetric")]
    Symmetric,
    /// The relation reads from source to target.
    #[serde(rename = "source -> target")]
    SourceToTarget,
}

/// The relation-property assertions a card renders.
///
/// The four boolean fields are tri-state: `true` asserts the
/// property, `false` asserts its absence, and `null` records that the
/// source does not record the fact. The exporter always writes every
/// key, so an absent key is a wire violation rather than a third
/// spelling of `null`.
#[derive(Debug, Clone, PartialEq, serde::Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct Constraints {
    /// The directionality assertion.
    pub direction: Direction,
    /// Whether the relation is symmetric.
    #[serde(deserialize_with = "nullable")]
    pub symmetric: Option<bool>,
    /// Whether the relation is transitive.
    #[serde(deserialize_with = "nullable")]
    pub transitive: Option<bool>,
    /// Whether a source holds at most one relation instance.
    #[serde(deserialize_with = "nullable")]
    pub single_value: Option<bool>,
    /// Whether instances of the relation have distinct targets.
    #[serde(deserialize_with = "nullable")]
    pub distinct_values: Option<bool>,
}

/// One rendered usage example.
#[derive(Debug, Clone, PartialEq, serde::Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct Example {
    /// The example's subject label.
    #[serde(rename = "subject_label")]
    pub subject: String,
    /// The example's object label.
    #[serde(rename = "object_label")]
    pub object: String,
    /// The stratum label, when the source records one.
    #[serde(rename = "stratum_label", deserialize_with = "nullable")]
    pub stratum: Option<String>,
}

/// The structured fields the canonical card template consumes.
///
/// The template renders these fields into the card text that is
/// embedded and classified; no rendered text and no embeddings travel
/// on the wire.
#[derive(Debug, Clone, PartialEq, serde::Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct Content {
    /// The prose language, as an IETF language tag.
    pub language: String,
    /// The relation's display title.
    pub title: String,
    /// The relation's description prose, when any survives.
    ///
    /// Identifier sanitization at the source can drop every sentence
    /// of a description; a card without one records `null`.
    #[serde(deserialize_with = "nullable")]
    pub description: Option<String>,
    /// Alternative names.
    pub aliases: Vec<String>,
    /// The inverse relation's phrase, when the source records one.
    #[serde(deserialize_with = "nullable")]
    pub inverse: Option<Phrase>,
    /// The ancestor relations' phrases, nearest first.
    pub ancestors: Vec<Phrase>,
    /// The endpoint cardinality constraints.
    pub endpoint_constraints: Vec<EndpointConstraint>,
    /// The source types' phrases.
    pub source_types: Vec<Phrase>,
    /// The target types' phrases.
    pub target_types: Vec<Phrase>,
    /// The relation-property assertions.
    pub constraints: Constraints,
    /// The usage examples.
    pub examples: Vec<Example>,
    /// The card's URL-safe name.
    pub slug: String,
}

/// The leakage axes a card is grouped by.
///
/// Evaluation folds union cards sharing any axis value, so related
/// cards never straddle a train/validation split. Axis values are
/// grouping strings; identity semantics live in
/// [`CardIdentity`] alone.
#[derive(Debug, Clone, PartialEq, serde::Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct Axes {
    /// The relation-family closure id.
    pub family: String,
    /// The canonical URLs of inverse relations.
    ///
    /// Values may name records outside this corpus; they still group
    /// as shared strings.
    pub inverse_of: Vec<String>,
    /// The identity URL with its version removed.
    pub base_url: String,
    /// The publishing namespace: `host/@web` for hash cards, the
    /// literal `wikidata` otherwise.
    pub publisher: String,
}

/// A held-out human verdict's class.
#[derive(Debug, Copy, Clone, PartialEq, Eq, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub(crate) enum HoldoutClass {
    /// The endpoints share a referent.
    Coincident,
    /// The relation makes its endpoints discoverably nearby.
    Proximal,
    /// The relation carries no placement force of its own.
    Overlay,
    /// The reviewer found the card ambiguous.
    Unclear,
}

impl HoldoutClass {
    /// Returns the geometry class the holdout verdict asserts.
    ///
    /// `Unclear` asserts none.
    #[must_use]
    pub(crate) const fn geometry(self) -> Option<GeometryClass> {
        match self {
            Self::Coincident => Some(GeometryClass::Coincident),
            Self::Proximal => Some(GeometryClass::Proximal),
            Self::Overlay => Some(GeometryClass::Overlay),
            Self::Unclear => None,
        }
    }
}

/// The special-handling marks on a card.
///
/// Flags record facts; the handling each fact demands is assembly
/// policy. A flagged card is never silently dropped by the reader.
#[derive(Debug, Clone, PartialEq, serde::Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct Flags {
    /// The card's verdict was disclosed in annotation prompts, so it
    /// carries no votes.
    pub shot_excluded: bool,
    /// The human verdict class held out for evaluation, when one
    /// exists.
    #[serde(deserialize_with = "nullable")]
    pub holdout: Option<HoldoutClass>,
    /// The prescreen stratum the card was drawn from, when one
    /// exists.
    ///
    /// A stratification fact, never an exclusion: `"unstratified"`
    /// is a legal value, and vote-coverage rules ignore this field.
    #[serde(deserialize_with = "nullable")]
    pub prescreen_stratum: Option<String>,
}

impl Flags {
    /// Returns whether the card must carry annotation evidence.
    ///
    /// Shot-excluded cards carry no votes by contract, and holdout
    /// cards answer to their human verdict; every other card must
    /// carry at least one vote beyond abstention.
    #[must_use]
    pub(crate) const fn expects_evidence(&self) -> bool {
        !self.shot_excluded && self.holdout.is_none()
    }
}

/// The verdict one vote asserts, verbatim from the judge.
#[derive(Debug, Copy, Clone, PartialEq, Eq, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub(crate) enum VoteVerdict {
    /// The endpoints share a referent.
    Coincident,
    /// The relation makes its endpoints discoverably nearby.
    Proximal,
    /// The relation carries no placement force of its own.
    Overlay,
    /// The judge found the card ambiguous.
    Unclear,
    /// The judge declined to answer.
    Abstain,
}

impl VoteVerdict {
    /// Returns the geometry class this verdict asserts.
    ///
    /// `Unclear` and `Abstain` assert none; they are excluded from
    /// class counts and target weight.
    #[must_use]
    pub(crate) const fn geometry(self) -> Option<GeometryClass> {
        match self {
            Self::Coincident => Some(GeometryClass::Coincident),
            Self::Proximal => Some(GeometryClass::Proximal),
            Self::Overlay => Some(GeometryClass::Overlay),
            Self::Unclear | Self::Abstain => None,
        }
    }
}

/// One annotation vote with its full provenance.
#[derive(Debug, Clone, PartialEq, serde::Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct Vote {
    /// The verdict the judge returned.
    pub verdict: VoteVerdict,
    /// The model id the run pinned.
    pub model_pinned: String,
    /// The model id the provider returned.
    pub model_returned: String,
    /// The serving provider's route slug.
    pub provider: String,
    /// The provider-reported quantization, when one was reported.
    #[serde(deserialize_with = "nullable")]
    pub quantization: Option<String>,
    /// The prompt-framing id.
    pub framing: String,
    /// The reasoning-effort rung.
    pub effort: String,
    /// The sampling temperature, when the run pinned one.
    ///
    /// Reasoning-model runs sample without a temperature control and
    /// record `null`.
    #[serde(deserialize_with = "nullable")]
    pub temperature: Option<f64>,
    /// The sampling seed, when the provider accepts one.
    #[serde(deserialize_with = "nullable")]
    pub seed: Option<u64>,
    /// The repeat index within the vote's sampling batch.
    pub repeat_index: u32,
    /// The SHA-256 of the rendered card text the judge saw.
    pub card_hash: Sha256Digest,
    /// The SHA-256 of the prompt pack the vote ran under.
    pub prompt_pack_hash: Sha256Digest,
    /// The rubric version the vote answered.
    pub rubric_version: String,
}

/// Per-card vote tallies, derived by counting.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct VoteCounts {
    /// Geometry-class vote counts in class order.
    pub geometry: [u64; GeometryClass::COUNT],
    /// Votes that found the card ambiguous.
    pub unclear: u64,
    /// Votes that declined to answer.
    pub abstain: u64,
}

impl VoteCounts {
    /// Returns the geometry-vote total, the card's target weight.
    #[must_use]
    pub(crate) fn weight(&self) -> u64 {
        self.geometry.iter().sum()
    }
}

/// One validated relation card.
#[derive(Debug, Clone, PartialEq)]
pub(crate) struct Card {
    /// The canonical identity.
    pub identity: CardIdentity,
    /// The structured template fields.
    pub content: Content,
    /// The leakage axes.
    pub axes: Axes,
    /// The special-handling marks.
    pub flags: Flags,
    /// The annotation votes.
    pub votes: Vec<Vote>,
}

impl Card {
    /// Tallies this card's votes.
    pub(crate) fn vote_counts(&self) -> VoteCounts {
        let mut counts = VoteCounts {
            geometry: [0; GeometryClass::COUNT],
            unclear: 0,
            abstain: 0,
        };
        for vote in &self.votes {
            match vote.verdict {
                VoteVerdict::Coincident | VoteVerdict::Proximal | VoteVerdict::Overlay => {
                    let class = vote
                        .verdict
                        .geometry()
                        .expect("a geometry verdict asserts a class");
                    counts.geometry[class.index()] += 1;
                }
                VoteVerdict::Unclear => counts.unclear += 1,
                VoteVerdict::Abstain => counts.abstain += 1,
            }
        }
        counts
    }
}

/// One card as the wire carries it, before contract validation.
#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields)]
struct WireCard {
    identity: String,
    source: Source,
    #[serde(deserialize_with = "nullable")]
    retrieved_at: Option<Box<str>>,
    #[serde(deserialize_with = "nullable")]
    source_record_hash: Option<Sha256Digest>,
    content: Content,
    axes: Axes,
    flags: Flags,
    votes: Vec<Vote>,
}

/// The wire document before contract validation.
#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields)]
struct Document {
    cards: Vec<WireCard>,
    schema: Box<str>,
    sources: BTreeMap<Box<str>, Sha256Digest>,
}

/// A validated annotation-corpus document.
///
/// Construction checks the whole wire contract; see the module
/// documentation for the clauses.
#[derive(Debug, Clone, PartialEq)]
pub(crate) struct AnnotationCorpus {
    cards: Vec<Card>,
    sources: BTreeMap<Box<str>, Sha256Digest>,
}

impl AnnotationCorpus {
    /// Parses and validates one document from its file bytes.
    ///
    /// # Errors
    ///
    /// Returns an [`InvalidAnnotationCorpus`] describing the first
    /// violated contract clause.
    pub(crate) fn from_slice(bytes: &[u8]) -> Result<Self, InvalidAnnotationCorpus> {
        let document: Document =
            serde_json::from_slice(bytes).map_err(InvalidAnnotationCorpus::Json)?;

        if &*document.schema != ANNOTATION_CORPUS_SCHEMA {
            return Err(InvalidAnnotationCorpus::Schema {
                found: document.schema,
            });
        }

        for (index, card) in document.cards.iter().enumerate().skip(1) {
            if document.cards[index - 1].identity >= card.identity {
                return Err(InvalidAnnotationCorpus::UnorderedCards { index });
            }
        }

        let cards = document
            .cards
            .into_iter()
            .enumerate()
            .map(|(index, card)| validate_card(index, card))
            .collect::<Result<_, _>>()?;

        Ok(Self {
            cards,
            sources: document.sources,
        })
    }

    /// Returns the cards, strictly ascending by identity in byte
    /// order.
    #[inline]
    #[must_use]
    pub(crate) const fn cards(&self) -> &[Card] {
        &self.cards
    }

    /// Returns the upstream artifacts the document was derived from,
    /// by name and content digest.
    #[inline]
    #[must_use]
    pub(crate) const fn sources(&self) -> &BTreeMap<Box<str>, Sha256Digest> {
        &self.sources
    }
}

/// Checks one wire card's contract clauses and types its identity.
fn validate_card(index: usize, card: WireCard) -> Result<Card, InvalidAnnotationCorpus> {
    let identity = validate_identity(index, &card)?;
    validate_content(index, &card.content)?;
    validate_axes(index, &card.axes)?;

    if card.flags.shot_excluded && !card.votes.is_empty() {
        return Err(InvalidAnnotationCorpus::ShotExcludedVotes { index });
    }
    if card.flags.expects_evidence()
        && !card
            .votes
            .iter()
            .any(|vote| vote.verdict != VoteVerdict::Abstain)
    {
        return Err(InvalidAnnotationCorpus::NoEvidence { index });
    }
    if let Some((first, rest)) = card.votes.split_first()
        && rest.iter().any(|vote| vote.card_hash != first.card_hash)
    {
        return Err(InvalidAnnotationCorpus::DisagreeingCardHash { index });
    }
    if let Some(stratum) = &card.flags.prescreen_stratum
        && stratum.is_empty()
    {
        return Err(InvalidAnnotationCorpus::EmptyField {
            index,
            field: "prescreen_stratum",
        });
    }

    validate_votes(index, &card.votes)?;

    Ok(Card {
        identity,
        content: card.content,
        axes: card.axes,
        flags: card.flags,
        votes: card.votes,
    })
}

/// Types a wire card's identity under its source's form and pin
/// rules.
fn validate_identity(
    index: usize,
    card: &WireCard,
) -> Result<CardIdentity, InvalidAnnotationCorpus> {
    match card.source {
        Source::Hash => {
            for (field, present) in [
                ("retrieved_at", card.retrieved_at.is_some()),
                ("source_record_hash", card.source_record_hash.is_some()),
            ] {
                if present {
                    return Err(InvalidAnnotationCorpus::ForbiddenPin { index, field });
                }
            }
            card.identity
                .parse()
                .map(CardIdentity::Hash)
                .map_err(|_error| InvalidAnnotationCorpus::IdentityForm {
                    index,
                    source: Source::Hash,
                })
        }
        Source::Wikidata => {
            let entity = card
                .identity
                .strip_prefix(WIKIDATA_ENTITY_PREFIX)
                .unwrap_or_default();
            if entity.is_empty() {
                return Err(InvalidAnnotationCorpus::IdentityForm {
                    index,
                    source: Source::Wikidata,
                });
            }
            let retrieved_at =
                card.retrieved_at
                    .clone()
                    .ok_or(InvalidAnnotationCorpus::MissingPin {
                        index,
                        field: "retrieved_at",
                    })?;
            if retrieved_at.is_empty() {
                return Err(InvalidAnnotationCorpus::EmptyField {
                    index,
                    field: "retrieved_at",
                });
            }
            let source_record_hash =
                card.source_record_hash
                    .ok_or(InvalidAnnotationCorpus::MissingPin {
                        index,
                        field: "source_record_hash",
                    })?;
            Ok(CardIdentity::Wikidata {
                url: card.identity.clone().into_boxed_str(),
                retrieved_at,
                source_record_hash,
            })
        }
    }
}

/// Checks one card's content strings and endpoint bounds.
fn validate_content(index: usize, content: &Content) -> Result<(), InvalidAnnotationCorpus> {
    let mut prose: Vec<(&'static str, &str)> = vec![
        ("language", &content.language),
        ("title", &content.title),
        ("slug", &content.slug),
    ];
    prose.extend(content.aliases.iter().map(|alias| ("aliases", &**alias)));
    if let Some(phrase) = &content.inverse {
        collect_phrase(&mut prose, "inverse", phrase);
    }
    for phrase in &content.ancestors {
        collect_phrase(&mut prose, "ancestors", phrase);
    }
    for constraint in &content.endpoint_constraints {
        collect_phrase(
            &mut prose,
            "endpoint_constraints.source_type",
            &constraint.source_type,
        );
        for phrase in &constraint.target_types {
            collect_phrase(&mut prose, "endpoint_constraints.target_types", phrase);
        }
    }
    for phrase in &content.source_types {
        collect_phrase(&mut prose, "source_types", phrase);
    }
    for phrase in &content.target_types {
        collect_phrase(&mut prose, "target_types", phrase);
    }
    for example in &content.examples {
        prose.push(("examples.subject_label", &example.subject));
        prose.push(("examples.object_label", &example.object));
        if let Some(stratum) = &example.stratum {
            prose.push(("examples.stratum_label", stratum));
        }
    }

    if let Some(description) = &content.description {
        prose.push(("description", description));
    }
    for &(field, value) in &prose {
        if value.is_empty() {
            return Err(InvalidAnnotationCorpus::EmptyField { index, field });
        }
    }
    for &(field, value) in &prose {
        if contains_identifier(value) {
            return Err(InvalidAnnotationCorpus::IdentifierInContent { index, field });
        }
    }

    for (constraint, bounds) in content.endpoint_constraints.iter().enumerate() {
        if let (Some(minimum), Some(maximum)) = (bounds.minimum_targets, bounds.maximum_targets)
            && minimum > maximum
        {
            return Err(InvalidAnnotationCorpus::EndpointBounds { index, constraint });
        }
    }

    Ok(())
}

/// Collects a phrase's label and gloss into the prose list.
fn collect_phrase<'content>(
    prose: &mut Vec<(&'static str, &'content str)>,
    field: &'static str,
    phrase: &'content Phrase,
) {
    prose.push((field, &phrase.label));
    if let Some(description) = &phrase.description {
        prose.push((field, description));
    }
}

/// Checks one card's axis strings.
fn validate_axes(index: usize, axes: &Axes) -> Result<(), InvalidAnnotationCorpus> {
    let mut fields: Vec<(&'static str, &str)> = vec![
        ("family", &axes.family),
        ("base_url", &axes.base_url),
        ("publisher", &axes.publisher),
    ];
    fields.extend(axes.inverse_of.iter().map(|url| ("inverse_of", &**url)));
    for (field, value) in fields {
        if value.is_empty() {
            return Err(InvalidAnnotationCorpus::EmptyField { index, field });
        }
    }
    Ok(())
}

/// Checks every vote's provenance strings and temperature.
fn validate_votes(index: usize, votes: &[Vote]) -> Result<(), InvalidAnnotationCorpus> {
    for (vote_index, vote) in votes.iter().enumerate() {
        let mut fields = vec![
            ("model_pinned", &vote.model_pinned),
            ("model_returned", &vote.model_returned),
            ("provider", &vote.provider),
            ("framing", &vote.framing),
            ("effort", &vote.effort),
            ("rubric_version", &vote.rubric_version),
        ];
        if let Some(quantization) = &vote.quantization {
            fields.push(("quantization", quantization));
        }
        for (field, value) in fields {
            if value.is_empty() {
                return Err(InvalidAnnotationCorpus::EmptyVoteField {
                    index,
                    vote: vote_index,
                    field,
                });
            }
        }
        if let Some(temperature) = vote.temperature
            && !temperature.is_finite()
        {
            return Err(InvalidAnnotationCorpus::NonFiniteTemperature {
                index,
                vote: vote_index,
            });
        }
    }
    Ok(())
}

/// Returns whether `text` carries a URL scheme or a UUID-shaped
/// token.
fn contains_identifier(text: &str) -> bool {
    text.contains("://") || text.as_bytes().windows(36).any(is_uuid_shape)
}

/// Returns whether a 36-byte window has the 8-4-4-4-12 hex shape.
fn is_uuid_shape(window: &[u8]) -> bool {
    window.iter().enumerate().all(|(position, &byte)| {
        if matches!(position, 8 | 13 | 18 | 23) {
            byte == b'-'
        } else {
            byte.is_ascii_hexdigit()
        }
    })
}
