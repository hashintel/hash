use std::collections::HashMap;
use std::convert::TryInto;
use std::sync::Arc;

use crate::proto::ExperimentRunBase;

use crate::config::PackageConfig;
use crate::datastore::schema::context::ContextSchema;
use crate::datastore::schema::state::AgentSchema;
use crate::datastore::schema::{
    FieldScope, FieldSource, FieldSpec, FieldSpecMapBuilder, FieldType, FieldTypeVariant,
    PresetFieldType,
};
use crate::simulation::comms::package::PackageComms;
use crate::simulation::packages::name::PackageName;
use crate::{
    config::SimRunConfig,
    simulation::{Error, Result},
};

use super::id::PackageId;
use super::output::packages::OutputPackagesSimConfig;
use super::prelude::Comms;
use super::PackageType;
use super::{
    context, init, output,
    run::{InitPackages, Packages, StepPackages},
    state,
};

pub struct PackageCreators {
    init: Vec<(
        PackageId,
        PackageName,
        &'static Box<dyn init::PackageCreator>,
    )>,
    context: Vec<(
        PackageId,
        PackageName,
        &'static Box<dyn context::PackageCreator>,
    )>,
    state: Vec<(
        PackageId,
        PackageName,
        &'static Box<dyn state::PackageCreator>,
    )>,
    output: Vec<(
        PackageId,
        PackageName,
        &'static Box<dyn output::PackageCreator>,
    )>,
}

impl PackageCreators {
    pub fn from_config(config: &PackageConfig) -> Result<PackageCreators> {
        let init = config
            .init_packages()
            .iter()
            .enumerate()
            .map(|(index, package_name)| {
                let package_creator = init::PACKAGES.get(package_name).ok_or_else(|| {
                    Error::from(format!(
                        "Could not find init creator package: {}",
                        Into::<&str>::into(package_name)
                    ))
                })?;
                let package_name = PackageName::Init(package_name.clone());
                let id = package_name.get_id()?;
                Ok((id, package_name, package_creator))
            })
            .collect::<Result<_>>()?;

        let context = config
            .context_packages()
            .iter()
            .enumerate()
            .map(|(index, package_name)| {
                let package_creator = context::PACKAGES.get(package_name).ok_or_else(|| {
                    Error::from(format!(
                        "Could not find context creator package: {}",
                        Into::<&str>::into(package_name)
                    ))
                })?;
                let package_name = PackageName::Context(package_name.clone());
                let id = package_name.get_id()?;
                Ok((id, package_name, package_creator))
            })
            .collect::<Result<_>>()?;

        let state = config
            .state_packages()
            .iter()
            .enumerate()
            .map(|(index, package_name)| {
                let package_creator = state::PACKAGES.get(package_name).ok_or_else(|| {
                    Error::from(format!(
                        "Could not find state creator package: {}",
                        Into::<&str>::into(package_name)
                    ))
                })?;
                let package_name = PackageName::State(package_name.clone());
                let id = package_name.get_id()?;
                Ok((id, package_name, package_creator))
            })
            .collect::<Result<_>>()?;

        let output = config
            .output_packages()
            .iter()
            .enumerate()
            .map(|(index, package_name)| {
                let package_creator = output::PACKAGES.get(package_name).ok_or_else(|| {
                    Error::from(format!(
                        "Could not find output creator package: {}",
                        Into::<&str>::into(package_name)
                    ))
                })?;
                let package_name = PackageName::Output(package_name.clone());
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

    pub fn new_init(
        &self,
        config: &Arc<SimRunConfig<ExperimentRunBase>>,
        comms: Comms,
    ) -> Result<Packages> {
        // TODO generics
        let init = self
            .init
            .iter()
            .map(|(package_id, package_name, creator)| {
                creator.create(
                    config,
                    PackageComms::new(comms.clone(), package_id.clone(), PackageType::Init),
                )
            })
            .collect::<Result<Vec<_>>>()?;
        let context = self
            .context
            .iter()
            .map(|(package_id, package_name, creator)| {
                creator.create(
                    config,
                    PackageComms::new(comms.clone(), package_id.clone(), PackageType::Context),
                )
            })
            .collect::<Result<Vec<_>>>()?;
        let state = self
            .state
            .iter()
            .map(|(package_id, package_name, creator)| {
                creator.create(
                    config,
                    PackageComms::new(comms.clone(), package_id.clone(), PackageType::State),
                )
            })
            .collect::<Result<Vec<_>>>()?;
        let output = self
            .output
            .iter()
            .map(|(package_id, package_name, creator)| {
                creator.create(
                    config,
                    PackageComms::new(comms.clone(), package_id.clone(), PackageType::Output),
                )
            })
            .collect::<Result<Vec<_>>>()?;

        let init = InitPackages::new(init);
        let step = StepPackages::new(context, state, output);

        Ok(Packages { init, step })
    }

    pub fn get_output_persistence_config(
        &self,
        exp_config: &crate::ExperimentConfig<ExperimentRunBase>,
        globals: &crate::hash_types::Properties,
    ) -> Result<OutputPackagesSimConfig> {
        let mut map = HashMap::new();
        self.output.iter().for_each(|(id, name, creator)| {
            let config = creator.persistence_config(exp_config, globals)?;
            map.insert(name.clone(), config);
        });
        Ok(OutputPackagesSimConfig { map })
    }

    pub fn get_agent_schema(
        &self,
        exp_config: &crate::ExperimentConfig<ExperimentRunBase>,
        globals: &crate::hash_types::Properties,
    ) -> crate::datastore::prelude::Result<AgentSchema> {
        // TODO OS[24] - RUNTIME BLOCK - need to implement add_agent_state_fields for all packages
        // TODO, should we use enum_dispatch here to remove some duplication
        // TODO is this naming correct, are they agent_state
        let mut field_builder = FieldSpecMapBuilder::new();
        self.init
            .iter()
            .for_each(|(package_id, package_name, creator)| {
                field_builder.source(FieldSource::Package(package_name.clone()));
                creator.add_state_field_specs(exp_config, globals, &mut field_builder)?;
            });

        self.context
            .iter()
            .for_each(|(package_id, package_name, creator)| {
                field_builder.source(FieldSource::Package(package_name.clone()));
                creator.add_state_field_specs(exp_config, globals, &mut field_builder)?;
            });

        self.state
            .iter()
            .for_each(|(package_id, package_name, creator)| {
                field_builder.source(FieldSource::Package(package_name.clone()));
                creator.add_state_field_specs(exp_config, globals, &mut field_builder)?;
            });

        self.output
            .iter()
            .for_each(|(package_id, package_name, creator)| {
                field_builder.source(FieldSource::Package(package_name.clone()));
                creator.add_state_field_specs(exp_config, globals, &mut field_builder)?;
            });

        add_base_agent_fields(&mut field_builder)?;

        AgentSchema::new(field_builder.build())
    }

    pub fn get_context_schema(
        &self,
        exp_config: &crate::ExperimentConfig<ExperimentRunBase>,
        globals: &crate::hash_types::Properties,
    ) -> std::result::Result<ContextSchema, crate::datastore::prelude::Error> {
        let mut field_builder = FieldSpecMapBuilder::new();

        self.context
            .iter()
            .for_each(|(package_id, package_name, creator)| {
                field_builder.source(FieldSource::Package(package_name.clone()));
                creator.add_context_field_specs(exp_config, globals, &mut field_builder)?;
            });

        add_base_context_fields(&mut field_builder);

        ContextSchema::new(field_builder.build())
    }
}

pub const PREVIOUS_INDEX_COLUMN_NAME: &str = "__previous_index";
pub const PREVIOUS_INDEX_COLUMN_INDEX: usize = 0;

pub const CONTEXT_INDEX_COLUMN_NAME: &str = "__context_index";
pub const CONTEXT_INDEX_COLUMN_INDEX: usize = 1;

fn add_base_agent_fields(field_builder: &mut FieldSpecMapBuilder) -> Result<()> {
    field_builder.source(FieldSource::Engine);
    use crate::hash_types::state::AgentStateField::*;
    let used = [
        AgentId, AgentName, Position, Direction, Velocity, Shape, Height, Scale, Color, RGB, Hidden,
    ];
    for field in used {
        let field_type: FieldType = field.clone().try_into()?;
        field_builder.add_field_spec(field.name().into(), field_type, FieldScope::Agent)?;
    }

    // This key is required for accessing neighbors' outboxes (new inboxes).
    // Since the neighbor agent state is always the previous step state of the
    // agent, then we need to know where its outbox is. This would be
    // straightforward if we didn't add/remove/move agents between batches.
    // This means `AgentBatch` ordering gets changed at the beginning of the step
    // meaning agents are not aligned with their `OutboxBatch` anymore.
    #[must_use]
    // TODO migrate this to be logic handled by the Engine
    pub fn last_state_index_key() -> FieldSpec {
        // There are 2 indices for every agent: 1) Group index 2) Row (agent) index. This points
        // to the relevant old outbox (i.e. new inbox)
        FieldSpec::new_built_in(
            crate::datastore::schema::PREVIOUS_INDEX_COLUMN_NAME,
            FieldType::new(
                FieldTypeVariant::FixedLengthArray {
                    kind: Box::new(FieldType::new(
                        FieldTypeVariant::Preset(PresetFieldType::Index),
                        false,
                    )),
                    len: 2,
                },
                // This key is nullable because new agents
                // do not get an index (their outboxes are empty by default)
                true,
            ),
        )
    }

    // This key is required for agents to access their context. Since agent
    // batches may be arbitrarily shuffled after context is written, then we
    // need a way to keep track.
    #[must_use]
    // TODO migrate this to be logic handled by the Engine
    pub fn context_index_key() -> FieldSpec {
        FieldSpec::new_built_in(
            CONTEXT_INDEX_COLUMN_NAME,
            FieldType::new(
                FieldTypeVariant::Preset(PresetFieldType::Index),
                // This key is not nullable because all agents have a context
                false,
            ),
        )
    }

    let ctx_index = context_index_key();
    let last_state_index = last_state_index_key();

    field_builder.add_field_spec(
        ctx_index.name().into(),
        ctx_index.field_type,
        FieldScope::Hidden,
    )?;
    field_builder.add_field_spec(
        last_state_index.name().into(),
        last_state_index.field_type,
        FieldScope::Hidden,
    )?;

    Ok(())
}

fn add_base_context_fields(field_builder: &mut FieldSpecMapBuilder) -> Result<()> {
    field_builder.source(FieldSource::Engine);
    // Doesn't do anything for now
    Ok(())
}
