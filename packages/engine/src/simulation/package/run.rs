use std::collections::HashMap;
use std::sync::Arc;

use futures::{executor::block_on, stream::FuturesOrdered, StreamExt};

use crate::{
    datastore::table::{
        context::PreContext,
        state::{view::StateSnapshot, ReadState},
    },
    simulation::step_output::SimulationStepOutput,
    SimRunConfig,
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

    pub async fn run(&mut self, sim_config: Arc<SimRunConfig>) -> Result<State> {
        // Execute packages in parallel and collect the data
        let mut futs = FuturesOrdered::new();

        let pkgs = std::mem::replace(&mut self.inner, vec![]);
        let num_packages = pkgs.len();

        pkgs.into_iter().for_each(|mut package| {
            let cpu_bound = package.cpu_bound();
            futs.push(if cpu_bound {
                tokio::task::spawn_blocking(move || {
                    let res = block_on(package.run());
                    (package, res)
                })
            } else {
                tokio::task::spawn(async {
                    let res = package.run().await;
                    (package, res)
                })
            });
        });

        let collected = futs.collect::<Vec<_>>().await;

        let mut pkgs = Vec::with_capacity(num_packages);
        let mut agents = Vec::with_capacity(num_packages);
        for result in collected {
            let (pkg, new_agents) = result?;
            pkgs.push(pkg);
            agents.append(&mut new_agents?);
        }

        let state = State::from_agent_states(agents, sim_config)?;
        Ok(state)
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
        experiment_config: &SimRunConfig,
        num_agents: usize,
    ) -> Result<Context> {
        let keys_and_columns = self
            .context
            .iter()
            // TODO remove the need for this creating a method to generate empty arrow columns from schema
            .map(|package| {
                package
                    .get_empty_arrow_column(num_agents, &experiment_config.sim.store.context_schema)
                    .map(|(field_key, col)| (field_key.value().to_string(), col))
            })
            .collect::<Result<HashMap<String, Arc<dyn arrow::array::Array>>>>()?;

        // because we aren't generating the columns from the schema, we need to reorder the cols from the packages to match
        //   this is another reason to move column creation to be done per schema instead of per package, because this is
        //   very messy.
        let schema = &experiment_config.sim.store.context_schema;
        let columns = schema
            .arrow
            .fields()
            .iter()
            .map(|arrow_field| {
                keys_and_columns
                    .get(arrow_field.name())
                    .ok_or(Error::from(format!(
                        "Expected to find an arrow column for key: {}",
                        arrow_field.name()
                    )))
                    .map(|field_name| field_name.clone())
            })
            .collect::<Result<Vec<_>>>()?;
        let context = Context::new_from_columns(
            columns,
            experiment_config.sim.store.clone(),
            &experiment_config.exp.run_id,
            vec![],
        )?;
        Ok(context)
    }

    pub async fn run_context(
        &mut self,
        state: Arc<State>,
        snapshot: StateSnapshot,
        pre_context: PreContext,
    ) -> Result<ExContext> {
        log::debug!("Running context packages");
        // Execute packages in parallel and collect the data
        let mut futs = FuturesOrdered::new();

        let pkgs = std::mem::replace(&mut self.context, vec![]);
        let num_packages = pkgs.len();

        let snapshot_arc = Arc::new(snapshot);

        pkgs.into_iter().for_each(|mut package| {
            let state_arc = state.clone();
            let snapshot_clone = snapshot_arc.clone();

            let cpu_bound = package.cpu_bound();
            futs.push(if cpu_bound {
                tokio::task::spawn_blocking(move || {
                    let res = block_on(package.run(state_arc, snapshot_clone));
                    (package, res)
                })
            } else {
                tokio::task::spawn(async {
                    let res = package.run(state_arc, snapshot_clone).await;
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

    pub async fn run_state(&mut self, mut state: ExState, context: &Context) -> Result<ExState> {
        log::debug!("Running state packages");
        // Design-choices:
        // Cannot use trait bounds as dyn Package won't be object-safe
        // Traits are tricky anyway for working with iterators
        // Will instead use state.upgrade() and exstate.downgrade() and respectively for context
        for pkg in self.state.iter_mut() {
            pkg.run(&mut state, context).await?;
        }

        Ok(state)
    }

    pub async fn run_output(
        &mut self,
        state: Arc<State>,
        context: Arc<Context>,
    ) -> Result<SimulationStepOutput> {
        // Execute packages in parallel and collect the data
        let mut futs = FuturesOrdered::new();

        let num_pkgs = self.output.len();
        let pkgs = std::mem::replace(&mut self.output, vec![]);
        pkgs.into_iter().for_each(|mut pkg| {
            let state = state.clone();
            let context = context.clone();

            let cpu_bound = pkg.cpu_bound();
            futs.push(if cpu_bound {
                tokio::task::spawn_blocking(move || {
                    let res = block_on(pkg.run(state, context));
                    (pkg, res)
                })
            } else {
                tokio::task::spawn(async {
                    let res = pkg.run(state, context).await;
                    (pkg, res)
                })
            });
        });

        let collected = futs.collect::<Vec<_>>().await;

        let mut pkgs = Vec::with_capacity(num_pkgs);
        let mut outputs = SimulationStepOutput::with_capacity(num_pkgs);
        for result in collected {
            let (pkg, output) = result?;
            pkgs.push(pkg);
            outputs.push(output?);
        }
        self.output = pkgs;

        return Ok(outputs);
    }
}
