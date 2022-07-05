//! Model types used across datastores

pub mod schema;

use core::fmt;

use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::types::schema::Uri;

#[repr(transparent)]
#[derive(Clone, Copy, Debug, sqlx::Type, PartialEq, Eq, Serialize, Deserialize)]
#[sqlx(transparent)]
pub struct AccountId(Uuid);

impl AccountId {
    #[must_use]
    pub const fn new(uuid: Uuid) -> Self {
        Self(uuid)
    }
}

pub type BaseId = Uri;

#[repr(transparent)]
#[derive(Clone, Copy, Debug, sqlx::Type, PartialEq, Eq, Serialize, Deserialize)]
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

// TODO: constrain this to only work for valid inner Types.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Qualified<T> {
    version_id: VersionId,
    inner: T,
    created_by: AccountId,
}

impl<T> Qualified<T> {
    #[must_use]
    pub const fn new(version_id: VersionId, inner: T, created_by: AccountId) -> Self {
        Self {
            version_id,
            inner,
            created_by,
        }
    }

    pub const fn version_id(&self) -> VersionId {
        self.version_id
    }

    pub const fn inner(&self) -> &T {
        &self.inner
    }

    pub const fn account_id(&self) -> AccountId {
        self.created_by
    }
}
