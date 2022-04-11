// TODO: DOC: Add module level docs for describing the high level concepts agent messages

pub mod payload;

//temporarily public
pub mod arrow;

mod inbound;
mod kind;
mod outbound;
mod schema;

pub(in crate) use self::outbound::Error as OutboundError;
pub use self::{
    inbound::Inbound,
    kind::{CreateAgent, RemoveAgent, StopSim},
    outbound::Message,
    schema::{MessageSchema, MESSAGE_ARROW_FIELDS, MESSAGE_BATCH_SCHEMA, MESSAGE_COLUMN_NAME},
};

// System-message recipient
const SYSTEM_MESSAGE: &str = "hash";
