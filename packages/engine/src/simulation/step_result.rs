use super::{agent_control::AgentControl, step_output::SimulationStepOutput};
use crate::{hash_types::worker::RunnerError, proto::SimulationShortId};

pub struct SimulationStepResult {
    pub sim_id: SimulationShortId,
    pub output: SimulationStepOutput,
    pub errors: Vec<RunnerError>,
    pub warnings: Vec<RunnerError>,
    pub agent_control: AgentControl,
}
