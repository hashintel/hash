use error_stack::Report;

use super::{encoding::Encoding, error::WorldError};
use crate::{
    file::generation::Generation,
    identity::{BasePosition, Column, NodeRowId},
    postgres::id::ArchivedEntityId,
    salt::fit::prepare::identity::IdentityTableArchive,
};

pub struct NodeIndex {
    identity: IdentityTableArchive<ArchivedEntityId, NodeRowId>,
    encoding: Encoding<NodeRowId>,

    lookup: Column<BasePosition, NodeRowId>,
    reverse: Column<NodeRowId, BasePosition>,
}

impl NodeIndex {
    pub(crate) fn open(generation: &Generation) -> Result<Self, Report<[WorldError]>> {
        let files = &generation.repository().files;

        let identity = files.node_identities.open(generation);
        let encoding = Encoding::open(generation);

        let lookup = files.wire_coordinates.open(generation);
        let reverse = files.position_of_row.open(generation);

        todo!()
    }
}
