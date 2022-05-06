pub(crate) mod control;
pub(crate) mod update;

use simulation_structure::SimulationShortId;

pub use self::{control::ExpPkgCtlRecv, update::ExpPkgUpdateSend};

#[derive(Debug)]
#[allow(clippy::enum_variant_names)]
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

pub struct ExperimentPackageComms {
    pub step_update_sender: ExpPkgUpdateSend,
    pub ctl_recv: ExpPkgCtlRecv,
}

#[derive(Debug)]
pub struct StepUpdate {
    pub sim_id: SimulationShortId,
    pub was_error: bool,
    pub stop_signal: bool,
}
