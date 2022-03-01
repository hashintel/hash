use crate::datastore::storage::BufferChange;

// Simple way for every component (language-runner + engine)
// using the datastore to track whether it has to reload memory
// or reload the recordbatch

#[must_use]
#[derive(Debug, Clone, Copy, Default)]
pub struct Metaversion {
    memory: u32,
    batch: u32,
}

impl Metaversion {
    // TODO: UNUSED: Needs triage
    pub fn new(memory: u32, batch: u32) -> Metaversion {
        Metaversion { memory, batch }
    }

    // TODO: UNUSED: Needs triage
    pub fn update(&mut self, new_state: &Metaversion) {
        self.memory = new_state.memory;
        self.batch = new_state.batch;
    }

    #[must_use]
    pub fn memory(&self) -> u32 {
        self.memory
    }

    #[must_use]
    pub fn batch(&self) -> u32 {
        self.batch
    }

    pub fn increment(&mut self) {
        self.memory += 1;
        self.batch += 1;
    }

    pub fn increment_batch(&mut self) {
        self.batch += 1;
    }

    pub fn increment_with(&mut self, change: &BufferChange) {
        if change.resized() {
            self.increment();
        } else if change.shifted() {
            self.increment_batch();
        }
    }
}

impl From<flatbuffers_gen::metaversion_generated::Metaversion<'_>> for Metaversion {
    fn from(state: flatbuffers_gen::metaversion_generated::Metaversion<'_>) -> Metaversion {
        Metaversion {
            memory: state.memory(),
            batch: state.batch(),
        }
    }
}
