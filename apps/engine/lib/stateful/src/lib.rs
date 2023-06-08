//! # Data structures and access patterns used in [hEngine]
//!
//! For details on the topics please see the corresponding module level documentation and refer to
//! the [HASH documentation] for a high level overview over the different concepts.
//!
//! ## Data structures
//!
//! The data used in the **A**gent-**B**ase **M**odel in [hEngine] are defined in modules in this
//! crate. [`agent`]s, the hearth of every **ABM** are defined in its corresponding module. They may
//! have outbound [`message`]s associated, which are stored together with the [`agent`]s in a
//! [`state`]. The [`context`] provides [`global`] access to common functionality.
//!
//! ## Data layout
//!
//! Internally, most data structures are stored inside of shared memory defined in the [`memory`]
//! crate. The memory format is defined in the corresponding modules (e.g. [`agent::AgentSchema`])
//! and the internal representation is mostly encapsulated. The [`field`] module provides a
//! specification to define exact memory layout.
//!
//! ## Data access
//!
//! As most data lies in shared memory in a specific format and the data is expected to be shared
//! across multiple threads, immutably and mutably, [`proxy`] provides an access pattern, which is
//! based on a read-write-lock but abstracts away the lifetime.
//!
//! [hEngine]: https://hash.ai/platform/engine
//! [HASH documentation]: https://hash.ai/docs/simulation/creating-simulations/agent-based-modeling-basics-1

pub mod agent;
pub mod context;
pub mod field;
pub mod global;
pub mod message;
pub mod proxy;
pub mod state;

mod error;
mod vec;

pub use self::{
    error::{Error, Result},
    vec::Vec3,
};
