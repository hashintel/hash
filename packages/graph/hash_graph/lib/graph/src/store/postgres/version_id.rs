use std::fmt;

use postgres_types::{FromSql, ToSql};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;

#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema, FromSql, ToSql)]
#[repr(transparent)]
#[postgres(transparent)]
pub struct VersionId(Uuid);

impl VersionId {
    #[must_use]
    pub const fn new(uuid: Uuid) -> Self {
        Self(uuid)
    }
}

impl fmt::Display for VersionId {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(fmt, "{}", &self.0)
    }
}
