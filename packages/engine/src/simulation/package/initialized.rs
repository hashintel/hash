// TODO OS - This file isn't in the module tree, delete? Looks like duplicate of `run.rs` (in the same directory)

use std::sync::Arc;

use futures::{executor::block_on, stream::FuturesUnordered, StreamExt};

use crate::{
    datastore::table::{
        context::PreContext,
        state::{view::StateSnapshot, ReadState},
    },
    simulation::engine::SimulationStepOutput,
};

use super::{context, init, output, prelude::*, state};

/// Represents the packages of a simulation engine.
pub struct Packages {
    pub init: InitPackages,
    pub step: StepPackages,
}

pub struct InitPackages {
    inner: Vec<Box<dyn init::Package>>,
}

impl InitPackages {
    pub fn new(inner: Vec<Box<dyn init::Package>>) -> InitPackages {
        InitPackages { inner }
    }

    pub async fn run(&self) -> Result<State> {
        // TODO run add_remove agents with new agents to distribute
        todo!()
    }
}

pub struct StepPackages {
    context: Vec<Box<dyn context::Package>>,
    state: Vec<Box<dyn state::Package>>,
    output: Vec<Box<dyn output::Package>>,
}

impl StepPackages {
    pub fn new(
        context: Vec<Box<dyn context::Package>>,
        state: Vec<Box<dyn state::Package>>,
        output: Vec<Box<dyn output::Package>>,
    ) -> StepPackages {
        StepPackages {
            context,
            state,
            output,
        }
    }
}

impl StepPackages {
    pub fn empty_context(
        &self,
        experiment_config: &ExperimentConfig,
        num_agents: usize,
    ) -> Result<Context> {
        let columns = self
            .context
            .iter()
            .map(|package| package.get_empty_arrow_column(num_agents))
            .collect::<Result<Vec<_>>>()?;
        let context = Context::new_from_columns(
            columns,
            experiment_config.store.clone(),
            &experiment_config.run_id,
        )?;
        Ok(context)
    }

    pub async fn run_context<'a>(
        &'a mut self,
        state: Arc<State>,
        snapshot: StateSnapshot,
        pre_context: PreContext,
        system: Arc<Comms>,
    ) -> Result<ExContext> {
        // Execute packages in parallel and collect the data
        let futs = FuturesUnordered::new();

        let pkgs = std::mem::replace(&mut self.context, vec![]);
        let num_packages = pkgs.len();

        let snapshot_arc = Arc::new(snapshot);

        pkgs.into_iter().for_each(|mut package| {
            let state_arc = state.clone();
            let snapshot_clone = snapshot_arc.clone();
            let system_arc = system.clone();

            let cpu_bound = package.cpu_bound();
            futs.push(if cpu_bound {
                tokio::task::spawn_blocking(move || {
                    let res = block_on(package.run(state_arc, snapshot_clone, system_arc));
                    (package, res)
                })
            } else {
                tokio::task::spawn(async {
                    let res = package.run(state_arc, snapshot_clone, system_arc).await;
                    (package, res)
                })
            });
        });

        let collected = futs.collect::<Vec<_>>().await;

        let mut pkgs = Vec::with_capacity(num_packages);
        let mut context_datas = Vec::with_capacity(num_packages);
        for result in collected {
            let (pkg, data) = result?;
            pkgs.push(pkg);
            context_datas.push(data?);
        }
        self.context = pkgs;

        let snapshot =
            Arc::try_unwrap(snapshot_arc).map_err(|_| Error::from("Failed to unwrap snapshot"))?;
        let context = pre_context.finalize(snapshot, &context_datas, state.num_agents())?;
        Ok(context)
    }

    pub async fn run_state(
        &mut self,
        mut state: ExState,
        context: &Context,
        system: &mut Comms,
    ) -> Result<ExState> {
        // Design-choices:
        // Cannot use trait bounds as dyn Package won't be object-safe
        // Traits are tricky anyway for working with iterators
        // Will instead use state.upgrade() and exstate.downgrade() and respectively for context
        let num_packages = self.state.len();
        let pkgs = std::mem::replace(&mut self.state, Vec::with_capacity(num_packages));
        for mut package in pkgs {
            package.run(&mut state, context, system).await?;
            self.state.push(package);
        }

        Ok(state)
    }

    pub async fn run_output(&mut self) -> Result<SimulationStepOutput> {
        todo!()
    }
}
