use core::error::Error;
use std::collections::HashMap;

use error_stack::{Report, ResultExt as _};
use hash_graph_authorization::policies::store::PrincipalStore as _;
use hash_graph_store::{entity_type::EntityTypeStore as _, pool::StorePool as _};
use hash_graph_test_data::seeding::{
    context::StageId,
    distributions::ontology::entity_type::properties::InMemoryPropertyTypeCatalog,
    producer::{
        entity_type::{EntityTypeProducerDeps, PropertyTypeCatalog as _},
        ontology::InMemoryWebCatalog,
    },
};
use type_system::{
    ontology::{property_type::schema::PropertyTypeReference, provenance::OntologyOwnership},
    principal::{actor::ActorEntityUuid, actor_group::WebId},
};

use super::Runner;
use crate::config;

#[derive(Debug, derive_more::Display)]
pub enum EntityTypeError {
    #[display("Missing entity type config: {name}")]
    MissingConfig { name: String },
    #[display("Unknown user catalog: {name}")]
    UnknownUserCatalog { name: String },
    #[display("Unknown property type catalog: {name}")]
    UnknownPropertyTypeCatalog { name: String },
    #[display("Failed to create entity type producer")]
    CreateProducer,
    #[display("Failed to persist entity types to the database")]
    Persist,
    #[display("Missing owner for web: {web_id}")]
    MissingOwner { web_id: WebId },
    #[display("Empty property type catalog - cannot generate entity types")]
    EmptyPropertyTypeCatalog,
}

impl Error for EntityTypeError {}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EntityTypeInputs {
    #[serde(default)]
    pub user_catalog: Option<String>,
    #[serde(default)]
    pub property_type_catalog: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GenerateEntityTypesStage {
    pub id: String,
    pub config_ref: String,
    pub inputs: EntityTypeInputs,
    pub count: usize,
    #[serde(default)]
    pub stage_id: Option<u16>,
}

impl GenerateEntityTypesStage {
    pub fn execute(&self, runner: &mut Runner) -> Result<usize, Report<EntityTypeError>> {
        let id = &self.id;
        let cfg = config::ENTITY_TYPE_PRODUCER_CONFIGS
            .get(&self.config_ref)
            .ok_or_else(|| {
                Report::new(EntityTypeError::MissingConfig {
                    name: self.config_ref.clone(),
                })
            })?;

        let user_catalog = self
            .inputs
            .user_catalog
            .as_ref()
            .map(|key| {
                runner.resources.user_catalogs.get(key).ok_or_else(|| {
                    Report::new(EntityTypeError::UnknownUserCatalog { name: key.clone() })
                })
            })
            .transpose()?;

        // Get property type catalog reference
        let property_type_catalog = runner
            .resources
            .property_type_catalogs
            .get(&self.inputs.property_type_catalog)
            .ok_or_else(|| {
                Report::new(EntityTypeError::UnknownPropertyTypeCatalog {
                    name: self.inputs.property_type_catalog.clone(),
                })
            })?;

        let deps = EntityTypeProducerDeps {
            user_catalog,
            org_catalog: None::<&InMemoryWebCatalog>,
            property_type_catalog,
        };

        let stage_id = self
            .stage_id
            .map_or_else(|| StageId::from_name(&self.id), StageId::new);

        // TODO: implement streaming to avoid loading all entity types into memory at once for
        //       large counts
        let params: Vec<_> = runner
            .run_producer(|| cfg.create_producer(deps), self.count, stage_id)
            .change_context(EntityTypeError::CreateProducer)?
            .collect();

        let len = params.len();
        runner.resources.entity_types.insert(id.clone(), params);
        Ok(len)
    }
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PersistEntityTypesInputs {
    pub entity_types: Vec<String>,
    pub web_to_user: Vec<String>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PersistEntityTypesStage {
    pub id: String,
    pub inputs: PersistEntityTypesInputs,
}

impl PersistEntityTypesStage {
    pub async fn execute(&self, runner: &mut Runner) -> Result<usize, Report<EntityTypeError>> {
        let pool = runner
            .ensure_db()
            .await
            .change_context(EntityTypeError::Persist)?;

        let mut store = pool
            .acquire(None)
            .await
            .change_context(EntityTypeError::Persist)?;

        let mut all_entity_types = Vec::new();
        for entity_type_key in &self.inputs.entity_types {
            let entity_types = runner
                .resources
                .entity_types
                .get(entity_type_key)
                .ok_or_else(|| {
                    Report::new(EntityTypeError::MissingConfig {
                        name: entity_type_key.clone(),
                    })
                })?;
            all_entity_types.extend_from_slice(entity_types);
        }

        // Get web-to-user mapping for permissions
        let mut web_to_user_map: HashMap<WebId, ActorEntityUuid> = HashMap::new();
        for web_to_user_key in &self.inputs.web_to_user {
            if let Some(users) = runner.resources.users.get(web_to_user_key) {
                for user in users {
                    web_to_user_map.insert(user.id.into(), user.id.into());
                }
            }
        }

        // Check if we have any entity types to persist
        if all_entity_types.is_empty() {
            return Ok(0);
        }

        // System machine for remote types
        let machine_id = store
            .get_or_create_system_machine("h")
            .await
            .change_context(EntityTypeError::Persist)?;

        // Partition by ownership
        let mut local_by_web: HashMap<WebId, Vec<_>> = HashMap::new();
        let mut remote_params = Vec::new();

        for params in all_entity_types {
            match params.ownership {
                OntologyOwnership::Local { web_id } => {
                    local_by_web.entry(web_id).or_default().push(params);
                }
                OntologyOwnership::Remote { .. } => {
                    remote_params.push(params);
                }
            }
        }

        // Persist locals per web, as user
        let mut total_created = 0_usize;
        for (web_id, group) in local_by_web {
            let actor_id = *web_to_user_map
                .get(&web_id)
                .ok_or_else(|| Report::new(EntityTypeError::MissingOwner { web_id }))?;
            total_created += store
                .create_entity_types(actor_id, group)
                .await
                .change_context(EntityTypeError::Persist)?
                .len();
        }

        // Persist remotes as system machine
        if !remote_params.is_empty() {
            total_created += store
                .create_entity_types(machine_id.into(), remote_params)
                .await
                .change_context(EntityTypeError::Persist)?
                .len();
        }
        drop(store);

        Ok(total_created)
    }
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BuildPropertyTypeCatalogStage {
    pub id: String,
    pub input: String,
}

impl BuildPropertyTypeCatalogStage {
    pub fn execute(&self, runner: &mut Runner) -> Result<usize, Report<EntityTypeError>> {
        let property_types = runner
            .resources
            .property_types
            .get(&self.input)
            .ok_or_else(|| {
                Report::new(EntityTypeError::MissingConfig {
                    name: self.input.clone(),
                })
            })?;

        // Check for empty property types before creating catalog
        if property_types.is_empty() {
            return Err(Report::new(EntityTypeError::EmptyPropertyTypeCatalog));
        }

        let catalog = InMemoryPropertyTypeCatalog::new(
            property_types
                .iter()
                .map(|params| PropertyTypeReference {
                    url: params.schema.id.clone(),
                })
                .collect::<Vec<_>>(),
        )
        .change_context(EntityTypeError::EmptyPropertyTypeCatalog)?;

        let len = catalog.property_type_references().len();

        runner
            .resources
            .property_type_catalogs
            .insert(self.id.clone(), catalog);

        Ok(len)
    }
}
