mod outbound;
mod payload;
mod schema;

pub(in crate) use self::outbound::Error as OutboundError;
pub use self::{
    outbound::Outbound,
    payload::{
        CreateAgent, GenericPayload, OutboundCreateAgentPayload, OutboundRemoveAgentPayload,
        OutboundStopSimPayload, RemoveAgent, RemoveAgentPayload, StopSim,
    },
    schema::{MessageSchema, MESSAGE_ARROW_FIELDS, MESSAGE_BATCH_SCHEMA, MESSAGE_COLUMN_NAME},
};

// Built in message types:
pub const CREATE_AGENT: &str = OutboundCreateAgentPayload::KIND;
pub const REMOVE_AGENT: &str = OutboundRemoveAgentPayload::KIND;
pub const STOP_SIM: &str = OutboundStopSimPayload::KIND;

// System-message recipient
pub const SYSTEM_MESSAGE: &str = "hash";
