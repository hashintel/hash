use crate::hash_types::Agent;

pub enum RemoveTarget<'a> {
    Index(usize, usize),
    AgentId(&'a [u8]),
}

pub enum HashMessage<'a> {
    Create(Agent),
    Remove(RemoveTarget<'a>),
}
