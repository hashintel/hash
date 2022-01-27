use crate::simulation::command::StopMessage;
#[derive(Debug)]
pub enum AgentControl {
    Continue,
    Stop(Vec<StopMessage>),
}

impl Default for AgentControl {
    fn default() -> AgentControl {
        AgentControl::Continue
    }
}
