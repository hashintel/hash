use core::fmt;

use serde::{Deserialize, Serialize};
use stateful::agent::Agent;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum JsPyInitTaskMessage {
    Start(StartMessage),
    Success(SuccessMessage),
    Failed(FailedMessage),
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct StartMessage {
    pub initial_state_source: String,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct SuccessMessage {
    pub agents: Vec<Agent>,
}

impl fmt::Debug for SuccessMessage {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("SuccessMessage")
            .field("agents", &{
                if !self.agents.is_empty() {
                    format_args!("[...]") // The Agents JSON can result in huge log lines otherwise
                } else {
                    format_args!("[]")
                }
            })
            .finish()
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct FailedMessage {}
