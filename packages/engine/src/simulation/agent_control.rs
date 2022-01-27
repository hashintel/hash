use crate::simulation::command::StopMessage;
#[derive(Debug)]
pub enum AgentControl {
    Continue,
    Stop(StopMessage),
}

impl Default for AgentControl {
    fn default() -> AgentControl {
        AgentControl::Continue
    }
}
