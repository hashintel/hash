//! Model types used across datastores

pub mod schema;

use core::fmt;

use serde::{Deserialize, Serialize};
use utoipa::Component;
use uuid::Uuid;

use crate::types::schema::{DataType, PropertyType};

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize, sqlx::Type, Component)]
#[serde(transparent)]
#[sqlx(transparent)]
pub struct Uri(String);

impl Uri {
    /// Creates a new `Uri` from the given string.
    #[must_use]
    pub fn new<T: Into<String>>(uri: T) -> Self {
        Self(uri.into())
    }
}

impl fmt::Display for Uri {
    fn fmt(&self, fmt: &mut fmt::Formatter) -> fmt::Result {
        write!(fmt, "{}", self.0)
    }
}

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

pub type BaseId = Uri;

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

// TODO: constrain this to only work for valid inner Types.
#[derive(Clone, Debug, Serialize, Deserialize, Component)]
#[aliases(QualifiedDataType = Qualified<DataType>, QualifiedPropertyType = Qualified<PropertyType>)]
pub struct Qualified<T> {
    version_id: VersionId,
    // TODO: we would want the inner types to be represented in the OpenAPI components list. This
    //   means that any generic instance used by the web API needs to have an alias above, and all
    //   subsequent inner types need to implement utoipa's `Component` trait.
    #[component(value_type = Any)]
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
