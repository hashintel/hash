mod depths;
mod edges;
mod query;
mod vertices;

use serde::Serialize;
use utoipa::ToSchema;

pub use self::{depths::*, edges::*, query::*, vertices::*};
use crate::identifier::GraphElementIdentifier;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct Subgraph {
    pub roots: Vec<GraphElementIdentifier>,
    pub vertices: Vertices,
    pub edges: Edges,
    pub depths: GraphResolveDepths,
}
