use core::ops::Index;

use error_stack::{Report, ReportSink, ResultExt as _, TryReportTupleExt as _};

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

        let encoding = lookup.map(|column: Column<BasePosition, NodeRowId>| {
            (Encoding::open(options, column.view()), column)
        });

        let (identity, (encoding, lookup), reverse) =
            (identity, encoding, reverse).try_collect()?;

        let this = Self {
            identity,
            encoding,
            lookup,
            reverse,
        };

        let mut sink = ReportSink::new_armed();

        if this.identity.len() != this.lookup.len() as u64
            || this.identity.len() != this.reverse.len() as u64
        {
            sink.capture(WorldError::NodeIndexCountMismatch {
                identity: this.identity.len(),
                lookup: this.lookup.len(),
                reverse: this.reverse.len(),
            });
        }

        sink.finish_ok(this)
    }

    pub(crate) fn lookup(&self, index: BasePosition) -> Option<NodeRowId> {
        self.lookup.view().get(index).copied()
    }

    pub(crate) fn reverse(&self, index: NodeRowId) -> Option<BasePosition> {
        self.reverse.view().get(index).copied()
    }

    pub(crate) fn len(&self) -> usize {
        self.lookup.len()
    }
}

impl Index<BasePosition> for NodeIndex {
    type Output = NodeRowId;

    fn index(&self, index: BasePosition) -> &Self::Output {
        &self.lookup.view()[index]
    }
}

impl Index<NodeRowId> for NodeIndex {
    type Output = BasePosition;

    fn index(&self, index: NodeRowId) -> &Self::Output {
        &self.reverse.view()[index]
    }
}
