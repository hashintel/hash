//! Definitions of the elements of the Type System stored in the [`store`].
//!
//! This module contains the definitions of [`DataType`]s, [`PropertyType`]s, [`EntityType`]s, and
//! [`LinkType`]s. The structs are Rust representations of their meta-schemas defined within the
//! Block Protocol specification, and are used to validate instances of types using [`serde`]. To
//! aid with the de/serialization, intermediary structs and helpers are defined across various
//! submodules.
//!
//! [`store`]: crate::store
use serde::{Deserialize, Serialize};
use utoipa::Component;

use crate::ontology::{AccountId, VersionId};

pub mod uri;

mod data_type;
mod entity_type;
mod link_type;
mod property_type;

use crate::ontology::types::uri::VersionedUri;
pub use crate::ontology::types::{
    data_type::{DataType, DataTypeReference},
    entity_type::{EntityType, EntityTypeReference},
    link_type::LinkType,
    property_type::{PropertyType, PropertyTypeReference},
};

pub mod error;

mod serde_shared;

pub trait OntologyType {
    /// Returns the unique versioned URI used to identify this instance of a type.
    fn uri(&self) -> &VersionedUri;
}

/// A representation of an [`OntologyType`] that exists (has been `Persisted`) in a backing store.
#[derive(Clone, Debug, Serialize, Deserialize, Component)]
#[aliases(
    PersistedDataType = Persisted<DataType>,
    PersistedPropertyType = Persisted<PropertyType>,
    PersistedLinkType = Persisted<LinkType>,
    PersistedEntityType = Persisted<EntityType>
)]
pub struct Persisted<T: OntologyType> {
    version_id: VersionId,
    // TODO: we would want the inner types to be represented in the OpenAPI components list. This
    //   means that any generic instance used by the web API needs to have an alias above, and all
    //   subsequent inner types need to implement utoipa's `Component` trait.
    #[component(value_type = Any)]
    inner: T,
    created_by: AccountId,
}

impl<T: OntologyType> Persisted<T> {
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

    pub const fn account_id(&self) -> &AccountId {
        &self.created_by
    }
}
