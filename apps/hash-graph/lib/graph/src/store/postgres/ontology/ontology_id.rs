use std::fmt;

use authorization::schema::EntityTypeId;
use graph_types::ontology::OntologyTypeRecordId;
use postgres_types::{FromSql, ToSql};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;

#[derive(
    Debug, Copy, Clone, PartialEq, Eq, Hash, Serialize, Deserialize, ToSchema, FromSql, ToSql,
)]
#[repr(transparent)]
#[postgres(transparent)]
pub struct OntologyId(Uuid);

impl OntologyId {
    pub fn from_record_id(record_id: &OntologyTypeRecordId) -> Self {
        Self(Uuid::new_v5(
            &Uuid::NAMESPACE_URL,
            record_id.to_string().as_bytes(),
        ))
    }

    #[must_use]
    pub const fn as_uuid(&self) -> &Uuid {
        &self.0
    }

    #[must_use]
    pub const fn into_uuid(self) -> Uuid {
        self.0
    }
}

impl From<EntityTypeId> for OntologyId {
    fn from(entity_type_id: EntityTypeId) -> Self {
        Self(entity_type_id.into_uuid())
    }
}

impl From<OntologyId> for EntityTypeId {
    fn from(ontology_id: OntologyId) -> Self {
        Self::new(ontology_id.into_uuid())
    }
}

impl fmt::Display for OntologyId {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(fmt, "{}", &self.0)
    }
}
