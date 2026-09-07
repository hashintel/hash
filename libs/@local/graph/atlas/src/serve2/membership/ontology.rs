use crate::{
    bitset::DenseBitSlice, identity::BasePosition, postgres::id::ArchivedOntologyTypeUuid,
    salt::postings::artifact::Membership, serve2::world::Ontology,
};

pub(crate) enum OntologyMembership<'ontology> {
    Direct(Membership<'ontology>),
    Closure(&'ontology DenseBitSlice<BasePosition>),
    Unresolved,
}

impl<'ontology> OntologyMembership<'ontology> {
    pub(crate) fn new(ontology: &'ontology Ontology, id: ArchivedOntologyTypeUuid) -> Self {
        let Some(id) = ontology.identity().row_of(id) else {
            tracing::info!("todo");
            return Self::Unresolved;
        };

        ontology.closure().membership(id).map_or_else(
            || {
                ontology.postings().membership(id).map_or_else(
                    || {
                        tracing::warn!("todo");
                        Self::Unresolved
                    },
                    Self::Direct,
                )
            },
            Self::Closure,
        )
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

impl OntologySelection {
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
