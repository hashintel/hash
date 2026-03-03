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
    /// Built-in dictionary insert operation (immutable).
    ///
    /// This operation inserts a key-value pair into a dictionary,
    /// returning a new dictionary with the added pair. The original
    /// dictionary remains unchanged.
    pub const DICT_INSERT: Self = Self::new(0xFFFF_FE00);
    /// Built-in dictionary insert operation (mutable).
    ///
    /// This operation inserts a key-value pair into a dictionary in-place,
    /// modifying the original dictionary. Used for efficient dictionary
    /// construction and updates.
    pub const DICT_INSERT_MUT: Self = Self::new(0xFFFF_FE01);
    /// Built-in dictionary remove operation (immutable).
    ///
    /// This operation removes a key-value pair from a dictionary,
    /// returning a new dictionary without the specified key. The
    /// original dictionary remains unchanged.
    pub const DICT_REMOVE: Self = Self::new(0xFFFF_FE02);
    /// Built-in dictionary remove operation (mutable).
    ///
    /// This operation removes a key-value pair from a dictionary in-place,
    /// modifying the original dictionary and returning the removed value
    /// if the key existed.
    pub const DICT_REMOVE_MUT: Self = Self::new(0xFFFF_FE03);
    /// Built-in list pop operation (immutable).
    ///
    /// This operation removes the last element from a list, returning
    /// both the element and a new list without the element. The original
    /// list remains unchanged.
    pub const LIST_POP: Self = Self::new(0xFFFF_FE04);
    /// Built-in list pop operation (mutable).
    ///
    /// This operation removes the last element from a list in-place,
    /// returning the removed element while modifying the original list.
    pub const LIST_POP_MUT: Self = Self::new(0xFFFF_FE05);
    /// Built-in list push operation (immutable).
    ///
    /// This operation appends an element to a list, returning a new list
    /// without modifying the original. Used for functional-style list
    /// manipulation where immutability is preferred.
    pub const LIST_PUSH: Self = Self::new(0xFFFF_FE06);
    /// Built-in list push operation (mutable).
    ///
    /// This operation appends an element to a list in-place, modifying
    /// the original list. Used for imperative-style list manipulation
    /// where performance is critical.
    pub const LIST_PUSH_MUT: Self = Self::new(0xFFFF_FE07);
    pub const PLACEHOLDER: Self = Self::MAX;
}
