use stateful::agent;

#[derive(Debug)]
pub struct AgentMessageIndices {
    inner: Vec<agent::MessageReference>,
}

impl AgentMessageIndices {
    pub fn new() -> AgentMessageIndices {
        AgentMessageIndices { inner: Vec::new() }
    }

    pub fn add(&mut self, refs: &[agent::MessageReference]) {
        self.inner.extend_from_slice(refs);
    }

    pub fn num_messages(&self) -> usize {
        self.inner.len()
    }

    pub fn iter(&self) -> impl Iterator<Item = &agent::MessageReference> {
        self.inner.iter()
    }
}
