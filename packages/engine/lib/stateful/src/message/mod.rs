//! Messages to send to and from [`Agent`]s.
//!
//! For a high-level concept of an messages, please see the [HASH documentation].
//!
//! It contains [`Message`] and accompanying API for sending messages from agents to agents or from
//! agents to the engine. Depending on the type of the message, [`Message`] provides different
//! variants, please see it's documentation for more information.
//!
//! To store multiple [`Message`]s, an in-memory representation is defined by [`MessageSchema`] and
//! can be used by [`MessageBatch`] or, in case of multiple batches, [`MessagePool`].
//! To read those, the [`MessageLoader`] and [`MessageReader`] is used.
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
