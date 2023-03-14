mod edge;
mod vertex;

pub use self::{
    edge::{EdgeEndpoint, EntityIdWithInterval},
    vertex::{
        DataTypeVertexId, EntityTypeVertexId, EntityVertexId, GraphElementVertexId,
        PropertyTypeVertexId, VertexId,
    },
};
