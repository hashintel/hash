pub mod update;

use simulation_structure::SimulationShortId;

#[derive(Debug)]
pub enum ExperimentControl {
    StartSim {
        sim_id: SimulationShortId,
        changed_globals: serde_json::Value,
        max_num_steps: usize,
        span_id: Option<tracing::span::Id>,
    },
    // TODO: add span_ids
    PauseSim(SimulationShortId),
    ResumeSim(SimulationShortId),
    StopSim(SimulationShortId),
}
