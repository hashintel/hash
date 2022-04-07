pub mod payload;

mod kind;
mod outbound;
mod schema;

pub(in crate) use self::outbound::Error as OutboundError;
pub use self::{
    kind::{CreateAgent, RemoveAgent, StopSim},
    outbound::Outbound,
    schema::{MessageSchema, MESSAGE_ARROW_FIELDS, MESSAGE_BATCH_SCHEMA, MESSAGE_COLUMN_NAME},
};

// System-message recipient
const SYSTEM_MESSAGE: &str = "hash";
