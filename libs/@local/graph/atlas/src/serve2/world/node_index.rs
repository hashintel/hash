use error_stack::{Report, ResultExt, TryReportTupleExt};

use super::{OpenOptions, encoding::Encoding, error::WorldError};
use crate::{
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
    pub(crate) fn open(
        options @ OpenOptions {
            generation,
            secret: _,
        }: OpenOptions<'_>,
    ) -> Result<Self, Report<[WorldError]>> {
        let files = &generation.repository().files;

        let identity = files
            .node_identities
            .open(generation)
            .change_context(WorldError::Open {
                file: files.node_identities.name(),
            });

        let lookup = files
            .row_of_position
            .open(generation)
            .change_context(WorldError::Open {
                file: files.row_of_position.name(),
            });

        let reverse = files
            .position_of_row
            .open(generation)
            .change_context(WorldError::Open {
                file: files.position_of_row.name(),
            });

        let encoding =
            lookup
                .map_err(Report::expand)
                .and_then(|column: Column<BasePosition, NodeRowId>| {
                    Encoding::open(options, column.view()).map(|encoding| (encoding, column))
                });

        let (identity, (encoding, lookup), reverse) =
            (identity, encoding, reverse).try_collect()?;

        Ok(Self {
            identity,
            encoding,
            lookup,
            reverse,
        })
    }
}
