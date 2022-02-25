use super::{agent_control::AgentControl, step_output::SimulationStepOutput};
use crate::{hash_types::worker::RunnerError, proto::SimulationShortId};

pub struct SimulationStepResult {
    pub sim_id: SimulationShortId, // TODO: unused?
    pub output: SimulationStepOutput,
    pub errors: Vec<RunnerError>, // TODO: unused?
    pub warnings: Vec<RunnerError>, // TODO: unused?
    pub agent_control: AgentControl,
}
