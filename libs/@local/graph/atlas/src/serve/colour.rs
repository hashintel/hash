//! Type colouring.
//!
//! Resolving `coloredTypeIds` to per-type memberships with descendant expansion, the `TYPE_MASK`
//! column's serving source.
//!
//! Each requested id arrives as a [`VersionedUrl`] - the transport parses the request body, so it
//! rejects a malformed entry before assembly begins. [`Palette::of`] derives each entry's ontology
//! identity once at the assembly boundary, and everything after it carries those trivially copyable
//! identities. Every resolution reads the generation's snapshot. The identity joins the
//! generation's ontology identity table, and the resulting row names a closure-map row whose set
//! bits are every type the request matches - the type itself and all its descendants. The tile path
//! never consults the live store.
//!
//! Failure to resolve stays legal. A well-formed id this generation never ingested (a client
//! ontology newer than the snapshot, or a corpus whose ontology ids are not store identities) reads
//! as zero bits in every point's mask and never as an error.

use hashql_core::id::bit_vec::{BitRelations as _, RowRef};
use type_system::ontology::id::{OntologyTypeUuid, VersionedUrl};

use super::Atlas;
use crate::{
    bitset::DenseBitSlice,
    dataset::postgres::id::ArchivedOntologyTypeUuid,
    identity::{BasePosition, OntologyRowId},
    salt::{
        fit::prepare::identity::IdentityTableArchive,
        postings::{artifact::PostingsArchive, closure::ClosureMap},
    },
};

/// One request's colour palette.
///
/// Each slot is one `coloredTypeIds` entry as an ontology identity. Slot order is the request's:
/// `TYPE_MASK` bit `i`, mask source `i`, and palette slot `i` are one request entry.
#[derive(Debug)]
pub(super) struct Palette {
    entries: Vec<ArchivedOntologyTypeUuid>,
}

impl Palette {
    /// Derives the palette of the request's ids, one slot per entry.
    pub(super) fn of(ids: &[VersionedUrl]) -> Self {
        Self {
            entries: ids.iter().map(identity_of).collect(),
        }
    }

    /// Returns whether the palette carries no entry.
    pub(super) const fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }

    /// Returns whether `url` names a palette entry.
    ///
    /// Comparison is by parsed ontology identity - any spelling that names the same versioned type
    /// covers it, matching the mask resolution's own parse. No entry covers an unparsable `url`.
    pub(super) fn covers(&self, url: &str) -> bool {
        url.parse::<VersionedUrl>()
            .is_ok_and(|url| self.entries.contains(&identity_of(&url)))
    }
}

/// Derives a versioned type URL's ontology identity.
fn identity_of(url: &VersionedUrl) -> ArchivedOntologyTypeUuid {
    ArchivedOntologyTypeUuid::from(OntologyTypeUuid::from_url(url).into_uuid())
}

/// The mask sources of one request's `coloredTypeIds`, in request order.
///
/// Materialized unions live here so the [`Membership`] views the encoder consumes can borrow them
/// beside the mapped postings.
///
/// [`Membership`]: crate::salt::postings::artifact::Membership
#[derive(Debug)]
pub(super) struct MaskSet {
    sources: Vec<MaskSource>,
}

/// One requested id's resolved membership source.
#[derive(Debug)]
enum MaskSource {
    /// The id resolved to a type without proper descendants: the stored membership serves directly.
    Stored(OntologyRowId),
    /// The id resolved to a type with proper descendants.
    ///
    /// The dense union of the closure row's memberships, as one bit set frame - the postings' own
    /// dense vocabulary, so stored and materialized masks serve through one view.
    Union(Box<DenseBitSlice<BasePosition>>),
    /// The id resolved to no type in this generation: zero bits.
    Unresolved,
}

impl MaskSet {
    /// Views the sources as the encoder's membership slice, in request order.
    pub(super) fn memberships<'doc>(
        &'doc self,
        postings: &'doc PostingsArchive,
    ) -> Vec<crate::salt::postings::artifact::Membership<'doc>> {
        use crate::salt::postings::artifact::Membership;

        self.sources
            .iter()
            .map(|source| match source {
                MaskSource::Stored(row) => postings
                    .membership(*row)
                    .expect("resolved rows lie inside the postings' type domain"),
                MaskSource::Union(words) => Membership::Dense(words),
                MaskSource::Unresolved => Membership::List(&[]),
            })
            .collect()
    }
}

impl Atlas {
    /// Resolves one request's palette into mask sources, in slot order.
    pub(super) fn resolve_masks(&self, palette: &Palette) -> MaskSet {
        resolve_masks(&self.postings, &self.closure, &self.ontology_ids, palette)
    }
}

/// Materializes the dense union of every set type's membership.
///
/// One bit set frame over base positions: the postings' own dense vocabulary, so stored and
/// materialized masks serve through one view.
fn union_membership(
    postings: &PostingsArchive,
    descendants: RowRef<'_, OntologyRowId>,
) -> Box<DenseBitSlice<BasePosition>> {
    use crate::salt::postings::artifact::Membership;

    let points = usize::try_from(postings.points()).expect("point domains fit usize");
    let mut bitmap = DenseBitSlice::new_empty(points);

    for type_row in &descendants {
        let membership = postings
            .membership(type_row)
            .expect("closure rows lie inside the postings' type domain");

        match membership {
            Membership::Dense(set) => {
                bitmap.union(set);
            }
            Membership::List(positions) => {
                for &position in positions {
                    bitmap.insert(position);
                }
            }
        }
    }

    bitmap
}

/// Resolves one palette identity: ontology row to the closure row's membership union.
fn resolve_mask(
    postings: &PostingsArchive,
    closure: &ClosureMap,
    table: &IdentityTableArchive<ArchivedOntologyTypeUuid, OntologyRowId>,
    key: ArchivedOntologyTypeUuid,
) -> MaskSource {
    let Some(row) = table.row_of(key) else {
        return MaskSource::Unresolved;
    };

    let descendants = closure
        .descendants(row)
        .expect("identity rows share the postings' type domain");

    // Every closure row carries its own bit, so one set bit means no
    // proper descendant exists and the stored membership is the whole
    // match set.
    if descendants.count() == 1 {
        return MaskSource::Stored(row);
    }

    MaskSource::Union(union_membership(postings, descendants))
}

/// Resolves a palette against one generation's postings.
///
/// Closure map, and ontology identities, in slot order.
pub(super) fn resolve_masks(
    postings: &PostingsArchive,
    closure: &ClosureMap,
    table: &IdentityTableArchive<ArchivedOntologyTypeUuid, OntologyRowId>,
    palette: &Palette,
) -> MaskSet {
    MaskSet {
        sources: palette
            .entries
            .iter()
            .map(|&key| resolve_mask(postings, closure, table, key))
            .collect(),
    }
}
