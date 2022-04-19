/// A record pointing to a specific agent inside of an [`AgentPool`].
#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct AgentIndex {
    /// Index of the [`AgentBatch`] inside of a [`AgentPool`]
    pub group_index: u32,
    /// Index of the agent inside of an [`AgentBatch`]
    pub agent_index: u32,
}

/// A reference to a [`Message`] by an [`Agent`] and the [`MessageBatch`] inside of a
/// [`MessagePool`].
///
/// [`Agent`]: crate::agent::Agent
/// [`Message`]: crate::message::Message
/// [`MessageBatch`]: crate::message::MessageBatch
/// [`MessagePool`]: crate::message::MessagePool
#[derive(Clone, Debug)]
pub struct MessageReference {
    pub batch_index: usize,
    pub agent_index: usize,
    pub message_index: usize,
}

impl MessageReference {
    pub fn new(batch_index: usize, agent_index: usize, message_index: usize) -> Self {
        Self {
            batch_index,
            agent_index,
            message_index,
        }
    }
}
