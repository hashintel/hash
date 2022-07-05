//! The metaversion of a shared batch consists of a batch version and a memory version,
//! which are initially both zero. The batch version increases when the batch's data or
//! memory layout changes and the memory version increases when the shared memory segment
//! that the batch is in is moved or resized.
//!
//! Each engine component (simulation run main loops and language runners) keeps track of the
//! metaversion it has loaded for each batch. When a batch is written to, moved or resized, its
//! new metaversion is persisted along with the batch. An engine component can find out whether
//! it needs to reload a batch/memory by comparing the component's loaded version with the
//! persisted version.
//!
//! This has two benefits:
//! 1. Safety: The engine component can verify that its loaded version is the latest (persisted)
//! version of the batch and thus avoid doing computations with stale data.
//! 2. Performance: The engine component can avoid loading data when it already has the latest
//! (persisted) version.
//!
//! The persisted memory version can only change when the batch version changes -- if the memory
//! version changes, then the batch version also changes, because when memory is reloaded, the batch
//! becomes invalid. The persisted batch version is always greater than or equal to the memory
//! version. The loaded batch version might be less than the memory version if memory is repeatedly
//! reloaded without reloading the batch.
//!
//! A subtlety about the persisted memory version is that it can be read even when memory
//! has changed. This is because when a shared memory segment is resized, the initial part
//! of the segment stays valid if it was previously loaded and is smaller than the current
//! size. The persisted metaversion always fits within such an initial part, because it is
//! near the start of the segment and doesn't move within it.
//!
//! (The memory version can't ever change on Mac OS, because it can't resize shared memory.)
//!
//! # Access control
//!
//! * If loaded memory and batch are older than latest persisted:
//! Nothing is allowed without reloading memory.
//!
//! * If loaded memory is latest persisted, but loaded batch is older than latest persisted:
//! It is allowed to overwrite part of memory (except for [`Markers`]) and treat the rest of memory
//! as being uninitialized (except for [`Markers`]). It is not allowed to write something (except
//! for [`Markers`]) and still treat the rest of memory as being initialized, because the
//! overwritten part might be at an unexpected location due to the batch changing. It is not allowed
//! to read anything (except for [`Markers`]) without reloading the batch (because data might be
//! outdated and also because data might have moved to a different location in memory).
//!
//! * If loaded memory and batch are latest persisted:
//! All reading and writing is allowed. If writing in place (e.g. overwriting an integer column),
//! there must be no queued changes.
//!
//! [`Markers`]: crate::shared_memory::Markers
//!
//! ## Examples
//!
//! Here are two examples from a simulation that only has JavaScript behaviors, a behavior execution
//! package and an agent messages package, with no other state or context packages.
//!
//! 1. The JavaScript component of behavior execution writes messages to an outbox batch. Then on
//! the next step, it becomes an inbox batch in the context, and the main loop and JavaScript read
//! from it.
//!
//! The batch versions are as follows.
//!
//! * The simulation main loop creates the message batch (treating it as an outbox, i.e. part of
//!   state), with both loaded and persisted version 0.
//!
//! * During state sync, the message batch's id is sent to the JavaScript runner, which sees the id
//!   for the first time and loads the memory and batch. The runner's loaded version is set to the
//!   persisted version, 0.
//!
//! * We run behavior execution for the first time. The JavaScript component of the behavior
//!   execution package runs behaviors, which modifies the loaded (empty) data in place, adding
//!   messages to it. Before flushing, it checks that the loaded version is equal to the persisted
//!   version (to make sure that we were modifying the latest data and avoid writing stale data) --
//!   they should both be 0. Then it increments the loaded version to 1 and flushes the data, also
//!   making the persisted version equal to the new loaded version, 1.
//!
//! * The behavior execution package finishes and we reach the next step. Before running context
//!   packages, the main loop needs to handle messages to HASH, so it needs to have the latest
//!   version of the message batch (now treating it as an inbox, i.e. part of the context). The main
//!   loop's loaded version, 0, is less than the persisted version, 1, so the main loop reloads the
//!   batch and sets the loaded version to the persisted version, 1. Then it uses the loaded data to
//!   handle messages.
//!
//! * The message batch's id is sent to the JavaScript runner again. The runner's loaded version is
//!   already equal to the persisted version, 1, so the batch isn't reloaded.
//!
//! * Behavior execution starts again and the JavaScript runner reads incoming messages from the
//!   batch. Nothing is written to the batch, because outgoing messages are written to a different
//!   batch.
//!
//! 2. The JavaScript component of behavior execution writes behavior names into the `behaviors`
//! column of an agent state batch. Then on the next step, the main component of behavior execution
//! reads the names and writes corresponding behavior ids into the agent state batch.
//!
//! * The simulation main loop creates the agent state batch using data from an init package, with
//!   both loaded and persisted version 0.
//!
//! * During state sync, the batch's id is sent to the JavaScript runner, which sees the id for the
//!   first time and loads the memory and batch. The runner's loaded version is set to the persisted
//!   version, 0. (The loading happens in parallel with running context packages in the main loop,
//!   since context packages don't modify state.)
//!
//! * Behavior execution starts. The loaded version is already equal to the persisted version, so
//!   the batch isn't reloaded. The main component of behavior execution writes behavior ids,
//!   increments the loaded version to 1, flushes the behavior ids and sets the persisted version
//!   equal to the loaded version.
//!
//! * The JavaScript component of behavior execution starts. The persisted version, 1, is greater
//!   than the JavaScript runner's loaded version, 0, so the runner reloads the batch and sets its
//!   loaded version equal to the persisted version.
// TODO: Currently columns are likely to end up being loaded twice, which is, of course, bad for
//       performance. Either the state sync above should be removed (which loses parallelism with
//       context packages) or the writing of behavior ids should be moved into the language runner
//       components of the behavior execution package -- into whichever language is executed first.
//!
//! * Behaviors are executed, modifying the loaded `behaviors` column. The runner increments its
//!   loaded version to 2, flushes the column (possibly along with other columns) to the agent state
//!   batch and sets the persisted version equal to its loaded version.
//!
//! * Behavior execution finishes and we reach the next step. To update context agent batches and
//!   handle any agent creation/removal messages, the main loop needs to have the latest version of
//!   agent state batches. Its loaded version, 1, is less than the persisted version, 2, so it loads
//!   the batch and sets the loaded version to the persisted version.
//!
//! * Behavior execution starts again. The main component of behavior execution writes behavior ids
//!   and sets the persisted version and its loaded version to 3.
//!
//! * The JavaScript component of behavior execution has loaded version 2, so it reloads the batch
//!   and sets its loaded version to 3. Then it runs behaviors, flushes data and sets the persisted
//!   version and its loaded version to 4.
//!
//! # Column-level metaversions
//!
//! Currently we only track batch-level metaversions, not column level metaversions.
//! There would be two things to keep in mind with column-level metaversions:
//!
//! 1. The metaversions would need to be near the start of the shared memory segment and not move
//! within it (or column/batch versions would be stored separately from memory versions). It helps
//! that there's a fixed number of columns in a batch.
//!
//! 2. If some engine component is loading a column by just storing its location in memory and
//! accessing it directly when necessary, then the loaded column can become invalid without being
//! written to, e.g. if it's forced to move in memory due to another (e.g. string) column becoming
//! larger. One possible solution is incrementing the batch version, but not the column version
//! when a column is moved, i.e. the batch version would be the dynamic metadata version and the
//! column version would be the data version. One would have to be careful then to check the batch
//! version before reloading any columns, though already loaded column data could still be used even
//! if the batch became outdated.
//!
//! If a simulation has e.g. a package `A` that only modifies column `a` and a package `B` that only
//! modifies column `b`, it's better for performance not to flush changes more/earlier than
//! necessary -- only when one needs to load the latest data or send it to a language runner.

use std::cmp::Ordering;

use crate::{
    error::{Error, Result},
    shared_memory::BufferChange,
};

/// Simple way for every component (language runners + main loop) using the datastore to track
/// whether it has to reload memory or reload the record batch.
#[must_use]
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct Metaversion {
    memory: u32,
    batch: u32,
}

impl Metaversion {
    pub fn new(memory: u32, batch: u32) -> Result<Self> {
        if batch < memory {
            // TODO: Actually this is true for *writing*, but not necessarily for *reading* -- if
            //       some other engine component updates both memory and batches, but this engine
            //       component only reads the memory that has been updated, ignoring the batch, then
            //       the read memory version can become greater than the read batch version.
            //   see https://app.asana.com/0/1199548034582004/1201976651517492/f
            Err(Error::from(
                "Batch is updated when memory is updated, so must have batch version >= memory \
                 version",
            ))
        } else {
            Ok(Self { memory, batch })
        }
    }

    pub fn from_le_bytes(b: [u8; 8]) -> Result<Self> {
        // Slicing gives wrong type
        let segment = u32::from_le_bytes([b[0], b[1], b[2], b[3]]);
        let batch = u32::from_le_bytes([b[4], b[5], b[6], b[7]]);
        Self::new(segment, batch)
    }

    pub fn to_le_bytes(self) -> [u8; 8] {
        let mut bytes = [0; 8];
        let memory_version = self.memory.to_le_bytes();
        let batch_version = self.batch.to_le_bytes();
        bytes[..memory_version.len()].copy_from_slice(&memory_version);
        bytes[memory_version.len()..].copy_from_slice(&batch_version);
        bytes
    }

    #[must_use]
    pub fn memory(&self) -> u32 {
        self.memory
    }

    #[must_use]
    pub fn batch(&self) -> u32 {
        self.batch
    }

    /// Assert invariants, given that `version` is a metaversion of *the same batch* as `self`.
    // TODO: Actually this only applies to persisted metaversions, because loaded metaversions can
    //       have memory versions newer than batch versions.
    fn verify(&self, version: Self) {
        if cfg!(debug_assertions) {
            assert!(self.batch >= self.memory, "Batch is older than the memory");
            assert!(
                version.batch >= version.memory,
                "Batch is older than the memory"
            );
            // `self` and `version` are metaversions of the same batch, so they can be linearly
            // ordered -- one must have been obtained by modifying the other some number of times
            // (possibly zero). Each modification increments the batch version and sometimes also
            // increments the memory version. Therefore, if the memory version changed, then the
            // batch version must have also changed at least once.
            match self.batch.cmp(&version.batch) {
                Ordering::Less => assert!(self.memory <= version.memory),
                Ordering::Equal => assert_eq!(self.memory, version.memory),
                Ordering::Greater => assert!(self.memory >= version.memory),
            }
            // This implies:
            // * If the memory is older, then the batch must also be older.
            // * If the memory is newer, then the batch must also be newer.
            // * If memory versions are equal, then batch versions can have any ordering.
        }
    }

    /// Return whether `self` is older than the given `version`.
    pub fn older_than(&self, version: Self) -> bool {
        self.verify(version);
        self.batch < version.batch // See `verify` for reasoning.
    }

    /// Return whether `self` is newer than the given `version`.
    pub fn newer_than(&self, version: Self) -> bool {
        self.verify(version);
        self.batch > version.batch // See `verify` for reasoning.
    }

    /// Update this version if the given version is newer.
    pub fn maybe_update(&mut self, version: Self) {
        self.verify(version);
        if version.batch > self.batch {
            self.batch = version.batch;
            self.memory = version.memory; // See `verify` for reasoning.
        }
    }

    /// Indicate that the shared memory segment and batch must be reloaded.
    pub fn increment(&mut self) {
        self.memory += 1;
        self.batch += 1;
    }

    /// Indicate that the batch must be reloaded.
    pub fn increment_batch(&mut self) {
        self.batch += 1;
    }

    /// Indicate what (if anything) needs to be reloaded based on how a buffer has changed in this
    /// shared memory segment.
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
