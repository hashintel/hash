//! Resolution of requested ontology types into per-row membership tests.
//!
//! A generation records type membership in one of two forms. The closure form is a dense bit set
//! over base positions, materialized for the types worth precomputing. The postings form is the
//! sparse list every other type keeps. [`OntologyMembership`] holds whichever form a type has. The
//! per-row test is therefore one call whatever the generation recorded.
#![expect(clippy::empty_enums, reason = "zerocopy uses them in the derive")]

use hashql_core::id::IdVec;

use crate::{
    bitset::DenseBitSlice,
    identity::BasePosition,
    postgres::id::ArchivedOntologyTypeUuid,
    salt::{fit::prepare::IdentityProvider as _, postings::artifact::Membership},
    serve::world::Ontology,
};

/// One requested type's membership set, in whichever form the generation recorded.
pub(crate) enum OntologyMembership<'ontology> {
    /// The sparse postings list of the positions belonging to the type.
    Direct(Membership<'ontology>),
    /// The materialized closure, a dense bit set over every base position.
    Closure(&'ontology DenseBitSlice<BasePosition>),
    /// The generation records nothing for the requested type. No row belongs to it.
    Unresolved,
}

impl<'ontology> OntologyMembership<'ontology> {
    /// Resolves the type `id` against the generation's recorded membership.
    ///
    /// A closure is preferred where one exists, because the dense form answers a test without a
    /// search. An identifier the generation never recorded resolves to
    /// [`Unresolved`](Self::Unresolved) rather than refusing: a request may name a type this
    /// generation has no rows for, and the answer is an empty membership.
    pub(crate) fn new(ontology: &'ontology Ontology, id: ArchivedOntologyTypeUuid) -> Self {
        let Some(id) = ontology.identity().row_of(id) else {
            return Self::Unresolved;
        };

        ontology.closure().membership(id).map_or_else(
            || {
                ontology
                    .postings()
                    .membership(id)
                    .map_or(Self::Unresolved, Self::Direct)
            },
            Self::Closure,
        )
    }

    /// Returns whether the base row at `position` belongs to this type.
    pub(crate) fn contains(&self, position: BasePosition) -> bool {
        match self {
            Self::Direct(membership) => membership.contains(position),
            Self::Closure(membership) => membership.contains(position),
            Self::Unresolved => false,
        }
    }
}

hashql_core::id::newtype! {
    /// A requested type's position, with duplicate requests occupying distinct slots.
    pub(crate) struct SelectionSlot(u32)
}

/// The ontology types a request asks to have marked, in request order.
///
/// An unsized view over the decoded request's type list, keeping the request's own order and its
/// duplicates. A [`SelectionSlot`] indexes into it, and the response's membership bits are
/// reported against those slots.
#[derive(
    Debug, zerocopy::FromBytes, zerocopy::IntoBytes, zerocopy::KnownLayout, zerocopy::Immutable,
)]
#[repr(C)]
pub(crate) struct OntologySelection([ArchivedOntologyTypeUuid]);

/// A resolved membership set per requested slot, borrowed from one generation's ontology.
pub(crate) struct OntologyMemberships<'context> {
    /// The membership set of every requested slot, in request order.
    memberships: IdVec<SelectionSlot, OntologyMembership<'context>>,
}

impl<'context> OntologyMemberships<'context> {
    /// Iterates the resolved memberships beside the slot each answers for.
    pub(crate) fn iter_enumerated(
        &self,
    ) -> impl ExactSizeIterator<Item = (SelectionSlot, &OntologyMembership<'context>)> {
        self.memberships.iter_enumerated()
    }
}

impl OntologySelection {
    /// Returns the number of requested slots, counting a repeated type once per request.
    pub(crate) const fn len(&self) -> usize {
        self.0.len()
    }

    /// Returns whether the request named no types at all.
    pub(crate) const fn is_empty(&self) -> bool {
        self.0.is_empty()
    }

    /// Returns whether `id` occupies at least one requested slot.
    pub(crate) fn contains(&self, id: ArchivedOntologyTypeUuid) -> bool {
        self.0.contains(&id)
    }

    /// Views a decoded request's type list as a selection, without copying it.
    pub(crate) fn new(ontology: &[ArchivedOntologyTypeUuid]) -> &Self {
        zerocopy::transmute_ref!(ontology)
    }

    /// Resolves every requested slot against `ontology`.
    ///
    /// Resolution happens once per response, and the result borrows the generation's recorded
    /// membership rather than copying it. A duplicate request resolves once per slot, which keeps
    /// slot indices aligned with the request the client sent.
    pub(crate) fn resolve<'context>(
        &'context self,
        ontology: &'context Ontology,
    ) -> OntologyMemberships<'context> {
        OntologyMemberships {
            memberships: self
                .0
                .iter()
                .map(|&id| OntologyMembership::new(ontology, id))
                .collect(),
        }
    }
}
