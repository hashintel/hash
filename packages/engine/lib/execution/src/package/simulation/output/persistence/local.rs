use std::{
    io::{BufReader, BufWriter},
    path::PathBuf,
};

use serde::{Deserialize, Serialize};
use stateful::global::Globals;

use crate::{
    package::{
        experiment::{ExperimentId, ExperimentName},
        simulation::{
            output::{
                persistence::{
                    OutputPersistenceCreator, OutputPersistenceResult, SimulationOutputPersistence,
                },
                Output, OutputBuffers,
            },
            PersistenceConfig, SimulationId,
        },
    },
    Result,
};

#[derive(Serialize)]
pub struct LocalPersistenceResult {
    pub persistence_path: String,
}

impl OutputPersistenceResult for LocalPersistenceResult {
    fn into_value(self) -> Result<(&'static str, serde_json::Value)> {
        Ok(("local", serde_json::Value::String(self.persistence_path)))
    }
}

pub struct LocalSimulationOutputPersistence {
    pub project_name: String,
    pub experiment_name: ExperimentName,
    pub experiment_id: ExperimentId,
    pub sim_id: SimulationId,
    pub buffers: OutputBuffers,
    pub config: LocalPersistenceConfig,
}

#[async_trait::async_trait]
impl SimulationOutputPersistence for LocalSimulationOutputPersistence {
    type OutputPersistenceResult = LocalPersistenceResult;

    async fn add_step_output(&mut self, output: Vec<Output>) -> Result<()> {
        output.into_iter().try_for_each(|output| {
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

    async fn finalize(mut self, globals: &Globals) -> Result<Self::OutputPersistenceResult> {
        tracing::trace!("Finalizing output");
        // JSON state
        let parts = self.buffers.json_state.finalize()?;
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

        parts.iter().try_for_each(|v| -> Result<()> {
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
        std::fs::write(&globals_path, serde_json::to_string(globals)?)?;

        Ok(LocalPersistenceResult {
            persistence_path: path.canonicalize()?.to_string_lossy().to_string(),
        })
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocalPersistenceConfig {
    pub output_folder: PathBuf,
}

pub struct LocalOutputPersistence {
    pub project_name: String,
    pub experiment_name: ExperimentName,
    pub experiment_id: ExperimentId,
    pub config: LocalPersistenceConfig,
}

impl OutputPersistenceCreator for LocalOutputPersistence {
    type SimulationOutputPersistence = LocalSimulationOutputPersistence;

    fn new_simulation(
        &self,
        sim_id: SimulationId,
        persistence_config: &PersistenceConfig,
    ) -> Result<Self::SimulationOutputPersistence> {
        let buffers = OutputBuffers::new(
            &self.experiment_id,
            sim_id,
            &persistence_config.output_config,
        )?;
        Ok(LocalSimulationOutputPersistence {
            project_name: self.project_name.clone(),
            experiment_name: self.experiment_name.clone(),
            experiment_id: self.experiment_id,
            sim_id,
            buffers,
            config: self.config.clone(),
        })
    }
}
