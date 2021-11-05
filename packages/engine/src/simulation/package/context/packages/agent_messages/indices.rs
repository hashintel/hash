use crate::datastore::table::references::AgentMessageReference;

#[derive(Debug)]
pub struct AgentMessageIndices {
    inner: Vec<AgentMessageReference>,
}

impl AgentMessageIndices {
    pub fn new() -> AgentMessageIndices {
        AgentMessageIndices { inner: Vec::new() }
    }

    pub fn add(&mut self, refs: &[AgentMessageReference]) {
        self.inner.extend_from_slice(refs);
    }

    pub fn num_messages(&self) -> usize {
        self.inner.len()
    }

    pub fn iter(&self) -> impl Iterator<Item = &AgentMessageReference> {
        self.inner.iter()
    }
}
