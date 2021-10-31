use crate::hash_types::worker::RunnerError;
use crate::proto::SimulationShortID;

use super::{agent_control::AgentControl, step_output::SimulationStepOutput};

pub struct SimulationStepResult {
    pub sim_id: SimulationShortID,
    pub output: SimulationStepOutput,
    pub errors: Vec<RunnerError>,
    pub warnings: Vec<RunnerError>,
    pub agent_control: AgentControl,
    // True if this output signals the stopping of a simulation.
    // Can be False even if a stop signal was sent out before
    // for this simulation run.
    pub stop_signal: bool,
}
