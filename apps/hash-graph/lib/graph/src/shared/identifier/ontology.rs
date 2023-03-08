use std::{
    collections::hash_map::{RandomState, RawEntryMut},
    error::Error,
    fmt,
    fmt::Display,
};

use postgres_types::{private::BytesMut, FromSql, IsNull, ToSql, Type};
use serde::{Deserialize, Serialize};
use type_system::url::{BaseUrl, VersionedUrl};
use utoipa::ToSchema;

use crate::{
    ontology::{DataTypeWithMetadata, EntityTypeWithMetadata, PropertyTypeWithMetadata},
    subgraph::{identifier::OntologyTypeVertexId, Subgraph, SubgraphIndex},
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
        Ok(Self::new(i64::from_sql(&Type::INT8, raw)?.try_into()?))
    }
}

#[derive(Debug, Clone, Hash, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct OntologyTypeRecordId {
    #[schema(value_type = String)]
    pub base_url: BaseUrl,
    #[schema(value_type = u32)]
    pub version: OntologyTypeVersion,
}

impl Display for OntologyTypeRecordId {
    fn fmt(&self, fmt: &mut fmt::Formatter) -> fmt::Result {
        write!(fmt, "{}v/{}", self.base_url.as_str(), self.version.inner())
    }
}

impl From<VersionedUrl> for OntologyTypeRecordId {
    fn from(versioned_url: VersionedUrl) -> Self {
        Self {
            base_url: versioned_url.base_url,
            version: OntologyTypeVersion::new(versioned_url.version),
        }
    }
}

impl From<OntologyTypeRecordId> for VersionedUrl {
    fn from(record_id: OntologyTypeRecordId) -> Self {
        Self {
            base_url: record_id.base_url,
            version: record_id.version.inner(),
        }
    }
}

impl SubgraphIndex<DataTypeWithMetadata> for OntologyTypeVertexId {
    fn subgraph_vertex_entry<'a>(
        &self,
        subgraph: &'a mut Subgraph,
    ) -> RawEntryMut<'a, Self, DataTypeWithMetadata, RandomState> {
        subgraph.vertices.data_types.raw_entry_mut().from_key(self)
    }
}

impl SubgraphIndex<PropertyTypeWithMetadata> for OntologyTypeVertexId {
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

impl SubgraphIndex<EntityTypeWithMetadata> for OntologyTypeVertexId {
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
