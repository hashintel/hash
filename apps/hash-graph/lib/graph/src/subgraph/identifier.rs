mod edge;
mod vertex;

pub use self::{
    edge::{EdgeEndpoint, EntityIdWithInterval},
    vertex::{EntityVertexId, GraphElementVertexId, DataTypeVertexId, PropertyTypeVertexId, EntityTypeVertexId, OntologyTypeVertexId, VertexId},
};
