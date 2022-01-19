use crate::datastore::table::references::AgentMessageReference;

#[derive(Debug)]
pub struct AgentMessageIndices {
    inner: Vec<AgentMessageReference>,
}

impl AgentMessageIndices {
    #[tracing::instrument(skip_all)]
    pub fn new() -> AgentMessageIndices {
        AgentMessageIndices { inner: Vec::new() }
    }

    #[tracing::instrument(skip_all)]
    pub fn add(&mut self, refs: &[AgentMessageReference]) {
        self.inner.extend_from_slice(refs);
    }

    #[tracing::instrument(skip_all)]
    pub fn num_messages(&self) -> usize {
        self.inner.len()
    }

    #[tracing::instrument(skip_all)]
    pub fn iter(&self) -> impl Iterator<Item = &AgentMessageReference> {
        self.inner.iter()
    }
}
