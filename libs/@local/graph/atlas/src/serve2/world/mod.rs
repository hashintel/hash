use std::io;

use error_stack::{Report, ResultExt as _, TryReportTupleExt as _};

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

pub struct World {
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

        Ok(Self {
            generation,
            schedule,
            layout,
            topology,
            cache: Cache::new(),
            ontology,
        })
    }

    pub async fn destroy(self) -> io::Result<()> {
        // removes the world's resources from memory AND removes the directory from the filesystem
        // because we memory map the files, it's not an issue, we don't need to unmap them
        // beforehand, because they all carry their fd which means that the underlying file will be
        // closed when this struct goes out of scope (at the end of the function)
        tokio::fs::remove_dir_all(self.generation.path()).await
    }
}
