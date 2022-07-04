//! Model types used across datastores

use std::fmt;

use uuid::Uuid;

#[repr(transparent)]
#[derive(Clone, Copy, Debug, sqlx::Type, PartialEq, Eq)]
#[sqlx(transparent)]
pub struct AccountId(Uuid);

impl AccountId {
    #[must_use]
    pub const fn new(uuid: Uuid) -> Self {
        Self(uuid)
    }
}

#[repr(transparent)]
#[derive(Clone, Copy, Debug, sqlx::Type, PartialEq, Eq)]
#[sqlx(transparent)]
pub struct BaseId(Uuid);

impl BaseId {
    #[must_use]
    pub const fn new(uuid: Uuid) -> Self {
        Self(uuid)
    }
}

#[repr(transparent)]
#[derive(Clone, Copy, Debug, sqlx::Type, PartialEq, Eq)]
#[sqlx(transparent)]
pub struct VersionId(Uuid);

impl VersionId {
    #[must_use]
    pub const fn new(uuid: Uuid) -> Self {
        Self(uuid)
    }
}

#[derive(Clone, Debug)]
pub struct Identifier {
    pub base_id: BaseId,
    pub version_id: VersionId,
}

impl Identifier {
    #[must_use]
    pub const fn new(base_id: BaseId, version_id: VersionId) -> Self {
        Self {
            base_id,
            version_id,
        }
    }
}

impl fmt::Display for Identifier {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        // TODO: change this to not just using the debug impl.
        write!(fmt, "{:?}", self)
    }
}

#[repr(transparent)]
#[derive(Clone, Debug, sqlx::Type, PartialEq, Eq)]
#[sqlx(transparent)]
pub struct DataType(serde_json::Value);

impl DataType {
    #[must_use]
    pub const fn new(schema: serde_json::Value) -> Self {
        Self(schema)
    }
}

#[repr(transparent)]
#[derive(Clone, Debug, sqlx::Type, PartialEq, Eq)]
#[sqlx(transparent)]
pub struct PropertyType(serde_json::Value);

impl PropertyType {
    #[must_use]
    pub const fn new(schema: serde_json::Value) -> Self {
        Self(schema)
    }
}

// TODO: constrain this to only work for valid inner Types.
#[derive(Clone, Debug)]
pub struct Qualified<T> {
    id: Identifier,
    inner: T,
    created_by: AccountId,
}

impl<T> Qualified<T> {
    #[must_use]
    pub const fn new(id: Identifier, inner: T, created_by: AccountId) -> Self {
        Self {
            id,
            inner,
            created_by,
        }
    }

    pub const fn id(&self) -> &Identifier {
        &self.id
    }

    pub const fn inner(&self) -> &T {
        &self.inner
    }

    pub const fn account_id(&self) -> &AccountId {
        &self.created_by
    }
}
