#[derive(Debug)]
pub enum AgentControl {
    Continue,
    Stop(serde_json::Value),
}

impl Default for AgentControl {
    fn default() -> AgentControl {
        AgentControl::Continue
    }
}
