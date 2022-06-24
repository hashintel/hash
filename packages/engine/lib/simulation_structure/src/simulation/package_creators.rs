use std::collections::HashMap;

use execution::{
    package::simulation::{
        context::{ContextPackageCreator, ContextPackageCreators},
        init::{InitPackageCreator, InitPackageCreators},
        output::{OutputPackageCreator, OutputPackageCreators},
        state::{StatePackageCreator, StatePackageCreators},
        Comms, OutputPackagesSimConfig, PackageInitConfig, PackageName, PackageType,
        PersistenceConfig,
    },
    runner::comms::PackageMsgs,
    worker::PackageInitMsgForWorker,
};
use stateful::{
    agent::AgentSchema,
    context::ContextSchema,
    field::{FieldSource, FieldSpecMap, PackageId, RootFieldSpec, RootFieldSpecCreator},
    global::Globals,
};

use crate::{Error, ExperimentConfig, PackageConfig, Result};

pub struct PackageCreators<'c, C> {
    init: Vec<(PackageId, PackageName, &'c dyn InitPackageCreator<C>)>,
    context: Vec<(PackageId, PackageName, &'c dyn ContextPackageCreator<C>)>,
    state: Vec<(PackageId, PackageName, &'c dyn StatePackageCreator<C>)>,
    output: Vec<(PackageId, PackageName, &'c dyn OutputPackageCreator<C>)>,
}

impl<'c, C: Comms> PackageCreators<'c, C> {
    pub fn from_config(
        package_config: &PackageConfig,
        init_package_creators: &'c InitPackageCreators<C>,
        context_package_creators: &'c ContextPackageCreators<C>,
        state_package_creators: &'c StatePackageCreators<C>,
        output_package_creators: &'c OutputPackageCreators<C>,
    ) -> Result<Self> {
        let init = package_config
            .init_packages()
            .iter()
            .map(|package_name| {
                let package_creator = init_package_creators.get(*package_name)?;
                let package_name = PackageName::Init(*package_name);
                let id = package_name.get_id()?;

                Ok((id, package_name, package_creator))
            })
            .collect::<Result<_>>()?;

        let context = package_config
            .context_packages()
            .iter()
            .map(|package_name| {
                let package_creator = context_package_creators.get(*package_name)?;
                let package_name = PackageName::Context(*package_name);
                let id = package_name.get_id()?;
                Ok((id, package_name, package_creator))
            })
            .collect::<Result<_>>()?;

        let state = package_config
            .state_packages()
            .iter()
            .map(|package_name| {
                let package_creator = state_package_creators.get(*package_name)?;
                let package_name = PackageName::State(*package_name);
                let id = package_name.get_id()?;
                Ok((id, package_name, package_creator))
            })
            .collect::<Result<_>>()?;

        let output = package_config
            .output_packages()
            .iter()
            .map(|package_name| {
                let package_creator = output_package_creators.get(*package_name)?;
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

    pub fn init_package_creators(&self) -> &[(PackageId, PackageName, &dyn InitPackageCreator<C>)] {
        &self.init
    }

    pub fn context_package_creators(
        &self,
    ) -> &[(PackageId, PackageName, &dyn ContextPackageCreator<C>)] {
        &self.context
    }

    pub fn state_package_creators(
        &self,
    ) -> &[(PackageId, PackageName, &dyn StatePackageCreator<C>)] {
        &self.state
    }

    pub fn output_package_creators(
        &self,
    ) -> &[(PackageId, PackageName, &dyn OutputPackageCreator<C>)] {
        &self.output
    }

    pub fn create_persistent_config(
        &self,
        exp_config: &ExperimentConfig,
        globals: &Globals,
    ) -> Result<PersistenceConfig> {
        let output_config =
            self.get_output_persistence_config(&exp_config.simulation().package_init, globals)?;
        Ok(PersistenceConfig { output_config })
    }

    pub fn init_message(&self) -> Result<PackageMsgs> {
        // TODO: generics to avoid code duplication
        let mut msgs = HashMap::new();
        for (id, name, creator) in &self.init {
            let payload = creator.worker_init_message()?;
            let wrapped = PackageInitMsgForWorker {
                name: *name,
                r#type: PackageType::Init,
                id: *id,
                payload,
            };
            msgs.insert(*id, wrapped);
        }

        for (id, name, creator) in &self.context {
            let payload = creator.worker_init_message()?;
            let wrapped = PackageInitMsgForWorker {
                name: *name,
                r#type: PackageType::Context,
                id: *id,
                payload,
            };
            msgs.insert(*id, wrapped);
        }

        for (id, name, creator) in &self.state {
            let payload = creator.worker_init_message()?;
            let wrapped = PackageInitMsgForWorker {
                name: *name,
                r#type: PackageType::State,
                id: *id,
                payload,
            };
            msgs.insert(*id, wrapped);
        }

        for (id, name, creator) in &self.output {
            let payload = creator.worker_init_message()?;
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

        field_spec_map.try_extend(RootFieldSpec::base_agent_fields()?)?;

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
}

fn get_base_context_fields() -> Result<Vec<RootFieldSpec>> {
    let _field_spec_creator = RootFieldSpecCreator::new(FieldSource::Engine);
    // TODO: previous index and other fields that make sense
    // Doesn't do anything for now
    Ok(vec![])
}
