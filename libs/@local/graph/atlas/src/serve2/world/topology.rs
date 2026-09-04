use crate::{
    identity::{Column, EdgeRowId, NodeRowId},
    postgres::id::ArchivedEntityId,
    salt::{adjacency::AdjacencyArchive, fit::prepare::identity::IdentityTableArchive},
};

pub struct Topology {
    identity: IdentityTableArchive<ArchivedEntityId, EdgeRowId>,

    adjacency: AdjacencyArchive,
    endpoints: Column<EdgeRowId, [NodeRowId; 2]>,
}
