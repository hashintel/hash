//! Definition identifier representation for HashQL MIR.
//!
//! This module provides unique identifiers for definitions that have associated
//! MIR bodies, including user-defined functions, closures, constants, and
//! built-in operations that require MIR representation.

use hashql_core::id::{self, Id as _};

id::newtype!(
    /// A unique identifier for definitions that have a body associated with them in the HashQL MIR.
    ///
    /// Definition IDs serve as stable references to callable entities within the HashQL
    /// system, including user-defined functions, closures, constants, intrinsics, and
    /// built-in operations that require MIR representation.
    ///
    /// # Value Space Organization
    ///
    /// The identifier space is organized as follows:
    /// - **`0..=0xFFFF_FD00`**: User-defined definitions (functions, closures, etc.)
    /// - **`0xFFFF_FE00..=0xFFFF_FEFF`**: Built-in operations and intrinsics
    /// - **`0xFFFF_FF00..=0xFFFF_FFFF`**: Reserved for niche optimizations
    pub struct DefId(u32 is 0..=0xFFFF_FF00)
);

id::newtype_collections!(pub type DefId* from DefId);

impl DefId {
    pub const PLACEHOLDER: Self = Self::MAX;
}
