mod part;

use execution::package::simulation::{output::analysis::AnalysisBuffer, OutputPackagesSimConfig};
use simulation_structure::{ExperimentId, SimulationShortId};

pub use self::part::{remove_experiment_parts, OutputPartBuffer};
use crate::output::error::Result;

// TODO: We might want to use a temporary folder (like "/tmp" or "/var/tmp") instead.
const RELATIVE_PARTS_FOLDER: &str = "./parts";

pub struct Buffers {
    pub json_state: OutputPartBuffer,
    pub analysis: AnalysisBuffer,
}

impl Buffers {
    pub(crate) fn new(
        exp_id: &ExperimentId,
        sim_id: SimulationShortId,
        output_packages_sim_config: &OutputPackagesSimConfig,
    ) -> Result<Buffers> {
        Ok(Buffers {
            // TODO: This should be dynamically created by the output packages
            json_state: OutputPartBuffer::new("json_state", exp_id, sim_id)?,
            analysis: AnalysisBuffer::new(output_packages_sim_config)?,
        })
    }
}
