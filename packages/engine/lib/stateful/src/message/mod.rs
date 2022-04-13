//! Messages to send to and from [`Agent`]s.
//!
//! For a high-level concept of an messages, please see the [HASH documentation]
//!
//! The main structure in this module is [`Message`]. It's providing for different variants,
//! depending on the type of the message.
//!
//! A group of [`Message`]s has an in-memory representation defined by [`MessageSchema`] and can be
//! used by [`MessageBatch`] or, in case of multiple groups of [`Message`]s, [`MessagePool`]. To
//! read a group of messages, the [`MessageLoader`] and [`MessageReader`] is used.
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
    pool::{MessagePool, MessageReader},
    schema::MessageSchema,
};
pub(in crate) use self::{
    kind::{CreateAgent, RemoveAgent, StopSim},
    outbound::Error as OutboundError,
};

// System-message recipient
const SYSTEM_MESSAGE: &str = "hash";
