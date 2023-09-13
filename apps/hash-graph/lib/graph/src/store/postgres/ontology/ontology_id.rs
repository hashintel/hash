use std::fmt;

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

    pub const fn as_uuid(self) -> Uuid {
        self.0
    }
}

impl fmt::Display for OntologyId {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(fmt, "{}", &self.0)
    }
}
