use std::sync::Arc;

use crate::{agent::AgentSchema, context::ContextSchema, message::MessageSchema};

#[derive(Debug)]
pub struct Schema {
    pub agent_schema: Arc<AgentSchema>,
    pub message_schema: Arc<MessageSchema>,
    pub context_schema: Arc<ContextSchema>,
}
