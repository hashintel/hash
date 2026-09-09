use core::ops::Range;

use crate::{
    bitset::DenseBitSlice,
    identity::BasePosition,
    postgres::id::ArchivedOntologyTypeUuid,
    salt::{fit::prepare::IdentityProvider as _, postings::artifact::Membership},
    serve2::world::Ontology,
};

pub(crate) enum OntologyMembership<'ontology> {
    Direct(Membership<'ontology>),
    Closure(&'ontology DenseBitSlice<BasePosition>),
    Unresolved,
}

impl<'ontology> OntologyMembership<'ontology> {
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

    /// Yields matching fitted positions in ascending order within `range`.
    pub(crate) fn positions_in(
        &self,
        range: Range<BasePosition>,
    ) -> impl Iterator<Item = BasePosition> + '_ {
        let (direct, closure) = match self {
            Self::Direct(membership) => (Some(membership.positions_in(range)), None),
            Self::Closure(membership) => (None, Some(membership.iter_in(range))),
            Self::Unresolved => (None, None),
        };
        direct
            .into_iter()
            .flatten()
            .chain(closure.into_iter().flatten())
    }
}

#[derive(
    Debug, zerocopy::FromBytes, zerocopy::IntoBytes, zerocopy::KnownLayout, zerocopy::Immutable,
)]
#[repr(C)]
pub(crate) struct OntologySelection([ArchivedOntologyTypeUuid]);

pub(crate) struct OntologyMemberships<'context> {
    selection: &'context OntologySelection,
    memberships: Vec<OntologyMembership<'context>>,
}

impl<'context> OntologyMemberships<'context> {
    pub(crate) fn iter(&self) -> impl ExactSizeIterator<Item = &OntologyMembership<'context>> {
        self.memberships.iter()
    }
}

impl OntologySelection {
    pub(crate) const fn len(&self) -> usize {
        self.0.len()
    }

    pub(crate) const fn is_empty(&self) -> bool {
        self.0.is_empty()
    }

    pub(crate) fn new(ontology: &[ArchivedOntologyTypeUuid]) -> &Self {
        zerocopy::transmute_ref!(ontology)
    }

    pub(crate) fn resolve<'context>(
        &'context self,
        ontology: &'context Ontology,
    ) -> OntologyMemberships<'context> {
        OntologyMemberships {
            selection: self,
            memberships: self
                .0
                .iter()
                .map(|&id| OntologyMembership::new(ontology, id))
                .collect(),
        }
    }
}
