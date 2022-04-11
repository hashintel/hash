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
