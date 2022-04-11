#[macro_use]
mod macros;
mod analyzer;
mod config;
mod index_iter;
mod output;
mod validation;
mod value_iter;

use std::sync::Arc;

use analyzer::Analyzer;
use async_trait::async_trait;
use serde_json::Value;
use stateful::{field::FieldSpecMapAccessor, globals::Globals, proxy::BatchPool};
use tracing::Span;

pub use self::{
    config::AnalysisOutputConfig,
    output::{AnalysisOutput, AnalysisSingleOutput},
};
use crate::{
    config::{ExperimentConfig, SimRunConfig},
    datastore::table::{context::Context, state::State},
    experiment::SimPackageArgs,
    proto::ExperimentRunTrait,
    simulation::{
        comms::package::PackageComms,
        package::{
            ext_traits::{GetWorkerExpStartMsg, GetWorkerSimStartMsg, MaybeCpuBound},
            output::{packages::Output, Package, PackageCreator},
        },
        Error, Result,
    },
};

// TODO: UNUSED: Needs triage
pub enum Task {}

pub struct Creator {}

impl PackageCreator for Creator {
    fn new(_experiment_config: &Arc<ExperimentConfig>) -> Result<Box<dyn PackageCreator>> {
        Ok(Box::new(Creator {}))
    }

    fn create(
        &self,
        config: &Arc<SimRunConfig>,
        _comms: PackageComms,
        accessor: FieldSpecMapAccessor,
    ) -> Result<Box<dyn Package>> {
        // TODO, look at reworking signatures and package creation to make ownership clearer and
        // make this unnecessary
        let analysis_src = get_analysis_source(&config.exp.run.base().project_base.packages)?;
        let analyzer = Analyzer::from_analysis_source(
            &analysis_src,
            &config.sim.store.agent_schema,
            &accessor,
        )?;

        Ok(Box::new(Analysis { analyzer }))
    }

    fn persistence_config(&self, config: &ExperimentConfig, _globals: &Globals) -> Result<Value> {
        let config = AnalysisOutputConfig::new(config)?;
        Ok(serde_json::to_value(config)?)
    }
}

impl GetWorkerExpStartMsg for Creator {
    fn get_worker_exp_start_msg(&self) -> Result<Value> {
        Ok(Value::Null)
    }
}

struct Analysis {
    analyzer: Analyzer,
}

impl MaybeCpuBound for Analysis {
    fn cpu_bound(&self) -> bool {
        true
    }
}

impl GetWorkerSimStartMsg for Analysis {
    fn get_worker_sim_start_msg(&self) -> Result<Value> {
        Ok(Value::Null)
    }
}

#[async_trait]
impl Package for Analysis {
    async fn run(&mut self, state: Arc<State>, _context: Arc<Context>) -> Result<Output> {
        // TODO: use filtering to avoid exposing hidden values to users
        let agent_proxies = state.agent_pool().read_proxies()?;
        // TODO: propagate Deref trait bound through run
        let dynamic_pool = agent_proxies.batches_iter().collect::<Vec<_>>();
        self.analyzer.run(&dynamic_pool, state.num_agents())?;

        Ok(Output::AnalysisOutput(
            self.analyzer.get_latest_output_set(),
        ))
    }

    fn span(&self) -> Span {
        tracing::debug_span!("analysis")
    }
}

pub(self) fn get_analysis_source(sim_packages: &[SimPackageArgs]) -> Result<String> {
    for args in sim_packages.iter() {
        if args.name.as_str() == "analysis" {
            // We currently assume that every analysis source is identical within the
            // simulation runs of an experiment run.
            if let Some(src) = args.data.as_str() {
                return Ok(src.to_string());
            } else {
                return Err(Error::from("Analysis source must be a string"));
            }
        }
    }
    Err(Error::from("Did not find analysis source"))
}
