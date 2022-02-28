use crate::hash_types::Agent;

// TODO: UNUSED: Needs triage
pub enum RemoveTarget<'a> {
    Index(usize, usize),
    AgentId(&'a [u8]),
}

// TODO: UNUSED: Needs triage
pub enum HashMessage<'a> {
    Create(Agent),
    Remove(RemoveTarget<'a>),
}
