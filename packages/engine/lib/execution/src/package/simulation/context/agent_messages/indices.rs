use stateful::state::MessageReference;

#[derive(Debug)]
pub struct AgentMessageIndices {
    inner: Vec<MessageReference>,
}

impl AgentMessageIndices {
    pub fn new() -> AgentMessageIndices {
        AgentMessageIndices { inner: Vec::new() }
    }

    pub fn add(&mut self, refs: &[MessageReference]) {
        self.inner.extend_from_slice(refs);
    }

    pub fn num_messages(&self) -> usize {
        self.inner.len()
    }

    pub fn iter(&self) -> impl Iterator<Item = &MessageReference> {
        self.inner.iter()
    }
}
