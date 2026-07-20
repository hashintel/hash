//! Type coloring: resolving `coloredTypeIds` to per-type memberships
//! with descendant expansion, the `TYPE_MASK` column's serving source.
//!
//! Each requested id is a user-facing versioned type URL. Resolution
//! is pinned to the generation's snapshot: the URL derives its
//! ontology uuid, the uuid joins the generation's ontology identity
//! table, and the resulting row names a closure-map row whose set
//! bits are every type the request matches - the type itself and all
//! its descendants. The tile path never consults the live store.
//!
//! Failure to resolve is legal at every step - an unparsable URL, a
//! corpus whose ontology ids are not store identities, a uuid this
//! generation never ingested - and reads as zero bits in every
//! point's mask, never as an error.

use type_system::ontology::id::{OntologyTypeUuid, VersionedUrl};

use super::Atlas;
use crate::{
    dataset::{ArchivedOntologyTypeUuid, OntologyRowId},
    salt::{
        fit::prepare::identity::IdentityTableArchive,
        postings::{closure::ClosureMap, mapped::PostingsArchive},
    },
};

/// The mask sources of one request's `coloredTypeIds`, in request
/// order.
///
/// Materialized unions live here so the [`Membership`] views the
/// encoder consumes can borrow them beside the mapped postings.
///
/// [`Membership`]: crate::salt::postings::mapped::Membership
#[derive(Debug)]
pub(super) struct MaskSet {
    sources: Vec<MaskSource>,
}

/// One requested id's resolved membership source.
#[derive(Debug)]
enum MaskSource {
    /// The id resolved to a type without proper descendants: the
    /// stored membership serves directly.
    Stored(OntologyRowId),
    /// The id resolved to a type with proper descendants: the dense
    /// union of the closure row's memberships.
    Union(Vec<u32>),
    /// The id resolved to no type in this generation: zero bits.
    Unresolved,
}

impl MaskSet {
    /// Views the sources as the encoder's membership slice, in
    /// request order.
    pub(super) fn memberships<'doc>(
        &'doc self,
        postings: &'doc PostingsArchive,
    ) -> Vec<crate::salt::postings::mapped::Membership<'doc>> {
        use crate::salt::postings::mapped::Membership;

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
    /// Resolves one request's `coloredTypeIds` into mask sources, in
    /// request order.
    pub(super) fn resolve_masks(&self, ids: &[String]) -> MaskSet {
        resolve_masks(&self.postings, &self.closure, &self.ontology_ids, ids)
    }
}

/// Resolves a request's ids against one generation's postings,
/// closure map, and ontology identities, in request order.
pub(super) fn resolve_masks(
    postings: &PostingsArchive,
    closure: &ClosureMap,
    table: &IdentityTableArchive<ArchivedOntologyTypeUuid>,
    ids: &[String],
) -> MaskSet {
    MaskSet {
        sources: ids
            .iter()
            .map(|id| resolve_mask(postings, closure, table, id))
            .collect(),
    }
}

/// Resolves one requested id: URL to uuid to ontology row to the
/// closure row's membership union.
fn resolve_mask(
    postings: &PostingsArchive,
    closure: &ClosureMap,
    table: &IdentityTableArchive<ArchivedOntologyTypeUuid>,
    id: &str,
) -> MaskSource {
    let Ok(url) = id.parse::<VersionedUrl>() else {
        return MaskSource::Unresolved;
    };
    let key = ArchivedOntologyTypeUuid::from(OntologyTypeUuid::from_url(&url).into_uuid());
    let Some(row) = table.row_of(key) else {
        return MaskSource::Unresolved;
    };

    let row = OntologyRowId::new(row);
    let descendants = closure
        .descendants(row)
        .expect("identity rows share the postings' type domain");

    // Every closure row carries its own bit, so one set bit means no
    // proper descendant exists and the stored membership is the whole
    // match set.
    let matched: u32 = descendants.iter().map(|&word| word.count_ones()).sum();
    if matched == 1 {
        return MaskSource::Stored(row);
    }

    MaskSource::Union(union_membership(postings, descendants))
}

/// Materializes the dense union of every set type's membership:
/// `ceil(N/32)` words, LSB-first over base positions.
fn union_membership(postings: &PostingsArchive, descendants: &[u64]) -> Vec<u32> {
    use crate::salt::postings::mapped::Membership;

    let points = usize::try_from(postings.points()).expect("point domains fit usize");
    let mut bitmap = vec![0_u32; points.div_ceil(u32::BITS as usize)];

    for (index, &word) in descendants.iter().enumerate() {
        let mut bits = word;
        while bits != 0 {
            let type_row = index as u64 * u64::from(u64::BITS) + u64::from(bits.trailing_zeros());
            bits &= bits - 1;

            let membership = postings
                .membership(OntologyRowId::new(type_row))
                .expect("closure rows lie inside the postings' type domain");
            match membership {
                Membership::Dense(words) => {
                    for (union, &dense) in bitmap.iter_mut().zip(words) {
                        *union |= dense;
                    }
                }
                Membership::List(positions) => {
                    for &position in positions {
                        bitmap[position as usize >> 5] |= 1 << (position & 31);
                    }
                }
            }
        }
    }

    bitmap
}
