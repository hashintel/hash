use hashql_core::id::IdVec;

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

#[derive(
    Debug, zerocopy::FromBytes, zerocopy::IntoBytes, zerocopy::KnownLayout, zerocopy::Immutable,
)]
#[repr(C)]
pub(crate) struct OntologySelection([ArchivedOntologyTypeUuid]);

pub(crate) struct OntologyMemberships<'context> {
    selection: &'context OntologySelection,
    memberships: IdVec<SelectionSlot, OntologyMembership<'context>>,
}

impl<'context> OntologyMemberships<'context> {
    pub(crate) fn iter_enumerated(
        &self,
    ) -> impl ExactSizeIterator<Item = (SelectionSlot, &OntologyMembership<'context>)> {
        self.memberships.iter_enumerated()
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
