//! Structures for representing an `Agent`.
//!
//! For a high-level concept of an agent, please see the [HASH documentation].
//!
//! The main struct in this module is [`Agent`]. It contains all agent fields as an accessible
//! struct. Its fields are represented by [`AgentStateField`], which is based on the [`field`] API.
//! A group of [`Agent`]s has an in-memory representation defined by [`AgentSchema`] and can be used
//! by [`AgentBatch`] or, in case of multiple groups of [`Agent`]s, [`AgentBatchPool`]. To convert
//! an [`AgentBatch`] to [`Vec`]`<`[`Agent`]`>`, the [`IntoAgents`] trait is used.
//!
//! [HASH documentation]: https://hash.ai/docs/simulation/creating-simulations/anatomy-of-an-agent
//! [`field`]: crate::field

mod field;
mod into_agent;
mod name;
mod required;
mod schema;

// TODO: Make private to crate as we don't want to expose low-level functions
pub mod arrow;

pub use self::{
    arrow::{AgentBatch, AgentBatchPool},
    field::{Agent, AgentId, AgentStateField},
    into_agent::IntoAgents,
    name::AgentName,
    schema::AgentSchema,
};
pub(crate) use self::{field::BUILTIN_FIELDS, required::IsRequired};
