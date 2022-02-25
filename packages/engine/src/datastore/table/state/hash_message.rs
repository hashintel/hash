use crate::hash_types::Agent;

// TODO: unused?
pub enum RemoveTarget<'a> {
    Index(usize, usize),
    AgentId(&'a [u8]),
}

// TODO: unused?
pub enum HashMessage<'a> {
    Create(Agent),
    Remove(RemoveTarget<'a>),
}
