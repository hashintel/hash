use std::sync::Arc;

use arrow::{array::ArrayData, record_batch::RecordBatch};

use crate::{
    arrow::{change::ColumnChange, flush::GrowableBatch, load},
    error::{Error, Result},
    memory::{Memory, Metaversion, Segment},
    meta::{self, conversion::HashDynamicMeta},
};

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

impl ArrowBatch {
    pub fn new(
        segment: Segment,
        record_batch: RecordBatch,
        dynamic_meta: meta::Dynamic,
        static_meta: Arc<meta::Static>,
        changes: Vec<ColumnChange>,
        loaded_metaversion: Metaversion,
    ) -> Self {
        Self {
            segment,
            record_batch,
            dynamic_meta,
            static_meta,
            changes,
            loaded_metaversion,
        }
    }

    pub fn segment(&self) -> &Segment {
        &self.segment
    }

    pub fn segment_mut(&mut self) -> &mut Segment {
        &mut self.segment
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
    pub fn record_batch_unchecked(&self) -> &RecordBatch {
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

    pub fn loaded_metaversion_mut(&mut self) -> &mut Metaversion {
        &mut self.loaded_metaversion
    }

    /// Reload record batch (without checking metaversions).
    pub fn reload_record_batch(&mut self) -> Result<()> {
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
    pub fn reload_record_batch_and_dynamic_meta(&mut self) -> Result<()> {
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

    pub fn has_queued_changes(&self) -> bool {
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

    pub fn set_loaded_metaversion(&mut self, metaversion: Metaversion) {
        self.loaded_metaversion = metaversion
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
                self.memory_mut().reload()?;
            }
            self.reload_record_batch_and_dynamic_meta()?;

            self.loaded_metaversion = persisted;
            debug_assert!(self.is_persisted());
        }
        Ok(())
    }
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
