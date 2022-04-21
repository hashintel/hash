use std::{collections::HashMap, sync::Arc};

use stateful::{
    agent::AgentSchema,
    context::ContextSchema,
    field::{
        FieldScope, FieldSource, FieldSpecMap, FieldSpecMapAccessor, FieldType, PackageId,
        RootFieldSpec, RootFieldSpecCreator,
    },
    global::Globals,
};

use crate::{
    config::{PackageConfig, SimRunConfig},
    datastore::schema::last_state_index_key,
    proto::ExperimentRunTrait,
    simulation::{
        comms::{package::PackageComms, Comms},
        package::{
            context, init,
            name::PackageName,
            output,
            output::packages::OutputPackagesSimConfig,
            run::{InitPackages, Packages, StepPackages},
            state,
            worker_init::PackageInitMsgForWorker,
            PackageInitConfig, PackageType,
        },
        Error, Result,
    },
    worker::runner::comms::PackageMsgs,
};

pub struct PackageCreators {
    init: Vec<(
        PackageId,
        PackageName,
        &'static Box<dyn init::InitPackageCreator>,
    )>,
    context: Vec<(
        PackageId,
        PackageName,
        &'static Box<dyn context::ContextPackageCreator>,
    )>,
    state: Vec<(
        PackageId,
        PackageName,
        &'static Box<dyn state::StatePackageCreator>,
    )>,
    output: Vec<(
        PackageId,
        PackageName,
        &'static Box<dyn output::OutputPackageCreator>,
    )>,
}

impl PackageCreators {
    pub fn from_config(
        package_config: &PackageConfig,
        init_config: &PackageInitConfig,
    ) -> Result<PackageCreators> {
        init::PACKAGE_CREATORS.initialize_for_experiment_run(init_config)?;
        context::PACKAGE_CREATORS.initialize_for_experiment_run(init_config)?;
        output::PACKAGE_CREATORS.initialize_for_experiment_run(init_config)?;
        state::PACKAGE_CREATORS.initialize_for_experiment_run(init_config)?;

        let init = package_config
            .init_packages()
            .iter()
            .map(|package_name| {
                let package_creator = init::PACKAGE_CREATORS.get_checked(package_name)?;
                let package_name = PackageName::Init(*package_name);
                let id = package_name.get_id()?;

                Ok((id, package_name, package_creator))
            })
            .collect::<Result<_>>()?;

        let context = package_config
            .context_packages()
            .iter()
            .map(|package_name| {
                let package_creator = context::PACKAGE_CREATORS.get_checked(package_name)?;
                let package_name = PackageName::Context(*package_name);
                let id = package_name.get_id()?;
                Ok((id, package_name, package_creator))
            })
            .collect::<Result<_>>()?;

        let state = package_config
            .state_packages()
            .iter()
            .map(|package_name| {
                let package_creator = state::PACKAGE_CREATORS.get_checked(package_name)?;
                let package_name = PackageName::State(*package_name);
                let id = package_name.get_id()?;
                Ok((id, package_name, package_creator))
            })
            .collect::<Result<_>>()?;

        let output = package_config
            .output_packages()
            .iter()
            .map(|package_name| {
                let package_creator = output::PACKAGE_CREATORS.get_checked(package_name)?;
                let package_name = PackageName::Output(*package_name);
                let id = package_name.get_id()?;
                Ok((id, package_name, package_creator))
            })
            .collect::<Result<_>>()?;

        Ok(PackageCreators {
            init,
            context,
            state,
            output,
        })
    }

    pub fn init_message(&self) -> Result<PackageMsgs> {
        // TODO: generics to avoid code duplication
        let mut msgs = HashMap::new();
        for (id, name, creator) in &self.init {
            let payload = creator.init_message()?;
            let wrapped = PackageInitMsgForWorker {
                name: *name,
                r#type: PackageType::Init,
                id: *id,
                payload,
            };
            msgs.insert(*id, wrapped);
        }

        for (id, name, creator) in &self.context {
            let payload = creator.init_message()?;
            let wrapped = PackageInitMsgForWorker {
                name: *name,
                r#type: PackageType::Context,
                id: *id,
                payload,
            };
            msgs.insert(*id, wrapped);
        }

        for (id, name, creator) in &self.state {
            let payload = creator.init_message()?;
            let wrapped = PackageInitMsgForWorker {
                name: *name,
                r#type: PackageType::State,
                id: *id,
                payload,
            };
            msgs.insert(*id, wrapped);
        }

        for (id, name, creator) in &self.output {
            let payload = creator.init_message()?;
            let wrapped = PackageInitMsgForWorker {
                name: *name,
                r#type: PackageType::Output,
                id: *id,
                payload,
            };
            msgs.insert(*id, wrapped);
        }

        Ok(PackageMsgs(msgs))
    }

    pub fn new_packages_for_sim(
        &self,
        config: &Arc<SimRunConfig>,
        comms: Comms,
    ) -> Result<(Packages, PackageMsgs)> {
        // TODO: generics to avoid code duplication
        let state_field_spec_map = &config.sim.store.agent_schema.field_spec_map;
        let context_field_spec_map = &config.sim.store.context_schema.field_spec_map;
        let mut messages = HashMap::new();
        let init = self
            .init
            .iter()
            .map(|(package_id, package_name, creator)| {
                let package = creator.create(
                    config,
                    &config.exp.run.base().project_base.package_init,
                    PackageComms::new(comms.clone(), *package_id, PackageType::Init),
                    FieldSpecMapAccessor::new(
                        FieldSource::Package(*package_id),
                        state_field_spec_map.clone(),
                    ),
                )?;
                let start_msg = package.start_message()?;
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
        let context = self
            .context
            .iter()
            .map(|(package_id, package_name, creator)| {
                let package = creator.create(
                    config,
                    &config.exp.run.base().project_base.package_init,
                    PackageComms::new(comms.clone(), *package_id, PackageType::Context),
                    FieldSpecMapAccessor::new(
                        FieldSource::Package(*package_id),
                        Arc::clone(state_field_spec_map),
                    ),
                    FieldSpecMapAccessor::new(
                        FieldSource::Package(*package_id),
                        Arc::clone(context_field_spec_map),
                    ),
                )?;
                let start_msg = package.start_message()?;
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
        let state = self
            .state
            .iter()
            .map(|(package_id, package_name, creator)| {
                let package = creator.create(
                    config,
                    &config.exp.run.base().project_base.package_init,
                    PackageComms::new(comms.clone(), *package_id, PackageType::State),
                    FieldSpecMapAccessor::new(
                        FieldSource::Package(*package_id),
                        Arc::clone(state_field_spec_map),
                    ),
                )?;
                let start_msg = package.start_message()?;
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
        let output = self
            .output
            .iter()
            .map(|(package_id, package_name, creator)| {
                let package = creator.create(
                    config,
                    &config.exp.run.base().project_base.package_init,
                    PackageComms::new(comms.clone(), *package_id, PackageType::Output),
                    FieldSpecMapAccessor::new(
                        FieldSource::Package(*package_id),
                        Arc::clone(state_field_spec_map),
                    ),
                )?;
                let start_msg = package.start_message()?;
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

        let init = InitPackages::new(init);
        let step = StepPackages::new(context, state, output);

        Ok((Packages { init, step }, PackageMsgs(messages)))
    }

    pub fn get_output_persistence_config(
        &self,
        config: &PackageInitConfig,
        globals: &Globals,
    ) -> Result<OutputPackagesSimConfig> {
        let mut map = HashMap::new();
        self.output
            .iter()
            .try_for_each::<_, Result<()>>(|(_id, name, creator)| {
                let config = creator.persistence_config(config, globals)?;
                map.insert(*name, config);
                Ok(())
            })?;
        Ok(OutputPackagesSimConfig { map })
    }

    pub fn get_agent_schema(
        &self,
        package_init_config: &PackageInitConfig,
        globals: &Globals,
    ) -> Result<AgentSchema> {
        let mut field_spec_map = FieldSpecMap::empty();

        // TODO: should we use enum_dispatch here to remove some duplication
        self.init.iter().try_for_each::<_, Result<()>>(
            |(package_id, _package_name, creator)| {
                let field_spec_creator =
                    RootFieldSpecCreator::new(FieldSource::Package(*package_id));
                field_spec_map.try_extend(creator.get_state_field_specs(
                    package_init_config,
                    globals,
                    &field_spec_creator,
                )?)?;
                Ok(())
            },
        )?;

        self.context.iter().try_for_each::<_, Result<()>>(
            |(package_id, _package_name, creator)| {
                let field_spec_creator =
                    RootFieldSpecCreator::new(FieldSource::Package(*package_id));
                field_spec_map.try_extend(creator.get_state_field_specs(
                    package_init_config,
                    globals,
                    &field_spec_creator,
                )?)?;
                Ok(())
            },
        )?;

        self.state.iter().try_for_each::<_, Result<()>>(
            |(package_id, _package_name, creator)| {
                let field_spec_creator =
                    RootFieldSpecCreator::new(FieldSource::Package(*package_id));
                field_spec_map.try_extend(creator.get_state_field_specs(
                    package_init_config,
                    globals,
                    &field_spec_creator,
                )?)?;
                Ok(())
            },
        )?;

        self.output.iter().try_for_each::<_, Result<()>>(
            |(package_id, _package_name, creator)| {
                let field_spec_creator =
                    RootFieldSpecCreator::new(FieldSource::Package(*package_id));
                field_spec_map.try_extend(creator.get_state_field_specs(
                    package_init_config,
                    globals,
                    &field_spec_creator,
                )?)?;
                Ok(())
            },
        )?;

        field_spec_map.try_extend(get_base_agent_fields()?)?;

        Ok(AgentSchema::new(field_spec_map)?)
    }

    pub fn get_context_schema(
        &self,
        package_init_config: &PackageInitConfig,
        globals: &Globals,
    ) -> Result<ContextSchema, Error> {
        let mut field_spec_map = FieldSpecMap::empty();

        self.context.iter().try_for_each::<_, Result<()>>(
            |(package_id, _package_name, creator)| {
                let field_spec_creator =
                    RootFieldSpecCreator::new(FieldSource::Package(*package_id));
                field_spec_map.try_extend(creator.get_context_field_specs(
                    package_init_config,
                    globals,
                    &field_spec_creator,
                )?)?;
                Ok(())
            },
        )?;

        field_spec_map.try_extend(get_base_context_fields()?)?;

        Ok(ContextSchema::new(field_spec_map)?)
    }

    // Needed in tests when creating dummy SimRunConfigs, and using `self.from_config` results in
    // initialising the SyncOnceCell's multiple times and erroring
    #[cfg(test)]
    pub(crate) fn new(
        init: Vec<(
            PackageId,
            PackageName,
            &'static Box<dyn init::InitPackageCreator>,
        )>,
        context: Vec<(
            PackageId,
            PackageName,
            &'static Box<dyn context::ContextPackageCreator>,
        )>,
        state: Vec<(
            PackageId,
            PackageName,
            &'static Box<dyn state::StatePackageCreator>,
        )>,
        output: Vec<(
            PackageId,
            PackageName,
            &'static Box<dyn output::OutputPackageCreator>,
        )>,
    ) -> Self {
        Self {
            init,
            context,
            state,
            output,
        }
    }
}

pub fn get_base_agent_fields() -> Result<Vec<RootFieldSpec>> {
    let mut field_specs = Vec::with_capacity(13);
    let field_spec_creator = RootFieldSpecCreator::new(FieldSource::Engine);

    use stateful::agent::AgentStateField::{
        AgentId, AgentName, Color, Direction, Height, Hidden, Position, Rgb, Scale, Shape, Velocity,
    };
    let used = [
        AgentId, AgentName, Position, Direction, Velocity, Shape, Height, Scale, Color, Rgb, Hidden,
    ];
    for field in used {
        let field_type: FieldType = field.clone().try_into()?;
        field_specs.push(field_spec_creator.create(
            field.name().into(),
            field_type,
            FieldScope::Agent,
        ));
    }

    let last_state_index = last_state_index_key();

    field_specs.push(field_spec_creator.create(
        last_state_index.name,
        last_state_index.field_type,
        FieldScope::Hidden,
    ));

    Ok(field_specs)
}

fn get_base_context_fields() -> Result<Vec<RootFieldSpec>> {
    let _field_spec_creator = RootFieldSpecCreator::new(FieldSource::Engine);
    // TODO: previous index and other fields that make sense
    // Doesn't do anything for now
    Ok(vec![])
}
