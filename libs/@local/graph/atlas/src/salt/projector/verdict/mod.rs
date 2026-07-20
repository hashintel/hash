//! Reviewed placement verdicts: the supplied human-review input.
//!
//! A reviewed-verdicts document carries the placement classes a human
//! reviewer confirmed for relation types - the highest-provenance
//! evidence the trainer consumes. The file is an input to the fit in
//! the same category as the policy override table: supplied beside the
//! corpus, recorded by content hash, never derived by the pipeline.
//!
//! A type verdict for a store-native type names the exact type
//! VERSION whose rendered card the reviewer saw, and resolution is
//! version-precise: the verdict binds only that version's ontology
//! row. Other versions of the same type are unreviewed and take their
//! policy from lower-precedence sources, and a reviewed version absent
//! from the corpus snapshot resolves to no row at all - reported as
//! evidence, not an error, because snapshots legitimately move on.
//! Verdicts for foreign-corpus types carry no store identity and are
//! likewise evidence: the review is preserved, nothing in this corpus
//! answers to it.
//! because snapshots legitimately move past reviewed versions.
//!
//! Resolution derives the id naming each reviewed versioned URL in
//! the corpus's own id space ([`OntologyIdentity`]) and matches it
//! against the corpus type table, whose position IS the ontology row.
//! The
//! primary consumer is the training loop's phase boundary, which
//! calibrates the Proximal radius from the reviewed-Proximal types'
//! attraction pairs.
//!
//! Pair-level verdicts (a placement class for one concrete entity
//! pair) are parsed and validated but not yet resolved: no exporter
//! emits them, so the wire form of their entity references has never
//! been pinned against real bytes. Their resolution lands with the
//! first exporter that produces one.

pub(crate) mod calibrate;

#[cfg(test)]
mod tests;

use alloc::collections::BTreeMap;
use core::{error::Error, fmt, hash::Hash};
use std::collections::HashMap;

use type_system::ontology::id::VersionedUrl;

use crate::{
    dataset::{OntologyIdentity, OntologyRowId},
    integrity::Sha256Digest,
};

/// The schema identifier every accepted document must declare.
pub(crate) const REVIEWED_VERDICTS_SCHEMA: &str = "atlas-reviewed-verdicts/1";

/// A reviewed-verdicts document violated the wire contract.
#[derive(Debug)]
pub(crate) enum InvalidReviewedVerdicts {
    /// The bytes are not the expected JSON shape.
    ///
    /// Unknown fields, unknown placement classes, malformed versioned
    /// URLs, and noncanonical digests all surface here through their
    /// deserializers.
    Json(serde_json::Error),
    /// The document declares a schema this reader does not accept.
    Schema { found: Box<str> },
    /// A type verdict is not strictly after its predecessor in
    /// relation order, which also covers duplicated relations.
    UnorderedTypeVerdicts { index: usize },
    /// A type verdict repeats an earlier verdict's versioned URL.
    DuplicateVersion { index: usize },
    /// A type verdict carries an empty string field.
    EmptyTypeVerdictField { index: usize, field: &'static str },
    /// A pair verdict is not strictly after its predecessor in
    /// `(left, right)` order, which also covers duplicated pairs.
    UnorderedPairVerdicts { index: usize },
    /// A pair verdict carries an empty string field.
    EmptyPairVerdictField { index: usize, field: &'static str },
}

impl fmt::Display for InvalidReviewedVerdicts {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Json(_) => fmt.write_str("the reviewed-verdicts document is not valid JSON"),
            Self::Schema { found } => write!(
                fmt,
                "the document declares schema \"{found}\", not \"{REVIEWED_VERDICTS_SCHEMA}\"",
            ),
            Self::UnorderedTypeVerdicts { index } => write!(
                fmt,
                "type verdict {index} is not strictly after its predecessor in relation order",
            ),
            Self::DuplicateVersion { index } => write!(
                fmt,
                "type verdict {index} repeats an earlier verdict's versioned URL",
            ),
            Self::EmptyTypeVerdictField { index, field } => {
                write!(fmt, "type verdict {index} has an empty {field}")
            }
            Self::UnorderedPairVerdicts { index } => write!(
                fmt,
                "pair verdict {index} is not strictly after its predecessor in (left, right) order",
            ),
            Self::EmptyPairVerdictField { index, field } => {
                write!(fmt, "pair verdict {index} has an empty {field}")
            }
        }
    }
}

impl Error for InvalidReviewedVerdicts {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Json(error) => Some(error),
            Self::Schema { .. }
            | Self::UnorderedTypeVerdicts { .. }
            | Self::DuplicateVersion { .. }
            | Self::EmptyTypeVerdictField { .. }
            | Self::UnorderedPairVerdicts { .. }
            | Self::EmptyPairVerdictField { .. } => None,
        }
    }
}

/// A human-confirmed placement class.
///
/// `excluded` reviews are supervised exclusions, not placements; the
/// exporter omits them, so no fourth variant exists here.
#[derive(Debug, Copy, Clone, PartialEq, Eq, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub(crate) enum PlacementClass {
    /// Instances of the relation should render at the same point.
    Coincident,
    /// Instances of the relation should render near each other.
    Proximal,
    /// The relation carries no placement force of its own.
    Overlay,
}

/// One reviewed placement class for a relation type.
#[derive(Debug, Clone, PartialEq, serde::Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct TypeVerdict {
    /// The confirmed placement class.
    #[serde(rename = "class")]
    pub placement: PlacementClass,
    /// The review corpus's own relation identity, carried as
    /// provenance; resolution never consumes it.
    pub relation: String,
    /// The reviewer who confirmed the class.
    pub reviewer: String,
    /// The exact type version whose card the reviewer saw - the
    /// resolution key.
    ///
    /// Only types with a store identity record one; a verdict for a
    /// foreign-corpus type carries [`None`], can never resolve to an
    /// ontology row, and lands in the unresolved evidence.
    pub versioned_url: Option<VersionedUrl>,
}

/// One reviewed placement class for a concrete entity pair.
///
/// Carried and validated, not yet resolved; see the module
/// documentation.
#[derive(Debug, Clone, PartialEq, serde::Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct PairVerdict {
    /// The confirmed placement class.
    #[serde(rename = "class")]
    pub placement: PlacementClass,
    /// The pair property the review asserts, such as same-referent.
    pub kind: String,
    /// The review corpus's identity for the pair's first entity.
    pub left: String,
    /// The review corpus's identity for the pair's second entity.
    pub right: String,
}

/// The wire document before contract validation.
#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields)]
struct Document {
    schema: Box<str>,
    type_verdicts: Vec<TypeVerdict>,
    pair_verdicts: Vec<PairVerdict>,
    sources: BTreeMap<Box<str>, Sha256Digest>,
}

/// A validated reviewed-verdicts document.
///
/// Construction checks the whole wire contract - declared schema, type
/// verdicts strictly ascending by relation with unique versioned URLs,
/// pair verdicts strictly ascending by `(left, right)`, no empty
/// identity fields - so consumers read verdicts without re-checking.
#[derive(Debug, Clone, PartialEq)]
pub(crate) struct ReviewedVerdicts {
    type_verdicts: Vec<TypeVerdict>,
    pair_verdicts: Vec<PairVerdict>,
    sources: BTreeMap<Box<str>, Sha256Digest>,
}

impl ReviewedVerdicts {
    /// Parses and validates one document from its file bytes.
    ///
    /// # Errors
    ///
    /// Returns an [`InvalidReviewedVerdicts`] describing the first
    /// violated contract clause.
    pub(crate) fn from_slice(bytes: &[u8]) -> Result<Self, InvalidReviewedVerdicts> {
        let document: Document =
            serde_json::from_slice(bytes).map_err(InvalidReviewedVerdicts::Json)?;

        if &*document.schema != REVIEWED_VERDICTS_SCHEMA {
            return Err(InvalidReviewedVerdicts::Schema {
                found: document.schema,
            });
        }

        for (index, verdict) in document.type_verdicts.iter().enumerate() {
            for (field, value) in [
                ("relation", &verdict.relation),
                ("reviewer", &verdict.reviewer),
            ] {
                if value.is_empty() {
                    return Err(InvalidReviewedVerdicts::EmptyTypeVerdictField { index, field });
                }
            }

            if let Some(prior) = index
                .checked_sub(1)
                .map(|prior| &document.type_verdicts[prior])
                && prior.relation >= verdict.relation
            {
                return Err(InvalidReviewedVerdicts::UnorderedTypeVerdicts { index });
            }

            // Two verdicts without a store identity are not duplicates
            // of each other; only a repeated identity conflicts.
            if verdict.versioned_url.is_some()
                && document.type_verdicts[..index]
                    .iter()
                    .any(|prior| prior.versioned_url == verdict.versioned_url)
            {
                return Err(InvalidReviewedVerdicts::DuplicateVersion { index });
            }
        }

        for (index, verdict) in document.pair_verdicts.iter().enumerate() {
            for (field, value) in [
                ("kind", &verdict.kind),
                ("left", &verdict.left),
                ("right", &verdict.right),
            ] {
                if value.is_empty() {
                    return Err(InvalidReviewedVerdicts::EmptyPairVerdictField { index, field });
                }
            }

            if let Some(prior) = index
                .checked_sub(1)
                .map(|prior| &document.pair_verdicts[prior])
                && (&prior.left, &prior.right) >= (&verdict.left, &verdict.right)
            {
                return Err(InvalidReviewedVerdicts::UnorderedPairVerdicts { index });
            }
        }

        Ok(Self {
            type_verdicts: document.type_verdicts,
            pair_verdicts: document.pair_verdicts,
            sources: document.sources,
        })
    }

    /// Returns the type verdicts, strictly ascending by relation.
    #[inline]
    #[must_use]
    pub(crate) const fn type_verdicts(&self) -> &[TypeVerdict] {
        &self.type_verdicts
    }

    /// Returns the pair verdicts, strictly ascending by `(left, right)`.
    #[inline]
    #[must_use]
    pub(crate) const fn pair_verdicts(&self) -> &[PairVerdict] {
        &self.pair_verdicts
    }

    /// Returns the review corpus's recorded source-artifact digests.
    #[inline]
    #[must_use]
    pub(crate) const fn sources(&self) -> &BTreeMap<Box<str>, Sha256Digest> {
        &self.sources
    }

    /// Resolves every type verdict against a corpus type table.
    ///
    /// `ontology` is the type table in ontology row order, keyed by
    /// the corpus's own id type. Each verdict's versioned URL derives
    /// the id naming it in that id space, and a matching table
    /// position resolves the verdict to that row. Verdicts naming no
    /// id - an unreviewed version, a foreign identity form, or a
    /// positional id space - land in
    /// [`unresolved`](ResolvedVerdicts::unresolved).
    #[must_use]
    pub(crate) fn resolve<O>(&self, ontology: &[O]) -> ResolvedVerdicts<'_>
    where
        O: OntologyIdentity + Eq + Hash,
    {
        // Validation rejected duplicate versioned URLs, so every
        // verdict owns its map entry.
        let targets: HashMap<O, usize> = self
            .type_verdicts
            .iter()
            .enumerate()
            .filter_map(|(index, verdict)| {
                let url = verdict.versioned_url.as_ref()?;
                Some((O::from_versioned_url(url)?, index))
            })
            .collect();

        let mut matched = vec![false; self.type_verdicts.len()];
        let mut resolved = Vec::new();
        for (row, id) in ontology.iter().enumerate() {
            let Some(&index) = targets.get(id) else {
                continue;
            };

            matched[index] = true;
            resolved.push(ResolvedVerdict {
                relation: OntologyRowId::new(
                    u64::try_from(row).expect("the type table is shorter than u64::MAX rows"),
                ),
                placement: self.type_verdicts[index].placement,
            });
        }

        let unresolved = matched
            .iter()
            .zip(&self.type_verdicts)
            .filter_map(|(&hit, verdict)| (!hit).then_some(verdict))
            .collect();

        ResolvedVerdicts {
            resolved,
            unresolved,
        }
    }
}

/// One type verdict resolved to its ontology row.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct ResolvedVerdict {
    /// The reviewed version's ontology row.
    pub relation: OntologyRowId,
    /// The confirmed placement class.
    pub placement: PlacementClass,
}

/// The outcome of resolving a document against one corpus snapshot.
#[derive(Debug)]
pub(crate) struct ResolvedVerdicts<'verdicts> {
    resolved: Vec<ResolvedVerdict>,
    unresolved: Vec<&'verdicts TypeVerdict>,
}

impl<'verdicts> ResolvedVerdicts<'verdicts> {
    /// Returns the resolved verdicts, ascending by relation row.
    #[inline]
    #[must_use]
    pub(crate) const fn resolved(&self) -> &[ResolvedVerdict] {
        &self.resolved
    }

    /// Returns the verdicts that resolve to no row - the reviewed
    /// version is not in the snapshot, or the verdict records no
    /// store identity at all - in document order. Evidence data, not
    /// a failure.
    #[inline]
    #[must_use]
    pub(crate) const fn unresolved(&self) -> &[&'verdicts TypeVerdict] {
        &self.unresolved
    }
}
