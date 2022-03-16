use std::{collections::HashMap, sync::Arc};

use futures::{executor::block_on, stream::FuturesOrdered, StreamExt};
use tracing::{Instrument, Span};

use crate::{
    datastore::table::{
        context::{Context, PreContext},
        proxy::StateReadProxy,
        state::{view::StateSnapshot, State},
    },
    proto::ExperimentRunTrait,
    simulation::{
        package::{
            context,
            context::ContextColumn,
            init, output,
            prelude::{Error, Result},
            state,
        },
        step_output::SimulationStepOutput,
    },
    SimRunConfig,
};

/// Represents the packages of a simulation engine.
pub struct Packages {
    pub init: InitPackages,
    pub step: StepPackages,
}

/// TODO: DOC: explain link to init/mod.rs
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

        let pkgs = std::mem::take(&mut self.inner);
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

        tracing::trace!("Init packages finished, building state");
        let state = State::from_agent_states(&agents, sim_config)?;
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
        sim_run_config: &SimRunConfig,
        num_agents: usize,
    ) -> Result<Context> {
        let keys_and_columns = self
            .context
            .iter()
            // TODO: remove the need for this creating a method to generate empty arrow columns from schema
            .map(|package| {
                package
                    .get_empty_arrow_columns(num_agents, &sim_run_config.sim.store.context_schema)
            })
            .collect::<Result<Vec<_>>>()?
            .into_iter()
            .flatten()
            .map(|(field_key, col)| (field_key.value().to_string(), col))
            .collect::<HashMap<String, Arc<dyn arrow::array::Array>>>();

        // because we aren't generating the columns from the schema, we need to reorder the cols
        // from the packages to match this is another reason to move column creation to be
        // done per schema instead of per package, because this is very messy.
        let schema = &sim_run_config.sim.store.context_schema;
        let columns = schema
            .arrow
            .fields()
            .iter()
            .map(|arrow_field| {
                keys_and_columns
                    .get(arrow_field.name())
                    .ok_or_else(|| {
                        Error::from(format!(
                            "Expected to find an arrow column for key: {}",
                            arrow_field.name()
                        ))
                    })
                    .map(Arc::clone)
            })
            .collect::<Result<Vec<_>>>()?;

        let context = Context::from_columns(
            columns,
            sim_run_config.sim.store.clone(),
            &sim_run_config.exp.run.base().id,
        )?;
        Ok(context)
    }

    pub async fn run_context(
        &mut self,
        // TODO: rename to `snapshot_state_proxy` or better yet should we just remove the proxy and
        //  let them get a proxy from the StateSnapshot?
        //  https://app.asana.com/0/1199548034582004/1201892819201277/f
        state_proxy: &StateReadProxy,
        snapshot: StateSnapshot,
        pre_context: PreContext,
        num_agents: usize,
        sim_config: &SimRunConfig,
    ) -> Result<Context> {
        tracing::debug!("Running context packages");
        // Execute packages in parallel and collect the data
        let mut futs = FuturesOrdered::new();

        let pkgs = std::mem::take(&mut self.context);
        let num_packages = pkgs.len();

        let snapshot_arc = Arc::new(snapshot);

        pkgs.into_iter().for_each(|mut package| {
            let state = state_proxy.clone();
            let snapshot_clone = snapshot_arc.clone();

            let cpu_bound = package.cpu_bound();
            futs.push(if cpu_bound {
                let current_span = Span::current();
                tokio::task::spawn_blocking(move || {
                    let package_span = {
                        // We want to create the package span within the scope of the current one
                        let _entered = current_span.entered();
                        package.span()
                    };
                    let res = block_on(package.run(state, snapshot_clone).instrument(package_span));
                    (package, res)
                })
            } else {
                let span = package.span();
                tokio::task::spawn(
                    async {
                        let res = package.run(state, snapshot_clone).instrument(span).await;
                        (package, res)
                    }
                    .in_current_span(),
                )
            });
        });

        let collected = futs.collect::<Vec<_>>().await;

        let mut pkgs = Vec::with_capacity(num_packages);
        let keys_and_column_writers = collected
            .into_iter()
            .map(|result| {
                let (pkg, package_column_writers) = result?;
                pkgs.push(pkg);
                Ok(package_column_writers?
                    .into_iter()
                    .map(|context_column| {
                        (context_column.field_key.value().to_string(), context_column)
                    })
                    .collect::<Vec<(String, ContextColumn)>>())
            })
            .collect::<Result<Vec<_>>>()?
            .into_iter()
            .flatten()
            .collect::<HashMap<String, ContextColumn>>();

        self.context = pkgs;

        // As with above with the empty columns, we need to re-order the column writers to match
        // the ordering of the columns within the schema. This is unfortunately really sloppy at
        // the moment but a proper fix needs a bit of a redesign. Thus:
        // TODO, figure out a better design for how we interface with columns from context packages,
        //   and how we ensure the necessary order (preferably enforced in actual logic)
        let schema = &sim_config.sim.store.context_schema;
        let column_writers = schema
            .arrow
            .fields()
            .iter()
            .map(|arrow_field| {
                keys_and_column_writers
                    .get(arrow_field.name())
                    .ok_or_else(|| {
                        Error::from(format!(
                            "Expected to find a context column writer for key: {}",
                            arrow_field.name()
                        ))
                    })
            })
            .collect::<Result<Vec<_>>>()?;

        let snapshot =
            Arc::try_unwrap(snapshot_arc).map_err(|_| Error::from("Failed to unwrap snapshot"))?;

        let context = pre_context.finalize(snapshot.state, &column_writers, num_agents)?;
        Ok(context)
    }

    pub async fn run_state(&mut self, state: &mut State, context: &Context) -> Result<()> {
        tracing::debug!("Running state packages");
        // Design-choices:
        // Cannot use trait bounds as dyn Package won't be object-safe
        // Traits are tricky anyway for working with iterators
        // Will instead use state.into_mut() and state_mut.into_shared() and respectively for
        // context
        for pkg in self.state.iter_mut() {
            let span = pkg.span();
            pkg.run(state, context).instrument(span).await?;
        }
        Ok(())
    }

    pub async fn run_output(
        &mut self,
        state: &Arc<State>,
        context: &Arc<Context>,
    ) -> Result<SimulationStepOutput> {
        // Execute packages in parallel and collect the data
        let mut futs = FuturesOrdered::new();

        let num_pkgs = self.output.len();
        let pkgs = std::mem::take(&mut self.output);
        pkgs.into_iter().for_each(|mut pkg| {
            let state = state.clone();
            let context = context.clone();

            let cpu_bound = pkg.cpu_bound();
            futs.push(if cpu_bound {
                let current_span = Span::current();
                tokio::task::spawn_blocking(move || {
                    let package_span = {
                        // We want to create the package span within the scope of the current one
                        let _entered = current_span.entered();
                        pkg.span()
                    };
                    let res = block_on(pkg.run(state, context).instrument(package_span));
                    (pkg, res)
                })
            } else {
                let span = pkg.span();
                tokio::task::spawn(
                    async {
                        let res = pkg.run(state, context).instrument(span).await;
                        (pkg, res)
                    }
                    .in_current_span(),
                )
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

        Ok(outputs)
    }
}
