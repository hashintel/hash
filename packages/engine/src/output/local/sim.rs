use super::{config::LocalPersistenceConfig, result::LocalPersistenceResult};
use crate::{
    output::{
        buffer::Buffers,
        error::{Error, Result},
        SimulationOutputPersistenceRepr,
    },
    proto::{ExperimentId, SimulationShortId},
    simulation::{package::output::packages::Output, step_output::SimulationStepOutput},
};

#[derive(derive_new::new)]
pub struct LocalSimulationOutputPersistence {
    exp_id: ExperimentId,
    _sim_id: SimulationShortId,
    // TODO: Should this be unused? If so remove
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
                Output::JsonStateOutput(output) => {
                    self.buffers.json_state.append_step(output.inner)?;
                }
            }
            Ok(()) as Result<()>
        })?;
        Ok(())
    }

    async fn finalize(mut self) -> Result<Self::OutputPersistenceResult> {
        log::trace!("Finalizing output");
        // JSON state
        let (_, parts) = self.buffers.json_state.finalize()?;
        let mut path = self.config.output_folder.clone();

        path.join(&self.exp_id);

        log::trace!("Making new output directory directory: {:?}", path);
        std::fs::create_dir(&path)?;

        parts.into_iter().try_for_each(|v| -> Result<()> {
            let mut new = path.clone();
            new.push(
                v.file_name()
                    .ok_or_else(|| Error::from("Missing file name in output parts"))?,
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
