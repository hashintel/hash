use std::{fmt, path::Path};

use uuid::Uuid;

/// An identifier for a shared memory [`super::Segment`].
///
/// Holds a UUID and a random suffix. The UUID can be reused for different [`super::Segment`]s and
/// can all be cleaned up by calling [`super::cleanup_by_base_id`].
#[derive(Debug, PartialEq, Eq)]
pub struct MemoryId {
    id: Uuid,
    suffix: u16,
}

impl MemoryId {
    /// Creates a new identifier from the provided [`Uuid`].
    ///
    /// This will generate a suffix and ensures, that the shared memory segment does not already
    /// exists at */dev/shm/*.
    pub fn new(id: Uuid) -> Self {
        loop {
            let memory_id = Self {
                id,
                suffix: rand::random::<u16>(),
            };
            if !Path::new(&format!("/dev/shm/{memory_id}")).exists() {
                return memory_id;
            }
        }
    }

    /// Returns the base id used to create this `MemoryId`.
    pub fn base_id(&self) -> Uuid {
        self.id
    }

    /// Returns the prefix used for the identifier.
    pub(crate) fn prefix(id: Uuid) -> String {
        if cfg!(target_os = "macos") {
            // We need to_string otherwise it's not truncated when formatting
            let id = id.as_simple().to_string();
            // MacOS shmem seems to be limited to 31 chars, probably remnants of HFS
            format!("shm_{id:.20}")
        } else {
            let id = id.as_simple();
            format!("shm_{id}")
        }
    }
}

impl fmt::Display for MemoryId {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        let prefix = Self::prefix(self.base_id());
        if cfg!(target_os = "macos") {
            // MacOS shmem seems to be limited to 31 chars, probably remnants of HFS
            write!(fmt, "{}_{:.7}", prefix, self.suffix)
        } else {
            write!(fmt, "{}_{}", prefix, self.suffix)
        }
    }
}
