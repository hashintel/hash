use execution::{
    package::simulation::{output::Output, SimulationId},
    runner::RunnerError,
};

use crate::agent_control::AgentControl;

pub struct SimulationStepResult {
    // TODO: UNUSED: Needs triage
    pub sim_id: SimulationId,
    pub output: Vec<Output>,
    // TODO: UNUSED: Needs triage
    pub errors: Vec<RunnerError>,
    // TODO: UNUSED: Needs triage
    pub warnings: Vec<RunnerError>,
    pub agent_control: AgentControl,
}
