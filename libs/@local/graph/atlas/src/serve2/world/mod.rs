use std::io;

use error_stack::{Report, ReportSink, ResultExt as _, TryReportTupleExt as _};

use self::{
    cache::Cache, error::WorldError, layout::Layout, ontology::Ontology, topology::Topology,
};
use super::{schedule::BucketSchedule, secret::ServeSecret};
use crate::file::generation::Generation;

mod cache;
mod encoding;
mod error;
mod geometry;
mod layout;
mod node_importance;
mod node_index;
mod ontology;
mod topology;

#[derive(Clone, Copy)]
pub(crate) struct OpenOptions<'context> {
    pub generation: &'context Generation,
    pub secret: &'context ServeSecret,
}

pub(crate) struct World {
    generation: Generation,

    schedule: BucketSchedule,

    layout: Layout,
    topology: Topology,
    cache: Cache,

    ontology: Ontology,
}

impl World {
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

        if this.layout.node_count() != this.topology.node_count()
            || this.layout.node_count() != this.ontology.node_count()
        {
            sink.capture(WorldError::NodeCountMismatch {
                layout: this.layout.node_count(),
                topology: this.topology.node_count(),
                ontology: this.ontology.node_count(),
            });
        }

        sink.finish_ok(this)
    }

    /// Removes the generation's directory from the filesystem and drops the world.
    ///
    /// # Errors
    ///
    /// Returns the filesystem error when the directory cannot be removed.
    pub(crate) async fn destroy(self) -> io::Result<()> {
        // A file is only truly deleted once all of it's file descriptors are closed, and each
        // artifact holds two file descriptors. One for the mmap, another one for the
        // advisory read lock. Therefore it is safe to remove the directory, and then
        // release the file descriptors at the end of the call through `Drop`.
        tokio::fs::remove_dir_all(self.generation.path()).await
    }
}
