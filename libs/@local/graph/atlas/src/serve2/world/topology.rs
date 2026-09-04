use error_stack::{Report, ReportSink, ResultExt as _, TryReportTupleExt as _};

use super::{OpenOptions, error::WorldError};
use crate::{
    identity::{Column, EdgeRowId, NodeRowId},
    postgres::id::ArchivedEntityId,
    salt::{adjacency::AdjacencyArchive, fit::prepare::identity::IdentityTableArchive},
};

pub(crate) struct Topology {
    identity: IdentityTableArchive<ArchivedEntityId, EdgeRowId>,

    adjacency: AdjacencyArchive,
    endpoints: Column<EdgeRowId, [NodeRowId; 2]>,
}

impl Topology {
    pub(crate) fn open(
        OpenOptions { generation, .. }: OpenOptions<'_>,
    ) -> Result<Self, Report<[WorldError]>> {
        let files = &generation.repository().files;

        let identity = files
            .edge_identities
            .open(generation)
            .change_context(WorldError::Open {
                file: files.edge_identities.name(),
            });

        let adjacency = files
            .adjacency
            .open(generation)
            .change_context(WorldError::Open {
                file: files.adjacency.name(),
            });

        let endpoints = files
            .edge_endpoints
            .open(generation)
            .change_context(WorldError::Open {
                file: files.edge_endpoints.name(),
            });

        let (identity, adjacency, endpoints) = (identity, adjacency, endpoints).try_collect()?;

        let this = Self {
            identity,
            adjacency,
            endpoints,
        };

        let mut sink = ReportSink::new_armed();

        if this.identity.len() != this.endpoints.len() as u64
            || this.identity.len() != this.adjacency.edges()
        {
            sink.capture(WorldError::TopologyCountMismatch {
                identity: this.identity.len(),
                endpoints: this.endpoints.len(),
                adjacency: this.adjacency.edges(),
            });
        }

        if let Err(error) = u32::try_from(this.identity.len()) {
            sink.capture(Report::new(error).change_context(WorldError::TooManyEdges {
                edges: this.identity.len(),
            }));
        }

        sink.finish_ok(this)
    }

    pub(crate) fn edge_count(&self) -> usize {
        self.endpoints.len()
    }

    #[expect(
        clippy::cast_possible_truncation,
        reason = "the world's open compares the count against the layout's `usize` node count"
    )]
    pub(crate) const fn node_count(&self) -> usize {
        self.adjacency.rows() as usize
    }
}
