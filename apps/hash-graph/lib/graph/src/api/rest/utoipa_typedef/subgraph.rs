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
    identifier::GraphElementVertexId,
    subgraph::{
        edges::GraphResolveDepths,
        temporal_axes::{QueryTemporalAxes, QueryTemporalAxesUnresolved},
    },
};

#[derive(Serialize, ToSchema)]
pub struct SubgraphTemporalAxes {
    pub initial: QueryTemporalAxesUnresolved,
    pub resolved: QueryTemporalAxes,
}

#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct Subgraph {
    roots: Vec<GraphElementVertexId>,
    vertices: Vertices,
    edges: Edges,
    depths: GraphResolveDepths,
    temporal_axes: SubgraphTemporalAxes,
}

impl From<crate::subgraph::Subgraph> for Subgraph {
    fn from(subgraph: crate::subgraph::Subgraph) -> Self {
        let vertices = subgraph.vertices.into();
        let edges = Edges::from_vertices_and_store_edges(
            subgraph.edges,
            &vertices,
            subgraph.resolved_temporal_axes.variable_time_axis(),
        );
        Self {
            roots: subgraph.roots.into_iter().collect(),
            vertices,
            edges,
            depths: subgraph.depths,
            temporal_axes: SubgraphTemporalAxes {
                initial: subgraph.temporal_axes,
                resolved: subgraph.resolved_temporal_axes,
            },
        }
    }
}
