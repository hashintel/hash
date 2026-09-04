use error_stack::{Report, ResultExt as _, TryReportTupleExt as _};

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

        Ok(Self {
            identity,
            adjacency,
            endpoints,
        })
    }
}
