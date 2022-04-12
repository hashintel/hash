// TODO: DOC: Add module level docs for describing the high level concepts agent messages

pub mod payload;

pub(crate) mod arrow;

mod batch;
mod kind;
mod map;
mod outbound;
mod pool;
mod schema;

pub use self::{
    batch::MessageBatch,
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
