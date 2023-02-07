use std::{
    collections::hash_map::{RandomState, RawEntryMut},
    error::Error,
    fmt,
    fmt::Display,
};

use postgres_types::{private::BytesMut, FromSql, IsNull, ToSql, Type};
use serde::{Deserialize, Serialize};
use type_system::uri::{BaseUri, VersionedUri};
use utoipa::ToSchema;

use crate::{
    ontology::{DataTypeWithMetadata, EntityTypeWithMetadata, PropertyTypeWithMetadata},
    subgraph::{Subgraph, SubgraphIndex},
};

#[derive(
    Debug, Clone, Copy, Hash, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize, ToSchema,
)]
#[repr(transparent)]
pub struct OntologyTypeVersion(u32);

impl OntologyTypeVersion {
    #[must_use]
    pub const fn new(inner: u32) -> Self {
        Self(inner)
    }

    #[must_use]
    pub const fn inner(&self) -> u32 {
        self.0
    }
}

impl ToSql for OntologyTypeVersion {
    postgres_types::accepts!(INT8);

    postgres_types::to_sql_checked!();

    fn to_sql(&self, _: &Type, out: &mut BytesMut) -> Result<IsNull, Box<dyn Error + Sync + Send>>
    where
        Self: Sized,
    {
        i64::from(self.0).to_sql(&Type::INT8, out)
    }
}

impl<'a> FromSql<'a> for OntologyTypeVersion {
    postgres_types::accepts!(INT8);

    fn from_sql(_: &Type, raw: &'a [u8]) -> Result<Self, Box<dyn Error + Sync + Send>> {
        Ok(Self::new(i64::from_sql(&Type::INT8, raw)? as u32))
    }
}

#[derive(Debug, Clone, Hash, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct OntologyTypeEditionId {
    #[schema(value_type = String)]
    base_id: BaseUri,
    #[schema(value_type = i64)]
    version: OntologyTypeVersion,
}

impl OntologyTypeEditionId {
    #[must_use]
    pub const fn new(base_id: BaseUri, version: OntologyTypeVersion) -> Self {
        Self { base_id, version }
    }

    #[must_use]
    pub const fn base_id(&self) -> &BaseUri {
        &self.base_id
    }

    #[must_use]
    pub const fn version(&self) -> OntologyTypeVersion {
        self.version
    }
}

impl Display for OntologyTypeEditionId {
    fn fmt(&self, fmt: &mut fmt::Formatter) -> fmt::Result {
        write!(fmt, "{}v/{}", self.base_id.as_str(), self.version.inner())
    }
}

// The Type System crate doesn't let us destructure so we need to clone base_uri
impl From<&VersionedUri> for OntologyTypeEditionId {
    fn from(versioned_uri: &VersionedUri) -> Self {
        Self {
            base_id: versioned_uri.base_uri().clone(),
            version: OntologyTypeVersion::new(versioned_uri.version()),
        }
    }
}

impl From<&OntologyTypeEditionId> for VersionedUri {
    fn from(edition_id: &OntologyTypeEditionId) -> Self {
        // We should make it possible to destructure to avoid the clone
        Self::new(edition_id.base_id().clone(), edition_id.version.inner())
    }
}

impl SubgraphIndex<DataTypeWithMetadata> for OntologyTypeEditionId {
    fn subgraph_vertex_entry<'a>(
        &self,
        subgraph: &'a mut Subgraph,
    ) -> RawEntryMut<'a, Self, DataTypeWithMetadata, RandomState> {
        subgraph.vertices.data_types.raw_entry_mut().from_key(self)
    }
}

impl SubgraphIndex<PropertyTypeWithMetadata> for OntologyTypeEditionId {
    fn subgraph_vertex_entry<'a>(
        &self,
        subgraph: &'a mut Subgraph,
    ) -> RawEntryMut<'a, Self, PropertyTypeWithMetadata, RandomState> {
        subgraph
            .vertices
            .property_types
            .raw_entry_mut()
            .from_key(self)
    }
}

impl SubgraphIndex<EntityTypeWithMetadata> for OntologyTypeEditionId {
    fn subgraph_vertex_entry<'a>(
        &self,
        subgraph: &'a mut Subgraph,
    ) -> RawEntryMut<'a, Self, EntityTypeWithMetadata, RandomState> {
        subgraph
            .vertices
            .entity_types
            .raw_entry_mut()
            .from_key(self)
    }
}
