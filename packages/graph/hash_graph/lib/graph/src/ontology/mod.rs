//! Model types that describe the elements of the HASH Ontology.

pub mod types;

use core::fmt;

use serde::{Deserialize, Serialize};
use utoipa::Component;
use uuid::Uuid;

#[repr(transparent)]
#[derive(Clone, Copy, Debug, sqlx::Type, PartialEq, Eq, Serialize, Deserialize, Component)]
#[sqlx(transparent)]
pub struct AccountId(Uuid);

impl AccountId {
    #[must_use]
    pub const fn new(uuid: Uuid) -> Self {
        Self(uuid)
    }
}

#[repr(transparent)]
#[derive(Clone, Copy, Debug, sqlx::Type, PartialEq, Eq, Serialize, Deserialize, Component)]
#[sqlx(transparent)]
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
