use serde_json::Value;
use std::ops::Deref;

use analyzer::Analyzer;
pub use output::{AnalysisOutput, AnalysisSingleOutput};

use crate::datastore::table::state::ReadState;
use crate::experiment::SimPackageArgs;

pub use self::config::AnalysisOutputConfig;

pub use super::super::*;

#[macro_use]
mod macros;
mod analyzer;
mod config;
mod index_iter;
mod output;
mod validation;
mod value_iter;

pub enum Task {}

pub struct Creator {}

impl Creator {
    pub fn new() -> Box<dyn PackageCreator> {
        Box::new(Creator {})
    }
}

impl PackageCreator for Creator {
    fn create(
        &self,
        config: &Arc<SimRunConfig<ExperimentRunBase>>,
        _comms: PackageComms,
        accessor: FieldSpecMapAccessor,
    ) -> Result<Box<dyn Package>> {
        // TODO, look at reworking signatures and package creation to make ownership clearer and make this unnecessary
        let analysis_src = get_analysis_source(&config.exp.run.project_base.packages)?;
        let analyzer = Analyzer::from_analysis_source(
            &analysis_src,
            &config.sim.store.agent_schema,
            &accessor,
        )?;

        Ok(Box::new(Analysis { analyzer }))
    }

    fn persistence_config(
        &self,
        config: &ExperimentConfig<ExperimentRunBase>,
        globals: &Globals,
    ) -> Result<serde_json::Value> {
        let config = AnalysisOutputConfig::new(config)?;
        Ok(serde_json::to_value(config)?)
    }
}

struct Analysis {
    analyzer: Analyzer,
}

impl MaybeCPUBound for Analysis {
    fn cpu_bound(&self) -> bool {
        true
    }
}

impl GetWorkerStartMsg for Analysis {
    fn get_worker_start_msg(&self) -> Result<Value> {
        Ok(Value::Null)
    }
}

#[async_trait]
impl Package for Analysis {
    async fn run(&mut self, state: Arc<State>, _context: Arc<Context>) -> Result<Output> {
        // TODO use filtering to avoid exposing hidden values to users
        let read = state.agent_pool().read_batches()?;
        // TODO propagate Deref trait bound through run
        let dynamic_pool = read.iter().map(|v| v.deref()).collect::<Vec<_>>();
        self.analyzer.run(&dynamic_pool, state.num_agents())?;
        // TODO why doesn't into work?
        Ok(Output::AnalysisOutput(
            self.analyzer.get_latest_output_set(),
        ))
    }
}

pub(self) fn get_analysis_source(sim_packages: &Vec<SimPackageArgs>) -> Result<String> {
    for args in sim_packages.iter() {
        match args.name.as_str() {
            "analysis" => {
                // We currently assume that every analysis source is identical within the
                // simulation runs of an experiment run.
                if let Some(src) = args.data.as_str() {
                    return Ok(src.to_string());
                } else {
                    return Err(Error::from("Analysis source must be a string"));
                }
            }
            _ => (),
        }
    }
    Err(Error::from("Did not find analysis source"))
}
