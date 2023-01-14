use stateful::agent::Agent;
use thiserror::Error as ThisError;

pub type Result<T, E = Error> = std::result::Result<T, E>;

#[allow(clippy::large_enum_variant)]
#[derive(ThisError, Debug)]
pub enum Error {
    #[error("{0}")]
    Unique(String),

    #[error("Memory error: {0}")]
    Memory(#[from] memory::Error),

    #[error("Stateful error: {0}")]
    Stateful(#[from] stateful::Error),

    #[error("Serde Error: {0}")]
    Serde(#[from] serde_json::Error),

    #[cfg(test)]
    #[error("Arrow Error: {0}")]
    Arrow(#[from] arrow2::error::Error),

    #[cfg(test)]
    #[error("Invalid utf-8: {0}")]
    FromUtf8Error(#[from] std::string::FromUtf8Error),

    #[error("Expected Node Metadata")]
    NodeMetadataExpected,

    #[error("Expected Buffer Metadata")]
    BufferMetadataExpected,

    #[error("Expected Shift Action Vector to be non-empty")]
    EmptyShiftActionVector,

    #[error("Unexpected undefined command")]
    UnexpectedUndefinedCommand,

    #[error(
        "Received an incorrect `remove_agent` message: {0}. Valid examples: 1) {{\"agent_id\": \
         \"b2387514-e76a-4695-9831-8d9ac6254468\"}}, 2) None/null 3) {{}}, 4) \"\""
    )]
    RemoveAgentMessage(String),

    #[error(
        "Error parsing `create_agent` message payload, expected valid agent state, got error: \
         {0:?}. Payload was: {1:?}"
    )]
    CreateAgentPayload(serde_json::error::Error, String),

    #[error(
        "`create_agent` message has field \"{0}\" without respective field existing\nDetails: \
         {1:?}"
    )]
    CreateAgentField(String, Agent),

    #[error("Unexpected message to hash with type {message_type}")]
    UnexpectedSystemMessage { message_type: String },
}

impl From<&str> for Error {
    fn from(s: &str) -> Self {
        Error::Unique(s.to_string())
    }
}

impl From<String> for Error {
    fn from(s: String) -> Self {
        Error::Unique(s)
    }
}
