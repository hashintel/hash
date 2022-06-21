use simulation_structure::{ExperimentId, SimulationShortId};

use crate::{
    package::simulation::{
        output::{analysis::AnalysisBuffer, OutputPartBuffer},
        OutputPackagesSimConfig,
    },
    Result,
};

pub struct OutputBuffers {
    pub json_state: OutputPartBuffer,
    pub analysis: AnalysisBuffer,
}

impl OutputBuffers {
    pub fn new(
        exp_id: &ExperimentId,
        sim_id: SimulationShortId,
        output_packages_sim_config: &OutputPackagesSimConfig,
    ) -> Result<OutputBuffers> {
        Ok(OutputBuffers {
            // TODO: This should be dynamically created by the output packages
            json_state: OutputPartBuffer::new("json_state", exp_id, sim_id)?,
            analysis: AnalysisBuffer::new(output_packages_sim_config)?,
        })
    }
}
