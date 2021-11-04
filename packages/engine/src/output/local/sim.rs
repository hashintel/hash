use crate::proto::{ExperimentID, SimulationShortID};

use crate::output::error::{Error, Result};
use crate::simulation::step_output::SimulationStepOutput;
use crate::{
    output::{buffer::Buffers, SimulationOutputPersistenceRepr},
    simulation::packages::output::packages::Output,
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

    async fn add_step_output(&mut self, output: SimulationStepOutput) -> Result<()> {
        output.0.into_iter().try_for_each(|output| {
            match output {
                Output::AnalysisOutput(output) => {
                    self.buffers.analysis.add(output)?;
                }
                Output::JSONStateOutput(output) => {
                    self.buffers.json_state.append_step(output.inner)?;
                }
                _ => {}
            }
            Ok(()) as Result<()>
        })?;
        Ok(())
    }

    async fn finalize(mut self) -> Result<Self::OutputPersistenceResult> {
        // JSON state
        self.buffers.json_state.persist_current_on_disk()?;
        let mut path = self.config.output_folder.clone();
        path.extend(["/", &self.exp_id]);
        std::fs::create_dir(path)?;
        self.buffers
            .json_state
            .parts
            .iter()
            .try_for_each(|v| -> Result<()> {
                let mut new = path.clone();
                new.push(
                    v.file_name()
                        .ok_or(Error::from("Missing file name in output parts"))?,
                );
                std::fs::copy(v, new)?;
                Ok(())
            })?;

        // Analysis
        let analysis_path = path.join("analysis_outputs.json");
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
