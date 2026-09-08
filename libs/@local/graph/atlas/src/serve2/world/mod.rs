//! Opened artifacts of one fitted generation.
//!
//! [`World`] checks that its components share a node domain. Its layout and topology accessors use
//! an [`Epoch`](super::delta::epoch::Epoch) to include revision-dependent changes.

use std::io;

use error_stack::{Report, ReportSink, ResultExt as _, TryReportTupleExt as _};

use super::{schedule::BucketSchedule, secret::ServeSecret};
use crate::{file::generation::Generation, math::Bounds2};

mod cache;
mod encoding;
mod error;
mod geometry;
pub(crate) mod layout;
mod node_importance;
mod node_index;
mod ontology;
pub(crate) mod topology;

pub(crate) use self::{
    cache::Cache, encoding::Encoding, error::WorldError, geometry::Geometry, layout::Layout,
    node_importance::NodeImportance, node_index::NodeIndex, ontology::Ontology, topology::Topology,
};

/// A generation and the secret used to derive its wire-ID codecs.
#[derive(Clone, Copy)]
pub(crate) struct OpenOptions<'context> {
    pub generation: &'context Generation,
    pub secret: &'context ServeSecret,
}

/// The serving artifacts of one fitted generation with matching component node counts.
#[derive(Debug)]
pub(crate) struct World {
    generation: Generation,

    schedule: BucketSchedule,

    pub layout: Layout,
    pub topology: Topology,
    cache: Cache,

    pub ontology: Ontology,
}

impl World {
    /// Opens the generation's serving components and checks their shared node domain.
    ///
    /// # Errors
    ///
    /// Returns [`WorldError`] for invalid schedules, component opening failures or mismatched node
    /// counts.
    pub(crate) fn open(
        generation: Generation,
        secret: &ServeSecret,
    ) -> Result<Self, Report<[WorldError]>> {
        let options = OpenOptions {
            generation: &generation,
            secret,
        };

        let schedule =
            BucketSchedule::new(generation.repository().metadata.reproducibility.config.lod)
                .change_context(WorldError::BucketSchedule);
        let layout = Layout::open(options);
        let topology = Topology::open(options);
        let ontology = Ontology::open(options);

        let (schedule, layout, topology, ontology) =
            (schedule, layout, topology, ontology).try_collect()?;

        let this = Self {
            generation,
            schedule,
            layout,
            topology,
            cache: Cache::new(),
            ontology,
        };

        let mut sink = ReportSink::new_armed();

        let layout = layout::LayoutProvider::provide_node_count(&this.layout);
        let topology = topology::TopologyProvider::provide_node_count(&this.topology);
        let ontology = this.ontology.node_count();
        if layout != topology || layout != ontology {
            sink.capture(WorldError::NodeCountMismatch {
                layout,
                topology,
                ontology,
            });
        }

        sink.finish_ok(this)
    }

    /// Returns the coordinate bounds before wire-frame normalization.
    pub(crate) fn fitted_bounds(&self) -> Bounds2 {
        self.generation.repository().metadata.evidence.lod.world
    }

    /// Removes the generation's directory from the filesystem and drops the world.
    ///
    /// # Errors
    ///
    /// Returns any filesystem error from removing the directory.
    pub(crate) async fn destroy(self) -> io::Result<()> {
        // A file is only truly deleted once all of its file descriptors are closed, and each
        // artifact holds two file descriptors. One for the mmap, another one for the
        // advisory read lock. Therefore it is safe to remove the directory, and then
        // release the file descriptors at the end of the call through `Drop`.
        tokio::fs::remove_dir_all(self.generation.path()).await
    }
}

#[cfg(test)]
mod tests {
    use core::assert_matches;

    use super::{World, error::WorldError, layout::LayoutProvider, topology::TopologyProvider};
    use crate::serve2::tests::fixture::{
        ENDPOINTS, NODES, TamperFixture, respan_adjacency, retarget_postings_points, secret,
    };

    /// The synthetic generation opens as a world.
    #[test]
    fn untampered_opens() {
        let fixture = TamperFixture::publish("world-untampered");

        let world = World::open(fixture.generation().clone(), &secret())
            .expect("the untampered generation opens");
        let nodes = usize::try_from(NODES).expect("fixture node counts fit usize");

        assert_eq!(LayoutProvider::provide_node_count(&world.layout), nodes);
        assert_eq!(TopologyProvider::provide_node_count(&world.topology), nodes);
        assert_eq!(world.ontology.node_count(), nodes);
        assert_eq!(
            TopologyProvider::provide_edge_count(&world.topology),
            ENDPOINTS.len()
        );
    }

    /// Open refuses an adjacency spanning an extra node row, under
    /// [`WorldError::NodeCountMismatch`].
    ///
    /// Dropping a node row from the adjacency would drop that node's edge slots with it and move
    /// the edge domain in the same tamper. The tamper therefore adds a row, and widening is as
    /// much a producer bug as truncation is.
    #[test]
    fn adjacency_extra_node_row() {
        let fixture = TamperFixture::publish("world-adjacency-extra-node-row");
        let nodes = usize::try_from(NODES).expect("fixture node counts fit usize");
        let files = &fixture.generation().repository().files;

        let tampered = fixture.tamper(&files.adjacency.name(), |path| {
            respan_adjacency(path, nodes + 1, &ENDPOINTS);
        });
        let report = World::open(tampered, &secret())
            .expect_err("open refuses an adjacency spanning an extra node row");

        assert_matches!(
            report.current_contexts().collect::<Vec<_>>().as_slice(),
            [WorldError::NodeCountMismatch {
                layout,
                topology,
                ontology,
            }] if *layout == nodes && *topology == nodes + 1 && *ontology == nodes,
        );
    }

    /// Open refuses a postings point domain above the layout's node count, under
    /// [`WorldError::NodeCountMismatch`].
    ///
    /// Narrowing the postings' point domain can strand a membership position outside it, which
    /// the postings contract refuses first and under its own name. The tamper therefore adds a
    /// row.
    #[test]
    fn postings_points_wide() {
        let fixture = TamperFixture::publish("world-postings-points-wide");
        let nodes = usize::try_from(NODES).expect("fixture node counts fit usize");
        let files = &fixture.generation().repository().files;

        let tampered = fixture.tamper(&files.postings.name(), |path| {
            retarget_postings_points(path, NODES + 1);
        });
        let report = World::open(tampered, &secret())
            .expect_err("open refuses a postings point domain above the node count");

        assert_matches!(
            report.current_contexts().collect::<Vec<_>>().as_slice(),
            [WorldError::NodeCountMismatch {
                layout,
                topology,
                ontology,
            }] if *layout == nodes && *topology == nodes && *ontology == nodes + 1,
        );
    }
}
