use std::io;

use self::{cache::Cache, layout::Layout, ontology::Ontology, topology::Topology};
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

pub struct OpenOptions<'context> {
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
    pub async fn destroy(self) -> io::Result<()> {
        // removes the world's resources from memory AND removes the directory from the filesystem
        // because we memory map the files, it's not an issue, we don't need to unmap them
        // beforehand, because they all carry their fd which means that the underlying file will be
        // closed when this struct goes out of scope (at the end of the function)
        tokio::fs::remove_dir_all(self.generation.path()).await
    }
}
