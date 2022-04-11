// TODO: DOC: Add module level docs for describing the high level concepts agent messages

pub mod payload;

//temporarily public
pub mod arrow;

mod batch;
mod inbound;
mod kind;
mod outbound;
mod pool;
mod schema;

pub(in crate) use self::outbound::Error as OutboundError;
pub use self::{
    batch::MessageBatch,
    inbound::Inbound,
    kind::{CreateAgent, RemoveAgent, StopSim},
    outbound::Message,
    pool::{recipient_iter_all, MessagePool, MessageReader},
    schema::MessageSchema,
};

// System-message recipient
const SYSTEM_MESSAGE: &str = "hash";
