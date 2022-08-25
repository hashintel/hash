//! Messages to send to and from [`Agent`]s.
//!
//! For a high-level concept of an messages, please see the [HASH documentation].
//!
//! This module contains [`Message`] and the accompanying API for handling messages sent from agents
//! to agents or from agents to the engine. Depending on the type of the message, [`Message`]
//! provides different variants, please see its documentation for more information.
//!
//! [`Message`]s are laid out in-memory in [`MessageBatch`]es according to the representation
//! defined by [`MessageSchema`]. Multiple [`MessageBatch`]es are collected in a
//! [`MessageBatchPool`] which is interacted with through the [`MessageLoader`] and
//! [`MessageReader`].
//!
//! [HASH documentation]: https://hash.ai/docs/simulation/creating-simulations/agent-messages
//! [`Agent`]: crate::agent::Agent

pub mod payload;

pub(crate) mod arrow;

mod batch;
mod kind;
mod loader;
mod map;
mod outbound;
mod pool;
mod schema;

pub use self::{
    batch::MessageBatch,
    loader::{MessageLoader, RawMessage},
    map::MessageMap,
    outbound::Message,
    pool::{MessageBatchPool, MessageReader},
    schema::MessageSchema,
};
pub(crate) use self::{
    kind::{CreateAgent, RemoveAgent, StopSim},
    outbound::Error as OutboundError,
};

/// Messages sent to this "agent" are handled internally in the engine (i.e. they are not sent to
/// another agent). Messages which can be sent to the engine include (amongst other things)
/// instructions to remove or create agents.
const SYSTEM_MESSAGE: &str = "hash";
