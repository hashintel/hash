use error_stack::{Report, ReportSink, ResultExt as _, TryReportTupleExt as _};

use super::{OpenOptions, error::WorldError};
use crate::{
    identity::{Column, EdgeRowId, NodeRowId},
    postgres::id::ArchivedEntityId,
    salt::{adjacency::AdjacencyArchive, fit::prepare::identity::IdentityTableArchive},
};

#[derive(Debug)]
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

#[cfg(test)]
mod tests {
    use core::assert_matches;

    use super::Topology;
    use crate::{
        identity::EdgeRowId,
        serve2::{
            tests::fixture::{
                EDGE_SEED, EDGES, ENDPOINTS, TamperFixture, secret, shorten_endpoints,
                shorten_entities,
            },
            world::{OpenOptions, error::WorldError},
        },
    };

    /// Open refuses an edge identity table short of the adjacency's edge domain, under
    /// [`WorldError::TopologyCountMismatch`].
    #[test]
    fn edge_identities_short() {
        let fixture = TamperFixture::publish("topology-edge-identities-short");
        let files = &fixture.generation().repository().files;

        let tampered = fixture.tamper(&files.edge_identities.name(), |path| {
            shorten_entities::<EdgeRowId>(path, EDGES - 1, EDGE_SEED);
        });
        let report = Topology::open(OpenOptions {
            generation: &tampered,
            secret: &secret(),
        })
        .expect_err("open refuses a short edge identity table");

        assert_matches!(
            report.current_contexts().collect::<Vec<_>>().as_slice(),
            [WorldError::TopologyCountMismatch {
                identity,
                endpoints,
                adjacency,
            }] if *identity == EDGES - 1 && *endpoints == ENDPOINTS.len() && *adjacency == EDGES,
        );
    }

    /// Open refuses an endpoint column short of the adjacency's edge domain, under
    /// [`WorldError::TopologyCountMismatch`].
    #[test]
    fn endpoint_column_short() {
        let fixture = TamperFixture::publish("topology-endpoint-column-short");
        let files = &fixture.generation().repository().files;

        let tampered = fixture.tamper(&files.edge_endpoints.name(), |path| {
            shorten_endpoints(path, &ENDPOINTS[..ENDPOINTS.len() - 1]);
        });
        let report = Topology::open(OpenOptions {
            generation: &tampered,
            secret: &secret(),
        })
        .expect_err("open refuses a short endpoint column");

        assert_matches!(
            report.current_contexts().collect::<Vec<_>>().as_slice(),
            [WorldError::TopologyCountMismatch {
                identity,
                endpoints,
                adjacency,
            }] if *identity == EDGES && *endpoints == ENDPOINTS.len() - 1 && *adjacency == EDGES,
        );
    }
}
