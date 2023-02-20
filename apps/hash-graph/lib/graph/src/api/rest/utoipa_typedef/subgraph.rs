mod edges;
mod vertices;

use serde::Serialize;
use utoipa::ToSchema;

pub use self::{
    edges::{Edges, KnowledgeGraphOutwardEdges, KnowledgeGraphRootedEdges, OntologyRootedEdges},
    vertices::{
        KnowledgeGraphVertex, KnowledgeGraphVertices, OntologyVertex, OntologyVertices, Vertex,
        Vertices,
    },
};
use crate::{
    identifier::{
        time::{TemporalAxes, UnresolvedTemporalAxes},
        GraphElementVertexId,
    },
    subgraph::edges::GraphResolveDepths,
};

#[derive(Serialize, ToSchema)]
pub struct TemporalSubgraphAxes {
    pub initial: UnresolvedTemporalAxes,
    pub resolved: TemporalAxes,
}

#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct Subgraph {
    roots: Vec<GraphElementVertexId>,
    vertices: Vertices,
    edges: Edges,
    depths: GraphResolveDepths,
    temporal_axes: TemporalSubgraphAxes,
}

impl From<crate::subgraph::Subgraph> for Subgraph {
    fn from(subgraph: crate::subgraph::Subgraph) -> Self {
        let vertices = subgraph.vertices.into();
        let edges = Edges::from_vertices_and_store_edges(
            subgraph.edges,
            &vertices,
            subgraph.resolved_time_projection.variable_time_axis(),
        );
        Self {
            roots: subgraph.roots.into_iter().collect(),
            vertices,
            edges,
            depths: subgraph.depths,
            temporal_axes: TemporalSubgraphAxes {
                initial: subgraph.time_projection,
                resolved: subgraph.resolved_time_projection,
            },
        }
    }
}
