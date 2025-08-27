use core::error::Error;
use std::collections::HashMap;

use error_stack::{Report, ResultExt as _};
use hash_graph_store::{entity::EntityStore as _, pool::StorePool as _};
use hash_graph_test_data::seeding::{context::StageId, producer::entity::EntityProducerDeps};
use type_system::principal::{actor::ActorEntityUuid, actor_group::WebId};

use super::{Runner, web_catalog::InMemoryWebCatalog};
use crate::config;

#[derive(Debug, derive_more::Display)]
pub enum EntityError {
    #[display("Missing entity type config: {name}")]
    MissingConfig { name: String },
    #[display("Unknown user catalog: {name}")]
    UnknownUserCatalog { name: String },
    #[display("Unknown entity type catalog: {name}")]
    UnknownEntityTypeCatalog { name: String },
    #[display("Unknown entity object registry: {name}")]
    UnknownEntityObjectRegistry { name: String },
    #[display("Failed to create entity type producer")]
    CreateProducer,
    #[display("Failed to persist entity types to the database")]
    Persist,
    #[display("Missing owner for web: {web_id}")]
    MissingOwner { web_id: WebId },
}

impl Error for EntityError {}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EntityInputs {
    pub user_catalog: String,
    pub entity_type_catalog: String,
    pub entity_object_registry: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GenerateEntitiesStage {
    pub id: String,
    pub config_ref: String,
    pub inputs: EntityInputs,
    pub count: usize,
    #[serde(default)]
    pub stage_id: Option<u16>,
}

impl GenerateEntitiesStage {
    pub fn execute(&self, runner: &mut Runner) -> Result<usize, Report<EntityError>> {
        let id = &self.id;
        let cfg = config::ENTITY_PRODUCER_CONFIGS
            .get(&self.config_ref)
            .ok_or_else(|| {
                Report::new(EntityError::MissingConfig {
                    name: self.config_ref.clone(),
                })
            })?;

        let user_catalog = runner
            .resources
            .user_catalogs
            .get(&self.inputs.user_catalog)
            .ok_or_else(|| {
                Report::new(EntityError::UnknownUserCatalog {
                    name: self.inputs.user_catalog.clone(),
                })
            })?;

        let entity_type_catalog = runner
            .resources
            .entity_type_catalogs
            .get(&self.inputs.entity_type_catalog)
            .ok_or_else(|| {
                Report::new(EntityError::UnknownEntityTypeCatalog {
                    name: self.inputs.entity_type_catalog.clone(),
                })
            })?;

        let entity_object_registry = runner
            .resources
            .entity_object_catalogs
            .get(&self.inputs.entity_object_registry)
            .ok_or_else(|| {
                Report::new(EntityError::UnknownEntityObjectRegistry {
                    name: self.inputs.entity_object_registry.clone(),
                })
            })?;

        let deps = EntityProducerDeps {
            user_catalog: Some(user_catalog),
            org_catalog: None::<&InMemoryWebCatalog>,
            entity_type_catalog,
            entity_object_registry,
        };

        let stage_id = self
            .stage_id
            .map_or_else(|| StageId::from_name(&self.id), StageId::new);

        // TODO: implement streaming to avoid loading all entity types into memory at once for
        //       large counts
        let params: Vec<_> = runner
            .run_producer(|| cfg.create_producer(deps), self.count, stage_id)
            .change_context(EntityError::CreateProducer)?
            .collect();

        let len = params.len();
        runner.resources.entities.insert(id.clone(), params);
        Ok(len)
    }
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PersistEntitiesInputs {
    pub entities: Vec<String>,
    pub web_to_user: Vec<String>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PersistEntitiesStage {
    pub id: String,
    pub inputs: PersistEntitiesInputs,
}

impl PersistEntitiesStage {
    pub async fn execute(&self, runner: &mut Runner) -> Result<usize, Report<EntityError>> {
        let mut all_entities: HashMap<WebId, Vec<_>> = HashMap::new();
        for entity_key in &self.inputs.entities {
            let entities = runner.resources.entities.get(entity_key).ok_or_else(|| {
                Report::new(EntityError::MissingConfig {
                    name: entity_key.clone(),
                })
            })?;
            for entity in entities {
                all_entities
                    .entry(entity.web_id)
                    .or_default()
                    .push(entity.clone());
            }
        }

        let pool = runner
            .ensure_db()
            .await
            .change_context(EntityError::Persist)?;

        let mut store = pool
            .acquire(None)
            .await
            .change_context(EntityError::Persist)?;

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
        if all_entities.is_empty() {
            return Ok(0);
        }

        // Persist locals per web, as user
        let mut total_created = 0_usize;
        for (web_id, entities) in all_entities {
            let actor_id = *web_to_user_map
                .get(&web_id)
                .ok_or_else(|| Report::new(EntityError::MissingOwner { web_id }))?;
            total_created += store
                .create_entities(actor_id, entities)
                .await
                .change_context(EntityError::Persist)?
                .len();
        }

        drop(store);

        Ok(total_created)
    }
}
