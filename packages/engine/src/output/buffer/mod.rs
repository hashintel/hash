use std::{collections::HashMap, sync::Arc};

mod part;
mod util;

use execution::package::{output::OutputPackageName, PackageName};
use serde::Serialize;

pub use self::{
    part::OutputPartBuffer,
    util::{cleanup_experiment, EngineExitStatus},
};
use crate::{
    output::error::{Error, Result},
    proto::{ExperimentId, SimulationShortId},
    simulation::package::{
        output,
        output::packages::{
            analysis::{AnalysisOutput, AnalysisSingleOutput},
            OutputPackagesSimConfig,
        },
    },
};

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

// TODO: These should live in the respective output package really
#[derive(Serialize)]
pub struct AnalysisBuffer {
    pub manifest: String,
    pub buffers: HashMap<Arc<String>, Vec<AnalysisSingleOutput>>,
}

impl AnalysisBuffer {
    pub fn new(output_packages_config: &OutputPackagesSimConfig) -> Result<AnalysisBuffer> {
        let value = output_packages_config
            .map
            .get(&PackageName::Output(OutputPackageName::Analysis))
            .ok_or_else(|| Error::from("Missing analysis config"))?;
        let config: output::packages::analysis::AnalysisOutputConfig =
            serde_json::from_value(value.clone())?;
        let buffer = AnalysisBuffer {
            manifest: config.manifest.clone(),
            buffers: config.outputs.keys().map(|v| (v.clone(), vec![])).collect(),
        };
        Ok(buffer)
    }

    pub fn add(&mut self, output: AnalysisOutput) -> Result<()> {
        output.inner.into_iter().try_for_each(|(name, output)| {
            self.buffers
                .get_mut(&name)
                .ok_or_else(|| {
                    Error::from(format!("Missing output buffer when persisting: {}", &name))
                })?
                .push(output);

            Ok(())
        })
    }
}
