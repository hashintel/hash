#[macro_use]
mod macros;
mod analyzer;
mod config;
mod index_iter;
mod validation;
mod value_iter;

use std::sync::Arc;

use analyzer::Analyzer;
use async_trait::async_trait;
use execution::{
    package::{
        output::{Output, OutputPackage, OutputPackageCreator},
        MaybeCpuBound, Package, PackageComms, PackageCreator, PackageCreatorConfig,
        PackageInitConfig, SimPackageArgs,
    },
    Error, Result,
};
use serde_json::Value;
use stateful::{
    context::Context, field::FieldSpecMapAccessor, global::Globals, proxy::BatchPool, state::State,
};
use tracing::Span;

pub use self::config::AnalysisOutputConfig;

// TODO: UNUSED: Needs triage
pub enum Task {}

pub struct AnalysisCreator;

impl<C> OutputPackageCreator<C> for AnalysisCreator {
    fn create(
        &self,
        config: &PackageCreatorConfig,
        init_config: &PackageInitConfig,
        _comms: PackageComms<C>,
        accessor: FieldSpecMapAccessor,
    ) -> Result<Box<dyn OutputPackage>> {
        // TODO, look at reworking signatures and package creation to make ownership clearer and
        // make this unnecessary
        let analysis_src = get_analysis_source(&init_config.packages)?;
        let analyzer =
            Analyzer::from_analysis_source(&analysis_src, &config.agent_schema, &accessor)?;

        Ok(Box::new(Analysis { analyzer }))
    }

    fn persistence_config(&self, config: &PackageInitConfig, _globals: &Globals) -> Result<Value> {
        let config = AnalysisOutputConfig::new(config)?;
        Ok(serde_json::to_value(config)?)
    }
}

impl PackageCreator for AnalysisCreator {}

struct Analysis {
    analyzer: Analyzer,
}

impl MaybeCpuBound for Analysis {
    fn cpu_bound(&self) -> bool {
        true
    }
}

impl Package for Analysis {}

#[async_trait]
impl OutputPackage for Analysis {
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
