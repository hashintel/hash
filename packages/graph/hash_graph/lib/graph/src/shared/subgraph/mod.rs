use std::{
    collections::{HashMap, HashSet},
    fmt::{Debug, Formatter},
};

use depths::GraphResolveDepths;
use edges::Edges;
use serde::{Deserialize, Serialize};
use type_system::{DataType, EntityType, PropertyType};
use utoipa::{openapi, ToSchema};

use crate::{
    knowledge::{Entity, EntityProperties},
    ontology::{DataTypeWithMetadata, EntityTypeWithMetadata, PropertyTypeWithMetadata},
    shared::identifier::GraphElementId,
    store::query::{Filter, QueryRecord},
};

mod depths;
mod edges;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
#[serde(tag = "kind", content = "inner")]
pub enum Vertex {
    DataType(DataTypeWithMetadata),
    PropertyType(PropertyTypeWithMetadata),
    EntityType(EntityTypeWithMetadata),
    Entity(Entity),
}

// WARNING: This MUST be kept up to date with the enum names and serde attribute, as utoipa does
// not currently support adjacently tagged enums so we must roll our own:
// https://github.com/juhaku/utoipa/issues/219
impl ToSchema for Vertex {
    fn schema() -> openapi::Schema {
        let mut builder =
            openapi::OneOfBuilder::new().discriminator(Some(openapi::Discriminator::new("kind")));

        for (kind, schema) in [
            ("dataType", DataTypeWithMetadata::schema()),
            ("propertyType", PropertyTypeWithMetadata::schema()),
            ("entityType", EntityTypeWithMetadata::schema()),
            ("entity", Entity::schema()),
        ] {
            builder = builder.item(
                openapi::ObjectBuilder::new()
                    .property(
                        "kind",
                        // Apparently OpenAPI doesn't support const values, the best you can do is
                        // an enum with one option
                        openapi::Schema::from(
                            openapi::ObjectBuilder::new().enum_values(Some([kind])),
                        ),
                    )
                    .required("kind")
                    .property("inner", schema)
                    .required("inner"),
            );
        }

        builder.into()
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct Subgraph {
    #[schema(value_type = Vec<GraphElementId>)]
    pub roots: HashSet<GraphElementId>,
    pub vertices: HashMap<GraphElementId, Vertex>,
    pub edges: Edges,
    pub depths: GraphResolveDepths,
}

impl Subgraph {
    #[must_use]
    pub fn new(depths: GraphResolveDepths) -> Self {
        Self {
            roots: HashSet::new(),
            vertices: HashMap::new(),
            edges: Edges::new(),
            depths,
        }
    }
}

impl Extend<Self> for Subgraph {
    fn extend<T: IntoIterator<Item = Self>>(&mut self, iter: T) {
        for subgraph in iter {
            self.roots.extend(subgraph.roots.into_iter());
            self.vertices.extend(subgraph.vertices.into_iter());
            self.edges.extend(subgraph.edges.into_iter());
        }
    }
}

/// A [`Filter`] to query the datastore, recursively resolving according to the
/// [`GraphResolveDepths`].
#[derive(Deserialize, ToSchema)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
#[aliases(
    DataTypeStructuralQuery = StructuralQuery<'static, DataType>,
    PropertyTypeStructuralQuery = StructuralQuery<'static, PropertyType>,
    EntityTypeStructuralQuery = StructuralQuery<'static, EntityType>,
    EntityStructuralQuery = StructuralQuery<'static, EntityProperties>,
)]
pub struct StructuralQuery<'q, T: QueryRecord> {
    #[serde(bound = "'de: 'q, T::Path<'q>: Deserialize<'de>")]
    pub filter: Filter<'q, T>,
    pub graph_resolve_depths: GraphResolveDepths,
}

// TODO: Derive traits when bounds are generated correctly
//   see https://github.com/rust-lang/rust/issues/26925
impl<'q, T> Debug for StructuralQuery<'q, T>
where
    T: QueryRecord<Path<'q>: Debug>,
{
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("StructuralQuery")
            .field("filter", &self.filter)
            .field("graph_resolve_depths", &self.graph_resolve_depths)
            .finish()
    }
}
