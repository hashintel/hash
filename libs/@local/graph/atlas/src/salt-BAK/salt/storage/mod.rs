//! Revision-bound storage contracts and merged base-plus-delta reads.
//!
//! Storage backends expose immutable base data and append-only delta revisions
//! through the same read model. [`read::DisabledMergedReader`] pairs
//! [`BaseRevision`] zero with an empty [`DeltaRevision`] and refuses mutation.
//!
//! [`BaseRevision`]: crate::salt::revision::BaseRevision
//! [`DeltaRevision`]: crate::salt::revision::DeltaRevision

pub(crate) mod mmap;
pub(crate) mod read;
