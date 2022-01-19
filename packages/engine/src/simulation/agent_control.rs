#[derive(Debug)]
pub enum AgentControl {
    Continue,
    Stop(serde_json::Value),
}

impl Default for AgentControl {
    #[tracing::instrument(skip_all)]
    fn default() -> AgentControl {
        AgentControl::Continue
    }
}
