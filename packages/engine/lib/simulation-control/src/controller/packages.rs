use std::{collections::HashMap, sync::Arc};

use arrow2::chunk::Chunk;
use execution::{
    package::simulation::{
        context::ContextPackage,
        init::InitPackage,
        output::{Output, OutputPackage},
        state::StatePackage,
        PackageType,
    },
    runner::comms::PackageMsgs,
    worker::PackageInitMsgForWorker,
};
use experiment_structure::{PackageCreators, SimulationRunConfig};
use futures::{executor::block_on, stream::FuturesOrdered, StreamExt};
use memory::shared_memory::MemoryId;
use stateful::{
    context::{Context, ContextColumn, PreContext},
    field::{FieldSource, FieldSpecMapAccessor},
    state::{State, StateReadProxy, StateSnapshot},
};
use tracing::{Instrument, Span};

use crate::{
    comms::Comms,
    error::{Error, Result},
};

/// Represents the packages of a simulation engine.
pub struct Packages {
    init: Vec<Box<dyn InitPackage>>,
    context: Vec<Box<dyn ContextPackage>>,
    state: Vec<Box<dyn StatePackage>>,
    output: Vec<Box<dyn OutputPackage>>,
}

impl Packages {
    pub fn from_package_creators(
        package_creators: &PackageCreators,
        config: &Arc<SimulationRunConfig>,
        comms: &Comms,
    ) -> Result<(Self, PackageMsgs)> {
        // TODO: generics to avoid code duplication
        let state_field_spec_map = &config
            .simulation_config()
            .schema
            .agent_schema
            .field_spec_map;
        let context_field_spec_map = &config
            .simulation_config()
            .schema
            .context_schema
            .field_spec_map;
        let mut messages = HashMap::new();

        let init = package_creators
            .init_package_creators()
            .iter()
            .map(|(package_id, package_name, creator)| {
                let package = creator.create(
                    &config.simulation_config().package_creator,
                    &config
                        .experiment_config()
                        .experiment_run
                        .simulation()
                        .package_init,
                    comms.package_comms(*package_id),
                    FieldSpecMapAccessor::new(
                        FieldSource::Package(*package_id),
                        state_field_spec_map.clone(),
                    ),
                )?;
                let start_msg = package.simulation_setup_message()?;
                let wrapped_msg = PackageInitMsgForWorker {
                    name: *package_name,
                    r#type: PackageType::Init,
                    id: *package_id,
                    payload: start_msg,
                };
                messages.insert(*package_id, wrapped_msg);
                Ok(package)
            })
            .collect::<Result<Vec<_>>>()?;

        let context = package_creators
            .context_package_creators()
            .iter()
            .map(|(package_id, package_name, creator)| {
                let package = creator.create(
                    &config.simulation_config().package_creator,
                    &config
                        .experiment_config()
                        .experiment_run
                        .simulation()
                        .package_init,
                    comms.package_comms(*package_id),
                    FieldSpecMapAccessor::new(
                        FieldSource::Package(*package_id),
                        Arc::clone(state_field_spec_map),
                    ),
                    FieldSpecMapAccessor::new(
                        FieldSource::Package(*package_id),
                        Arc::clone(context_field_spec_map),
                    ),
                )?;
                let start_msg = package.simulation_setup_message()?;
                let wrapped_msg = PackageInitMsgForWorker {
                    name: *package_name,
                    r#type: PackageType::Context,
                    id: *package_id,
                    payload: start_msg,
                };
                messages.insert(*package_id, wrapped_msg);
                Ok(package)
            })
            .collect::<Result<Vec<_>>>()?;

        let state = package_creators
            .state_package_creators()
            .iter()
            .map(|(package_id, package_name, creator)| {
                let package = creator.create(
                    &config.simulation_config().package_creator,
                    &config
                        .experiment_config()
                        .experiment_run
                        .simulation()
                        .package_init,
                    comms.package_comms(*package_id),
                    FieldSpecMapAccessor::new(
                        FieldSource::Package(*package_id),
                        Arc::clone(state_field_spec_map),
                    ),
                )?;
                let start_msg = package.simulation_setup_message()?;
                let wrapped_msg = PackageInitMsgForWorker {
                    name: *package_name,
                    r#type: PackageType::State,
                    id: *package_id,
                    payload: start_msg,
                };
                messages.insert(*package_id, wrapped_msg);
                Ok(package)
            })
            .collect::<Result<Vec<_>>>()?;

        let output = package_creators
            .output_package_creators()
            .iter()
            .map(|(package_id, package_name, creator)| {
                let package = creator.create(
                    &config.simulation_config().package_creator,
                    &config
                        .experiment_config()
                        .experiment_run
                        .simulation()
                        .package_init,
                    comms.package_comms(*package_id),
                    FieldSpecMapAccessor::new(
                        FieldSource::Package(*package_id),
                        Arc::clone(state_field_spec_map),
                    ),
                )?;
                let start_msg = package.simulation_setup_message()?;
                let wrapped_msg = PackageInitMsgForWorker {
                    name: *package_name,
                    r#type: PackageType::State,
                    id: *package_id,
                    payload: start_msg,
                };
                messages.insert(*package_id, wrapped_msg);
                Ok(package)
            })
            .collect::<Result<Vec<_>>>()?;

        Ok((
            Self {
                init,
                context,
                state,
                output,
            },
            PackageMsgs(messages),
        ))
    }

    pub async fn run_init(&mut self, sim_config: Arc<SimulationRunConfig>) -> Result<State> {
        // Execute packages in parallel and collect the data
        let mut futs = FuturesOrdered::new();

        let pkgs = std::mem::take(&mut self.init);
        let num_packages = pkgs.len();

        pkgs.into_iter().for_each(|mut package| {
            let cpu_bound = package.cpu_bound();
            futs.push_back(if cpu_bound {
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
        let state = State::from_agent_states(&agents, sim_config.to_state_create_parameters())?;
        Ok(state)
    }

    pub fn empty_context(
        &self,
        sim_run_config: &SimulationRunConfig,
        num_agents: usize,
    ) -> Result<Context> {
        let mut keys_and_columns = self
            .context
            .iter()
            .map(|package| {
                // TODO: remove the need for this by creating a method to generate empty arrow
                //       columns from the schema
                package.get_empty_arrow_columns(
                    num_agents,
                    &sim_run_config.simulation_config().schema.context_schema,
                )
            })
            .collect::<execution::Result<Vec<_>>>()?
            .into_iter()
            .flatten()
            .map(|(field_key, col)| (field_key.value().to_string(), col))
            .collect::<HashMap<String, Box<dyn arrow2::array::Array>>>();

        // because we aren't generating the columns from the schema, we need to reorder the cols
        // from the packages to match this is another reason to move column creation to be
        // done per schema instead of per package, because this is very messy.
        let schema = &sim_run_config.simulation_config().schema.context_schema;
        let columns = schema
            .arrow
            .fields
            .iter()
            .map(|arrow_field| {
                let col = keys_and_columns
                    .remove(&arrow_field.name)
                    .ok_or_else(|| {
                        Error::from(format!(
                            "Expected to find an arrow column for key: {}",
                            arrow_field.name
                        ))
                    });
                if let Ok(col) = &col {
                    debug_assert_eq!(
                        arrow_field.data_type(),
                        col.data_type(),
                        "the datatype for {} does not match the schema",
                        arrow_field.name
                    );
                    assert_eq!(
                        col.len(),
                        num_agents,
                        r#"the length ({}) of the column "{}" does not equal the number of agents ({num_agents}). {:#?}"#,
                        col.len(),
                        arrow_field.name,
                        col
                    );
                }
                col
            })
            .collect::<Result<Vec<_>>>()?;

        let context = Context::from_columns(
            Chunk::new(columns),
            &sim_run_config.simulation_config().schema.context_schema,
            MemoryId::new(
                sim_run_config
                    .experiment_config()
                    .experiment_run
                    .id()
                    .as_uuid(),
            ),
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
        sim_config: &SimulationRunConfig,
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
            futs.push_back(if cpu_bound {
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
                        (
                            context_column.field_key().value().to_string(),
                            context_column,
                        )
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
        let schema = &sim_config.simulation_config().schema.context_schema;
        let column_writers = schema
            .arrow
            .fields
            .iter()
            .map(|arrow_field| {
                keys_and_column_writers
                    .get(&arrow_field.name)
                    .ok_or_else(|| {
                        Error::from(format!(
                            "Expected to find a context column writer for key: {}",
                            arrow_field.name
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
    ) -> Result<Vec<Output>> {
        // Execute packages in parallel and collect the data
        let mut futs = FuturesOrdered::new();

        let num_pkgs = self.output.len();
        // Take packages so we can send them to a potentially different thread.
        let pkgs = std::mem::take(&mut self.output);
        pkgs.into_iter().for_each(|mut pkg| {
            let state = state.clone();
            let context = context.clone();

            let cpu_bound = pkg.cpu_bound();
            futs.push_back(if cpu_bound {
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

        // Collect outputs and put back packages that we took.
        // Output packages can't reload state batches, since they only have read access to state,
        // but reloading would mean mutating the loaded data.
        let mut pkgs = Vec::with_capacity(num_pkgs);
        let mut outputs = Vec::with_capacity(num_pkgs);
        for result in collected {
            let (pkg, output) = result?;
            pkgs.push(pkg);
            outputs.push(output?);
        }
        self.output = pkgs;

        Ok(outputs)
    }
}
