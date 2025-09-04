use core::error::Error;
use std::collections::HashMap;

use error_stack::{Report, ResultExt as _};
use hash_graph_store::{entity::EntityStore as _, pool::StorePool as _};
use hash_graph_test_data::seeding::{
    context::StageId,
    producer::entity::{EntityCatalog, EntityProducerDeps},
};
use type_system::{
    knowledge::entity::EntityId,
    ontology::VersionedUrl,
    principal::{actor::ActorEntityUuid, actor_group::WebId},
};

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
    #[display("Unknown entity catalog: {name}")]
    UnknownEntityCatalog { name: String },
    #[display("Failed to create entity type producer")]
    CreateProducer,
    #[display("Failed to persist entity types to the database")]
    Persist,
    #[display("Missing owner for web: {web_id}")]
    MissingOwner { web_id: WebId },
    #[display("Failed to create entity catalog")]
    CreateCatalog,
}

impl Error for EntityError {}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EntityInputs {
    pub user_catalog: String,
    pub entity_type_catalog: String,
    pub entity_object_registry: String,
    pub entity_catalog: Option<String>,
    pub source_link_type_catalog: Option<String>,
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

#[derive(Debug, Default, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GenerateEntitiesResult {
    pub created_entities: usize,
}

impl GenerateEntitiesStage {
    pub fn execute(
        &self,
        runner: &mut Runner,
    ) -> Result<GenerateEntitiesResult, Report<EntityError>> {
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

        let source_link_type_catalog = self
            .inputs
            .source_link_type_catalog
            .as_ref()
            .map(|entity_type_catalog| {
                runner
                    .resources
                    .entity_type_catalogs
                    .get(entity_type_catalog)
                    .ok_or_else(|| {
                        Report::new(EntityError::UnknownEntityTypeCatalog {
                            name: entity_type_catalog.clone(),
                        })
                    })
            })
            .transpose()?;

        let entity_catalog = self
            .inputs
            .entity_catalog
            .as_ref()
            .map(|entity_catalog| {
                runner
                    .resources
                    .entity_catalogs
                    .get(entity_catalog)
                    .ok_or_else(|| {
                        Report::new(EntityError::UnknownEntityCatalog {
                            name: entity_catalog.clone(),
                        })
                    })
            })
            .transpose()?;

        let deps = EntityProducerDeps {
            user_catalog: Some(user_catalog),
            org_catalog: None::<&InMemoryWebCatalog>,
            entity_type_catalog,
            entity_object_registry,
            entity_catalog,
            source_link_type_catalog,
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
        Ok(GenerateEntitiesResult {
            created_entities: len,
        })
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

#[derive(Debug, Default, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PersistEntitiesResult {
    pub persisted_entities: usize,
    pub local_webs: usize,
}

impl PersistEntitiesStage {
    pub async fn execute(
        &self,
        runner: &mut Runner,
    ) -> Result<PersistEntitiesResult, Report<EntityError>> {
        let mut all_entities: HashMap<WebId, Vec<_>> = HashMap::new();
        for entity_key in &self.inputs.entities {
            let entities = runner
                .resources
                .entities
                .remove(entity_key)
                .ok_or_else(|| {
                    Report::new(EntityError::MissingConfig {
                        name: entity_key.clone(),
                    })
                })?;
            for entity in entities {
                all_entities.entry(entity.web_id).or_default().push(entity);
            }
        }

        // Build web->user map from provided user resources
        let mut web_actor_by_web: HashMap<WebId, ActorEntityUuid> = HashMap::new();
        for user_key in &self.inputs.web_to_user {
            let Some(users) = runner.resources.users.get(user_key) else {
                return Err(Report::new(EntityError::MissingConfig {
                    name: user_key.clone(),
                }));
            };

            for user in users {
                web_actor_by_web.insert(user.id.into(), user.id.into());
            }
        }

        // Check if we have any entity types to persist
        if all_entities.is_empty() {
            return Ok(PersistEntitiesResult::default());
        }

        let mut entity_ids_by_type = HashMap::<VersionedUrl, Vec<EntityId>>::new();

        let pool = runner
            .ensure_db()
            .await
            .change_context(EntityError::Persist)?;

        let mut store = pool
            .acquire(None)
            .await
            .change_context(EntityError::Persist)?;

        // Persist locals per web, as user
        let mut total_created = 0;
        for (web_id, entities) in all_entities {
            let actor_id = *web_actor_by_web
                .get(&web_id)
                .ok_or_else(|| Report::new(EntityError::MissingOwner { web_id }))?;
            let created_entities = store
                .create_entities(actor_id, entities)
                .await
                .change_context(EntityError::Persist)?;
            total_created += created_entities.len();

            for entity in created_entities {
                for entity_type in &entity.metadata.entity_type_ids {
                    let id = entity.metadata.record_id.entity_id;
                    if let Some(entity_ids) = entity_ids_by_type.get_mut(entity_type) {
                        entity_ids.push(id);
                    } else {
                        entity_ids_by_type.insert(entity_type.clone(), vec![id]);
                    }
                }
            }
        }

        drop(store);

        runner.resources.entity_catalogs.insert(
            self.id.clone(),
            InMemoryEntityCatalog::new(entity_ids_by_type)
                .change_context(EntityError::CreateCatalog)?,
        );

        Ok(PersistEntitiesResult {
            persisted_entities: total_created,
            local_webs: web_actor_by_web.len(),
        })
    }
}

#[derive(Debug, derive_more::Display)]
pub enum EntityCatalogError {
    #[display("Empty cataloc must not be empty")]
    EmptyCatalog,
}

impl Error for EntityCatalogError {}

#[derive(Debug, Clone)]
pub struct InMemoryEntityCatalog {
    entity_ids_by_type: HashMap<VersionedUrl, Vec<EntityId>>,
}

impl InMemoryEntityCatalog {
    /// Create a new catalog from a collection of entities.
    ///
    /// # Errors
    ///
    /// Returns an error if the catalog is empty.
    pub fn new(
        entity_ids_by_type: HashMap<VersionedUrl, Vec<EntityId>>,
    ) -> Result<Self, EntityCatalogError> {
        if entity_ids_by_type.is_empty() {
            return Err(EntityCatalogError::EmptyCatalog);
        }

        Ok(Self { entity_ids_by_type })
    }
}

impl EntityCatalog for InMemoryEntityCatalog {
    fn entity_ids(&self, entity_type: &VersionedUrl) -> Option<&[EntityId]> {
        self.entity_ids_by_type.get(entity_type).map(|ids| &**ids)
    }
}
