use std::io::{BufReader, BufWriter};

use crate::{
    config::SimRunConfig,
    output::{
        buffer::Buffers,
        error::Result,
        local::{config::LocalPersistenceConfig, result::LocalPersistenceResult},
        SimulationOutputPersistenceRepr,
    },
    proto::{ExperimentId, ExperimentName, SimulationShortId},
    simulation::{package::output::packages::Output, step_output::SimulationStepOutput},
};

#[derive(derive_new::new)]
pub struct LocalSimulationOutputPersistence {
    project_name: String,
    experiment_name: ExperimentName,
    experiment_id: ExperimentId,
    sim_id: SimulationShortId,
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

    async fn finalize(mut self, config: &SimRunConfig) -> Result<Self::OutputPersistenceResult> {
        tracing::trace!("Finalizing output");
        // JSON state
        let (_, parts) = self.buffers.json_state.finalize()?;
        let path = self
            .config
            .output_folder
            .join(&self.project_name)
            .join(self.experiment_name.as_str())
            .join(self.experiment_id.to_string())
            .join(self.sim_id.to_string());

        tracing::info!("Making new output directory: {:?}", path);
        std::fs::create_dir_all(&path)?;

        let json_state_path = path.join("json_state.json");
        std::fs::File::create(&json_state_path)?;

        let file_out = std::fs::OpenOptions::new()
            .append(true)
            .open(json_state_path)?;

        let mut buf_writer = BufWriter::new(file_out);

        parts.into_iter().try_for_each(|v| -> Result<()> {
            let file_in = std::fs::File::open(v)?;
            let mut buf_reader = BufReader::new(file_in);
            std::io::copy(&mut buf_reader, &mut buf_writer)?;
            Ok(())
        })?;

        // Analysis
        let analysis_path = path.join("analysis_outputs.json");
        std::fs::File::create(&analysis_path)?;
        std::fs::write(
            &analysis_path,
            serde_json::to_string(&self.buffers.analysis)?,
        )?;

        // Globals
        let globals_path = path.join("globals.json");
        std::fs::File::create(&globals_path)?;
        std::fs::write(&globals_path, serde_json::to_string(&config.sim.globals)?)?;

        Ok(LocalPersistenceResult::new(
            path.canonicalize()?.to_string_lossy().to_string(),
        ))
    }
}
