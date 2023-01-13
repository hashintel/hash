use crate::command::StopCommand;
#[derive(Debug)]
pub enum AgentControl {
    Continue,
    Stop(Vec<StopCommand>),
}

impl Default for AgentControl {
    fn default() -> AgentControl {
        AgentControl::Continue
    }
}
