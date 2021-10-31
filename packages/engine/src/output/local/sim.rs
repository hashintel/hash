use std::path::PathBuf;

use crate::proto::{ExperimentID, SimulationShortID};

use crate::error::Result;
use crate::{
    output::{buffer::Buffers, SimulationOutputPersistenceRepr},
    simulation::{packages::output::packages::Output, step_result::SimulationStepResult},
};

use super::config::LocalPersistenceConfig;
use super::result::LocalPersistenceResult;

#[derive(new)]
pub struct LocalSimulationOutputPersistence {
    exp_id: ExperimentID,
    sim_id: SimulationShortID,
    buffers: Buffers,
    config: LocalPersistenceConfig,
}

#[async_trait::async_trait]
impl SimulationOutputPersistenceRepr for LocalSimulationOutputPersistence {
    type OutputPersistenceResult = LocalPersistenceResult;

    async fn add_step_output(&mut self, output: SimulationStepResult) -> Result<()> {
        output.package_outputs.into_iter().try_for_each(|output| {
            match output {
                Output::AnalysisOutput(output) => {
                    self.buffers.analysis.add(output)?;
                }
                Output::JSONStateOutput(output) => {
                    self.buffers.json_state.append_step(output.inner)?;
                }
                _ => {}
            }
            Ok(())
        })?;
        Ok(())
    }

    async fn finalize(mut self) -> Result<Self::OutputPersistenceResult> {
        // JSON state
        self.buffers.json_state.persist_current_on_disk()?;
        let mut path = self.config.output_folder.clone();
        path.extend(["/", &self.exp_id]);
        std::fs::create_dir(path)?;
        self.buffers.json_state.parts.iter().try_for_each(|v| {
            let mut new = path.clone();
            new.push(v.file_name());
            std::fs::copy(v, new)?;
            Ok(())
        })?;

        // Analysis
        let analysis_path = path.join("analysis_outputs.json".into());
        std::fs::File::create(&analysis_path)?;
        std::fs::write(
            &analysis_path,
            serde_json::to_string(&self.buffers.analysis)?,
        )?;

        Ok(LocalPersistenceResult::new(
            path.canonicalize()?.to_string_lossy().to_string(),
        ))
    }
}
