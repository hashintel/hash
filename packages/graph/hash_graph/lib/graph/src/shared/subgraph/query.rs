use serde::Deserialize;
use type_system::{DataType, EntityType, PropertyType};
use utoipa::ToSchema;

use crate::{
    knowledge::Entity,
    store::query::{Filter, QueryRecord},
    subgraph::GraphResolveDepths,
};

/// A [`Filter`] to query the datastore, recursively resolving according to the
/// [`GraphResolveDepths`].
#[derive(Deserialize, ToSchema)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
#[aliases(
    DataTypeStructuralQuery = StructuralQuery<'static, DataType>,
    PropertyTypeStructuralQuery = StructuralQuery<'static, PropertyType>,
    EntityTypeStructuralQuery = StructuralQuery<'static, EntityType>,
    EntityStructuralQuery = StructuralQuery<'static, Entity>,
)]
pub struct StructuralQuery<'q, T: QueryRecord> {
    #[serde(bound = "'de: 'q, T::Path<'q>: Deserialize<'de>")]
    pub filter: Filter<'q, T>,
    pub graph_resolve_depths: GraphResolveDepths,
}
