pub mod agent;
pub mod boolean;
pub mod change;
pub mod context;
pub mod dataset;
pub mod flush;
pub mod iterators;
pub mod message;
pub mod metaversion;
pub mod migration;

use std::sync::Arc;

use arrow::{array::ArrayData, datatypes::Schema, record_batch::RecordBatch};

pub use self::{
    agent::AgentBatch,
    context::{AgentIndex, MessageIndex},
    dataset::Dataset,
    message::MessageBatch,
    metaversion::Metaversion,
};
use crate::datastore::{
    arrow::meta_conversion::HashDynamicMeta,
    batch::{change::ColumnChange, flush::GrowableBatch},
    error::{Error, Result},
    meta,
    storage::memory::Memory,
};

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

    pub(in crate::datastore::batch) fn memory_mut(&mut self) -> &mut Memory {
        &mut self.0
    }

    /// Set the latest batch version and memory version of this batch that is persisted in memory
    /// (in this experiment as a whole). # Panics
    ///
    /// If the metaversion wasn't written properly when the batch was created or the part of memory
    /// with the metaversion was deallocated later, this might fail to read the metaversion.
    pub(in crate::datastore::batch) fn set_persisted_metaversion(
        &mut self,
        metaversion: Metaversion,
    ) {
        self.memory_mut()
            .set_metaversion(metaversion)
            .expect("A segment must always have a persisted metaversion, so set shouldn't fail.");
    }
}

/// Batch with Arrow data that can be accessed as an Arrow record batch
pub struct ArrowBatch {
    segment: Segment,

    /// Arrow `RecordBatch` with references to `self.segment`
    record_batch: RecordBatch,

    /// Metadata referring to positions, sizes, null counts and value counts of different Arrow
    /// buffers.
    dynamic_meta: meta::Dynamic,

    /// Map of which Arrow `Buffer`s and `FieldNode`s correspond to which column.
    static_meta: Arc<meta::Static>,

    /// When growable columns are modified, their Arrow intermediate column representations are
    /// kept here and wait for the `self.flush_changes()` call, which inserts them into
    /// `self.segment`.
    changes: Vec<ColumnChange>,

    /// Currently loaded version of memory and batch
    loaded_metaversion: Metaversion,
}

impl GrowableBatch<ArrayData, ColumnChange> for ArrowBatch {
    fn static_meta(&self) -> &meta::Static {
        &self.static_meta
    }

    fn dynamic_meta(&self) -> &meta::Dynamic {
        &self.dynamic_meta
    }

    fn dynamic_meta_mut(&mut self) -> &mut meta::Dynamic {
        &mut self.dynamic_meta
    }

    fn memory(&self) -> &Memory {
        self.segment.memory()
    }

    fn memory_mut(&mut self) -> &mut Memory {
        self.segment.memory_mut()
    }
}

impl ArrowBatch {
    pub fn segment(&self) -> &Segment {
        &self.segment
    }

    /// Add change to internal queue without checking metaversions.
    fn queue_change_unchecked(&mut self, change: ColumnChange) {
        debug_assert!(
            self.is_persisted(),
            "Should have loaded latest persisted data before queueing changes"
        );
        self.changes.push(change)
    }

    /// Return record batch without checking whether the latest persisted data has been loaded.
    fn record_batch_unchecked(&self) -> &RecordBatch {
        debug_assert!(
            self.is_persisted(),
            "Should have loaded latest persisted data before getting record batch"
        );
        &self.record_batch
    }

    /// Return record batch without checking whether the latest persisted data has been loaded.
    fn record_batch_unchecked_mut(&mut self) -> &mut RecordBatch {
        debug_assert!(
            self.is_persisted(),
            "Should have loaded latest persisted data before getting mutable record batch"
        );
        &mut self.record_batch
    }

    fn loaded_metaversion_mut(&mut self) -> &mut Metaversion {
        &mut self.loaded_metaversion
    }

    /// Reload record batch (without checking metaversions).
    fn reload_record_batch(&mut self) -> Result<()> {
        debug_assert!(
            self.memory().validate_markers().is_ok(),
            "Can't reload record batch; see validate_markers"
        );
        let record_batch_message = load::record_batch_message(&self.segment)?;

        // The record batch was loaded at least once before, since this struct has a `RecordBatch`
        // field, and the Arrow schema doesn't change, so we can reuse it.
        let schema = self.record_batch.schema();
        self.record_batch = load::record_batch(&self.segment, record_batch_message, schema)?;
        Ok(())
    }

    /// Reload record batch and dynamic metadata (without checking metaversions).
    fn reload_record_batch_and_dynamic_meta(&mut self) -> Result<()> {
        debug_assert!(
            self.memory().validate_markers().is_ok(),
            "Can't reload record batch; see validate_markers"
        );
        let record_batch_message = load::record_batch_message(&self.segment)?;
        let dynamic_meta =
            record_batch_message.into_meta(self.memory().get_data_buffer()?.len())?;

        // The record batch was loaded at least once before, since this struct has a `RecordBatch`
        // field, and the Arrow schema doesn't change, so we can reuse it.
        let schema = self.record_batch.schema();
        self.record_batch = load::record_batch(&self.segment, record_batch_message, schema)?;
        *self.dynamic_meta_mut() = dynamic_meta;
        Ok(())
    }

    fn has_queued_changes(&self) -> bool {
        !self.changes.is_empty()
    }

    // Have to implement twice, because GrowableBatch trait isn't public.
    pub fn static_meta(&self) -> &meta::Static {
        &self.static_meta
    }

    pub fn dynamic_meta(&self) -> &meta::Dynamic {
        &self.dynamic_meta
    }

    /// The versions of the batch and memory that are currently loaded (in this runtime/process).
    pub fn loaded_metaversion(&self) -> Metaversion {
        self.loaded_metaversion
    }

    /// Returns whether the latest persisted data has been loaded. That means that the batch is up
    /// to date, unless some other engine component has queued changes that it hasn't flushed yet.
    ///
    /// The loaded metaversion can't be newer than the persisted metaversion, since queueing changes
    /// doesn't affect the loaded data.
    pub fn is_persisted(&self) -> bool {
        let loaded = self.loaded_metaversion();
        let persisted = self.segment.persisted_metaversion();
        debug_assert!(!loaded.newer_than(persisted));
        loaded == persisted
    }

    pub fn flush_changes(&mut self) -> Result<()> {
        if !self.is_persisted() {
            return Err(Error::from(format!(
                "Tried to flush changes older than or equal to already written data: {:?}, {:?}",
                self.loaded_metaversion(),
                self.segment.persisted_metaversion(),
            )));
        }

        let changes = std::mem::take(&mut self.changes);
        let changed = GrowableBatch::flush_changes(self, changes)?;

        let mut persisted = self.segment.persisted_metaversion();
        let before = persisted;
        if changed.resized() {
            persisted.increment(); // Memory must be reloaded (along with batch).
        } else {
            persisted.increment_batch(); // Only batch needs to be reloaded.
        };
        // TODO: Loaded memory version is always up to date here,
        //       because if shared memory was resized in flush_changes,
        //       that automatically means it was mapped again in this
        //       process.
        self.segment.set_persisted_metaversion(persisted);
        tracing::debug!(
            "Flush metaversions: {before:?}, {persisted:?}, {:?}",
            self.segment.persisted_metaversion()
        );
        Ok(())
    }

    /// Add an Arrow column's data to an internal queue of changes to later persist to memory.
    ///
    /// # Errors
    ///
    /// If the loaded metaversion isn't equal to the persisted metaversion, this gives an error to
    /// avoid queueing stale data. (The loaded metaversion can't be newer than the persisted
    /// metaversion.)
    // TODO: We might have to remove this restriction to allow flushing changes multiple times
    //       without loading.
    pub fn queue_change(&mut self, change: ColumnChange) -> Result<()> {
        if self.is_persisted() {
            self.queue_change_unchecked(change);
            Ok(())
        } else {
            Err(Error::from(format!(
                "Tried to queue changes older than or equal to already written data: {:?}, {:?}",
                self.loaded_metaversion(),
                self.segment.persisted_metaversion(),
            )))
        }
    }

    /// Return record batch if and only if the loaded version is equal to the persisted version.
    /// (The loaded version can't be newer than the persisted version.)
    pub fn record_batch(&self) -> Result<&RecordBatch> {
        if self.is_persisted() {
            Ok(self.record_batch_unchecked())
        } else {
            Err(Error::from(
                "Loaded record batch is older than persisted one",
            ))
        }
    }

    /// Return record batch if and only if the loaded version is equal to the persisted version.
    /// (The loaded version can't be newer than the persisted version.)
    ///
    /// TODO: Should remove this function, because using it
    ///       doesn't automatically update the persisted metaversion
    ///       when the batch is mutated. (RecordBatchWriteGuard that
    ///       updates metaversions when dropped?)
    pub fn record_batch_mut(&mut self) -> Result<&mut RecordBatch> {
        if self.is_persisted() {
            Ok(self.record_batch_unchecked_mut())
        } else {
            Err(Error::from(
                "Loaded record batch is older than persisted one",
            ))
        }
    }

    pub fn increment_batch_version(&mut self) {
        debug_assert!(self.is_persisted());
        self.loaded_metaversion.increment_batch();
        let mut persisted = self.segment.persisted_metaversion();
        persisted.increment_batch();
        self.segment.set_persisted_metaversion(persisted);
    }

    /// Copy data from `new_batch` into self and increment persisted metaversion of self. (Don't
    /// change the loaded version, because the persisted data of `new_batch` was only copied to the
    /// persisted data of self, without loading data.)
    ///
    /// The loaded metaversion can be older than the persisted one, because the written data doesn't
    /// depend on what is loaded.
    ///
    /// # Errors
    ///
    /// There must be no queued changes.
    // TODO: other errors?
    pub fn sync(&mut self, new_batch: &Self) -> Result<()> {
        if self.has_queued_changes() {
            return Err(Error::from(
                "Can't sync batch when there are queued changes.",
            ));
        }

        let mut metaversion_to_persist = self.segment.persisted_metaversion();

        let new_memory = new_batch.memory();
        // Make capacity at least as large as new memory capacity.
        if self.memory().size < new_memory.size {
            self.memory_mut().resize(new_memory.size)?;
            metaversion_to_persist.increment();
        }

        let new_bytes = new_memory.get_contents_bytes()?;
        debug_assert!(
            new_bytes.len() <= new_memory.size,
            "Memory capacity is too small for existing contents"
        );
        debug_assert!(
            self.memory().size >= new_bytes.len(),
            "Memory capacity ({}) is too small for new contents ({}) despite earlier resize",
            self.memory().size,
            new_bytes.len(),
        );
        self.memory_mut().overwrite_no_bounds_check(new_bytes)?;

        *self.dynamic_meta_mut() = new_batch.dynamic_meta().clone();
        self.reload_record_batch()?;
        metaversion_to_persist.increment_batch();

        self.segment
            .set_persisted_metaversion(metaversion_to_persist);
        // Right before this function was called, the loaded metaversion must have been older than
        // or equal to the persisted one, so now it is strictly older.
        debug_assert!(self.loaded_metaversion().older_than(metaversion_to_persist));
        // We reloaded the record batch above after writing it.
        *self.loaded_metaversion_mut() = metaversion_to_persist;
        Ok(())
    }

    /// If the persisted metaversion is greater than the loaded version (i.e. either the batch
    /// version or the memory version is strictly greater than the loaded version), then the batch
    /// and/or memory is reloaded and the loaded metaversion is mutated to be the persisted one.
    pub fn maybe_reload(&mut self) -> Result<()> {
        if !self.is_persisted() {
            let persisted = self.segment.persisted_metaversion();

            if self.loaded_metaversion.memory() < persisted.memory() {
                self.segment.0.reload()?;
            }
            self.reload_record_batch_and_dynamic_meta()?;

            self.loaded_metaversion = persisted;
            debug_assert!(self.is_persisted());
        }
        Ok(())
    }
}

mod load {
    use std::sync::Arc;

    use arrow::{ipc, ipc::reader::read_record_batch};

    use crate::datastore::batch::{Error, RecordBatch, Result, Schema, Segment};

    /// Read the Arrow RecordBatch metadata from memory
    pub fn record_batch_message(segment: &Segment) -> Result<ipc::RecordBatch<'_>> {
        let (_, _, meta_buffer, _) = segment.memory().get_batch_buffers()?;
        ipc::root_as_message(meta_buffer)?
            .header_as_record_batch()
            .ok_or(Error::InvalidRecordBatchIpcMessage)
    }

    pub fn record_batch(
        segment: &Segment,
        record_batch_message: ipc::RecordBatch<'_>,
        schema: Arc<Schema>,
    ) -> Result<RecordBatch> {
        let (_, _, _, data_buffer) = segment.memory().get_batch_buffers()?;
        Ok(read_record_batch(
            data_buffer,
            record_batch_message,
            schema,
            &[],
        )?)
    }
}
