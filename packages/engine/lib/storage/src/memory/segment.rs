use crate::memory::{Memory, Metaversion};

// TODO: This should probably be merged into `Memory`. Then `Memory` would always have a memory
//       version (currently part of the batch metaversion) and the memory version should probably be
//       a fifth marker.
// TODO: Functions with mutable access to `Memory` should be made private to the datastore, so that
//       code outside the datastore can't mutate memory directly, even if it has mutable access to a
//       batch. `CMemory` in the Python FFI would need to be replaced with `CSegment`.
// TODO: Probably move loaded memory version into Segment -- we'll have to split metaversion storage
//       into memory and batch versions, because some segments contain things which don't really
//       have batch versions, e.g. datasets.
/// Used by datasets, agent batches, message batches, context global batch, [`PreparedBatch`].
///
/// [`PreparedBatch`]: crate::datastore::ffi::PreparedBatch
pub struct Segment(Memory);

impl Segment {
    pub fn from_memory(memory: Memory) -> Self {
        Self(memory)
    }

    /// The latest batch version and memory version of this batch that is persisted in memory (in
    /// this experiment as a whole)
    ///
    /// # Panics
    ///
    /// If the metaversion wasn't written properly when the batch was created or the part of memory
    /// with the metaversion was deallocated later, this might fail to read the metaversion.
    pub fn persisted_metaversion(&self) -> Metaversion {
        self.0
            .metaversion()
            .expect("Every segment must have a metaversion")
    }

    pub fn memory(&self) -> &Memory {
        &self.0
    }

    pub fn memory_mut(&mut self) -> &mut Memory {
        &mut self.0
    }

    /// Set the latest batch version and memory version of this batch that is persisted in memory
    /// (in this experiment as a whole). # Panics
    ///
    /// If the metaversion wasn't written properly when the batch was created or the part of memory
    /// with the metaversion was deallocated later, this might fail to read the metaversion.
    pub fn set_persisted_metaversion(&mut self, metaversion: Metaversion) {
        self.memory_mut()
            .set_metaversion(metaversion)
            .expect("A segment must always have a persisted metaversion, so set shouldn't fail.");
    }
}
