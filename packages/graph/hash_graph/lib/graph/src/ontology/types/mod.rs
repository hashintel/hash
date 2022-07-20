//! Schema definitions stored in the [`store`].
//!
//! This module contains the definitions of schemas, which means that the serialized structs are not
//! the actual data but only the specification how a type is defined.
//!
//! [`store`]: crate::store
use serde::{Deserialize, Serialize};
use utoipa::Component;

use crate::ontology::{AccountId, VersionId};

mod serde_shared;

pub mod uri;

pub mod data_type;
pub mod entity_type;
pub mod link_type;
pub mod property_type;

pub mod error;

pub use data_type::DataType;
pub use entity_type::EntityType;
pub use link_type::LinkType;
pub use property_type::PropertyType;

// TODO: constrain this to only work for valid inner Types.
#[derive(Clone, Debug, Serialize, Deserialize, Component)]
#[aliases(
    QualifiedDataType = Qualified<DataType>,
    QualifiedPropertyType = Qualified<PropertyType>,
    QualifiedLinkType = Qualified<LinkType>,
)]
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
