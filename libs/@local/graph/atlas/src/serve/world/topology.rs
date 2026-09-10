//! Directed graph queries in stable node and edge row order.
//!
//! [`Topology`] combines fitted endpoint bindings with the changes captured by an [`Epoch`].
//! Adjacency queries exclude withdrawn edges and edges with an invisible endpoint node.

use error_stack::{Report, ReportSink, ResultExt as _, TryReportTupleExt as _};

use super::{OpenOptions, error::WorldError};
use crate::{
    dataset::auxiliary::Legend,
    identity::{Column, EdgeRowId, NodeRowId},
    postgres::id::ArchivedEntityId,
    salt::{
        adjacency::{AdjacencyArchive, EdgeList},
        fit::prepare::identity::IdentityTableArchive,
    },
    serve::delta::{
        epoch::Epoch,
        overlay::{NaiveIdentityProvider, VersionedIdentityProvider},
        topology::provider::{NaiveTopologyProvider, VersionedTopologyProvider as _},
    },
};

/// Endpoint and adjacency lookups over allocated node and edge rows.
///
/// Node and edge rows occupy the zero-based domains bounded by their respective counts. Counts
/// include absent rows. Adjacency lists contain existing edges in strictly ascending row order.
pub(crate) trait TopologyProvider {
    fn provide_node_count(&self) -> usize;
    fn provide_edge_count(&self) -> usize;
    /// Returns the visible `[source, target]` pair, or [`None`] for an absent edge.
    fn provide_endpoints(&self, edge: EdgeRowId) -> Option<[NodeRowId; 2]>;
    fn provide_incoming(&self, node: NodeRowId) -> impl Iterator<Item = EdgeRowId>;
    fn provide_outgoing(&self, node: NodeRowId) -> impl Iterator<Item = EdgeRowId>;
}

impl<T: TopologyProvider + ?Sized> TopologyProvider for &T {
    fn provide_node_count(&self) -> usize {
        T::provide_node_count(self)
    }

    fn provide_edge_count(&self) -> usize {
        T::provide_edge_count(self)
    }

    fn provide_endpoints(&self, edge: EdgeRowId) -> Option<[NodeRowId; 2]> {
        T::provide_endpoints(self, edge)
    }

    fn provide_incoming(&self, node: NodeRowId) -> impl Iterator<Item = EdgeRowId> {
        T::provide_incoming(self, node)
    }

    fn provide_outgoing(&self, node: NodeRowId) -> impl Iterator<Item = EdgeRowId> {
        T::provide_outgoing(self, node)
    }
}

/// The fitted endpoint bindings and adjacency lists of one generation.
#[derive(Debug)]
pub(crate) struct Topology {
    pub identity: IdentityTableArchive<ArchivedEntityId, EdgeRowId>,

    adjacency: AdjacencyArchive,
    endpoints: Column<EdgeRowId, [NodeRowId; 2]>,
}

impl Topology {
    /// Opens the fitted topology and checks its edge counts.
    ///
    /// # Errors
    ///
    /// Returns [`WorldError`] for artifact opening, mismatched counts or an oversized edge domain.
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

    /// Returns the visible `[source, target]` pair at the captured epoch's revision.
    ///
    /// # Panics
    ///
    /// Panics if this topology does not belong to the epoch's world.
    pub(crate) fn endpoints(&self, epoch: &Epoch, edge: EdgeRowId) -> Option<[NodeRowId; 2]> {
        let endpoints = epoch
            .topology(self)
            .bind(NaiveTopologyProvider::from_ref(self))
            .provide_endpoints_at(edge, epoch.revision())?;

        endpoints
            .iter()
            .all(|&node| epoch.contains_node(node))
            .then_some(endpoints)
    }

    /// Returns visible incoming edges in ascending row order at the captured revision.
    ///
    /// # Panics
    ///
    /// Panics if this topology does not belong to the epoch's world.
    pub(crate) fn incoming<'epoch>(
        &'epoch self,
        epoch: &'epoch Epoch,
        node: NodeRowId,
    ) -> impl Iterator<Item = EdgeRowId> + 'epoch {
        epoch
            .topology(self)
            .bind(NaiveTopologyProvider::from_ref(self))
            .into_incoming_at(node, epoch.revision())
            .filter(move |&edge| self.endpoints(epoch, edge).is_some())
    }

    /// Returns visible outgoing edges in ascending row order at the captured revision.
    ///
    /// # Panics
    ///
    /// Panics if this topology does not belong to the epoch's world.
    pub(crate) fn outgoing<'epoch>(
        &'epoch self,
        epoch: &'epoch Epoch,
        node: NodeRowId,
    ) -> impl Iterator<Item = EdgeRowId> + 'epoch {
        epoch
            .topology(self)
            .bind(NaiveTopologyProvider::from_ref(self))
            .into_outgoing_at(node, epoch.revision())
            .filter(move |&edge| self.endpoints(epoch, edge).is_some())
    }

    pub(crate) fn row_of(&self, epoch: &Epoch, edge: ArchivedEntityId) -> Option<EdgeRowId> {
        epoch
            .edges(self)
            .bind(NaiveIdentityProvider::from_ref(&self.identity))
            .provide_row_of_at(edge, epoch.revision())
    }

    pub(crate) fn key_of(&self, epoch: &Epoch, edge: EdgeRowId) -> Option<ArchivedEntityId> {
        epoch
            .edges(self)
            .bind(NaiveIdentityProvider::from_ref(&self.identity))
            .provide_key_of_at(edge, epoch.revision())
    }

    pub(crate) fn payload<'scene>(
        &'scene self,
        epoch: &'scene Epoch,
        edge: EdgeRowId,
    ) -> Option<&'scene Legend> {
        epoch
            .edges(self)
            .bind(NaiveIdentityProvider::from_ref(&self.identity))
            .into_payload_of_row_at(edge, epoch.revision())
    }

    /// Returns the allocated edge count, including withdrawn and unbound rows.
    ///
    /// # Panics
    ///
    /// Panics if this topology does not belong to the epoch's world.
    pub(crate) fn edge_count(&self, epoch: &Epoch) -> usize {
        epoch
            .topology(self)
            .bind(NaiveTopologyProvider::from_ref(self))
            .provide_edge_count()
    }

    /// Returns the allocated node count, including nodes without incident edges.
    ///
    /// # Panics
    ///
    /// Panics if this topology does not belong to the epoch's world.
    pub(crate) fn node_count(&self, epoch: &Epoch) -> usize {
        epoch
            .topology(self)
            .bind(NaiveTopologyProvider::from_ref(self))
            .provide_node_count()
    }
}

impl TopologyProvider for Topology {
    #[expect(
        clippy::cast_possible_truncation,
        reason = "the world's open compares the count against the layout's `usize` node count"
    )]
    fn provide_node_count(&self) -> usize {
        self.adjacency.rows() as usize
    }

    fn provide_edge_count(&self) -> usize {
        self.endpoints.len()
    }

    fn provide_endpoints(&self, edge: EdgeRowId) -> Option<[NodeRowId; 2]> {
        self.endpoints.view().get(edge).copied()
    }

    fn provide_incoming(&self, node: NodeRowId) -> impl Iterator<Item = EdgeRowId> {
        self.adjacency
            .incoming(node)
            .into_iter()
            .flat_map(EdgeList::iter)
    }

    fn provide_outgoing(&self, node: NodeRowId) -> impl Iterator<Item = EdgeRowId> {
        self.adjacency
            .outgoing(node)
            .into_iter()
            .flat_map(EdgeList::iter)
    }
}

#[cfg(test)]
mod tests {
    use core::assert_matches;

    use super::Topology;
    use crate::{
        identity::EdgeRowId,
        serve::{
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
