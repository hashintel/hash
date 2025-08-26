use alloc::sync::Arc;
use core::error::Error;
use std::collections::HashMap;

use error_stack::{Report, ResultExt as _, TryReportIteratorExt as _};
use hash_graph_authorization::policies::store::PrincipalStore as _;
use hash_graph_store::{
    entity_type::{EntityTypeStore as _, GetEntityTypesParams, IncludeEntityTypeOption},
    filter::Filter,
    pool::StorePool as _,
    subgraph::temporal_axes::QueryTemporalAxesUnresolved,
};
use hash_graph_test_data::seeding::{
    context::StageId,
    distributions::{
        property::{
            BoundPropertyDistribution, BoundPropertyObjectDistribution,
            EntityObjectDistributionRegistry, PropertyDistribution, PropertyDistributionRegistry,
            PropertyObjectDistribution,
        },
        value::{ValueDistribution, ValueDistributionRegistry},
    },
    producer::entity_type::{EntityTypeCatalog, EntityTypeProducerDeps},
};
use rand::{Rng, seq::IndexedRandom as _};
use type_system::{
    ontology::{
        data_type::schema::DataTypeReference,
        entity_type::{EntityTypeUuid, schema::EntityTypeReference},
        property_type::schema::PropertyTypeReference,
        provenance::OntologyOwnership,
    },
    principal::{actor::ActorEntityUuid, actor_group::WebId},
};

use super::{Runner, web_catalog::InMemoryWebCatalog};
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
    #[display("Failed to create entity type catalog")]
    CreateCatalog,
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

        let pool = runner
            .ensure_db()
            .await
            .change_context(EntityTypeError::Persist)?;

        let mut store = pool
            .acquire(None)
            .await
            .change_context(EntityTypeError::Persist)?;

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

#[derive(Debug, derive_more::Display)]
pub enum EntityTypeCatalogError {
    #[display("Empty data type catalog")]
    EmptyCatalog,
}

impl Error for EntityTypeCatalogError {}

/// Simple in-memory implementation of [`EntityTypeCatalog`].
#[derive(Debug, Clone)]
pub struct InMemoryEntityTypeCatalog {
    entity_types: Vec<EntityTypeReference>,
}

impl InMemoryEntityTypeCatalog {
    /// Create a new catalog from a collection of entity type references.
    ///
    /// # Errors
    ///
    /// Returns an error if the catalog is empty.
    pub fn new(entity_types: Vec<EntityTypeReference>) -> Result<Self, EntityTypeCatalogError> {
        if entity_types.is_empty() {
            return Err(EntityTypeCatalogError::EmptyCatalog);
        }

        Ok(Self { entity_types })
    }
}

impl EntityTypeCatalog for InMemoryEntityTypeCatalog {
    fn entity_type_references(&self) -> &[EntityTypeReference] {
        &self.entity_types
    }

    fn sample_entity_type<R: Rng + ?Sized>(&self, rng: &mut R) -> &EntityTypeReference {
        // Uniform selection from available data types using SliceRandom::choose
        self.entity_types
            .choose(rng)
            .unwrap_or_else(|| unreachable!("catalog should not be empty"))
    }
}
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BuildEntityTypeCatalogStage {
    pub id: String,
    pub input: String,
}

impl BuildEntityTypeCatalogStage {
    pub fn execute(&self, runner: &mut Runner) -> Result<usize, Report<EntityTypeError>> {
        let entity_types = runner
            .resources
            .entity_types
            .get(&self.input)
            .ok_or_else(|| {
                Report::new(EntityTypeError::MissingConfig {
                    name: self.input.clone(),
                })
            })?;

        let catalog = InMemoryEntityTypeCatalog::new(
            entity_types
                .iter()
                .map(|params| EntityTypeReference {
                    url: params.schema.id.clone(),
                })
                .collect::<Vec<_>>(),
        )
        .change_context(EntityTypeError::CreateCatalog)?;

        let len = catalog.entity_type_references().len();

        runner
            .resources
            .entity_type_catalogs
            .insert(self.id.clone(), catalog);

        Ok(len)
    }
}

#[derive(Debug)]
pub struct InMemoryValueRegistry {
    values: HashMap<DataTypeReference, ValueDistribution<'static>>,
}

impl ValueDistributionRegistry for InMemoryValueRegistry {
    fn get_distribution(&self, url: &DataTypeReference) -> Option<&ValueDistribution<'_>> {
        self.values.get(url)
    }
}

#[derive(Debug)]
pub struct InMemoryPropertyRegistry {
    properties: HashMap<
        PropertyTypeReference,
        BoundPropertyDistribution<'static, Arc<InMemoryValueRegistry>>,
    >,
}

impl PropertyDistributionRegistry for InMemoryPropertyRegistry {
    type ValueDistributionRegistry = Arc<InMemoryValueRegistry>;

    fn get_distribution(
        &self,
        url: &PropertyTypeReference,
    ) -> Option<&BoundPropertyDistribution<'static, Arc<InMemoryValueRegistry>>> {
        self.properties.get(url)
    }
}

#[derive(Debug)]
pub struct InMemoryEntityObjectRegistry {
    entities: HashMap<
        EntityTypeReference,
        BoundPropertyObjectDistribution<'static, Arc<InMemoryPropertyRegistry>>,
    >,
}

impl EntityObjectDistributionRegistry for InMemoryEntityObjectRegistry {
    type PropertyDistributionRegistry = Arc<InMemoryPropertyRegistry>;

    fn get_distribution(
        &self,
        url: &EntityTypeReference,
    ) -> Option<&BoundPropertyObjectDistribution<'static, Arc<InMemoryPropertyRegistry>>> {
        self.entities.get(url)
    }
}

#[derive(Debug, derive_more::Display)]
pub enum BuildEntityTypeRegistryError {
    #[display("Missing entity type config: {name}")]
    MissingConfig { name: String },
    #[display("Failed to read entity types")]
    ReadEntityTypes,
    #[display("Failed to create data type distributions")]
    CreateDataTypeDistributions,
    #[display("Failed to create property type distributions")]
    CreatePropertyTypeDistributions,
}

impl Error for BuildEntityTypeRegistryError {}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BuildEntityTypeRegistryInputs {
    pub entity_types: Vec<String>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BuildEntityTypeRegistryStage {
    pub id: String,
    pub inputs: BuildEntityTypeRegistryInputs,
}

impl BuildEntityTypeRegistryStage {
    pub async fn execute(
        &self,
        runner: &mut Runner,
    ) -> Result<usize, Report<[BuildEntityTypeRegistryError]>> {
        let mut all_entity_types = Vec::new();
        for entity_type_key in &self.inputs.entity_types {
            all_entity_types.extend(
                runner
                    .resources
                    .entity_type_catalogs
                    .get(entity_type_key)
                    .ok_or_else(|| {
                        Report::new(BuildEntityTypeRegistryError::MissingConfig {
                            name: entity_type_key.clone(),
                        })
                    })?
                    .entity_type_references()
                    .iter()
                    .map(|entity_type_reference| {
                        EntityTypeUuid::from_url(&entity_type_reference.url)
                    }),
            );
        }

        let pool = runner
            .ensure_db()
            .await
            .change_context(BuildEntityTypeRegistryError::ReadEntityTypes)?;

        let store = pool
            .acquire(None)
            .await
            .change_context(BuildEntityTypeRegistryError::ReadEntityTypes)?;

        let get_entity_types_response = store
            .get_entity_types(
                ActorEntityUuid::public_actor(),
                GetEntityTypesParams {
                    filter: Filter::for_entity_type_uuids(&all_entity_types),
                    temporal_axes: QueryTemporalAxesUnresolved::default(),
                    include_drafts: false,
                    after: None,
                    limit: None,
                    include_count: false,
                    include_entity_types: Some(IncludeEntityTypeOption::Resolved),
                    include_web_ids: false,
                    include_edition_created_by_ids: false,
                },
            )
            .await
            .change_context(BuildEntityTypeRegistryError::ReadEntityTypes)?;

        drop(store);

        let (data_types, property_types) = get_entity_types_response
            .definitions
            .map(|definitions| (definitions.data_types, definitions.property_types))
            .unwrap_or_default();

        let value_registry = Arc::new(InMemoryValueRegistry {
            values: data_types
                .into_iter()
                .map(|(url, data_type)| {
                    ValueDistribution::try_from(data_type.schema)
                        .map(|distribution| (DataTypeReference { url }, distribution))
                })
                .try_collect_reports::<HashMap<_, _>>()
                .change_context(BuildEntityTypeRegistryError::CreateDataTypeDistributions)?,
        });

        let property_registry = Arc::new(InMemoryPropertyRegistry {
            properties: property_types
                .into_iter()
                .map(|(url, property_type)| {
                    PropertyDistribution::try_from(property_type).map(|distribution| {
                        (
                            PropertyTypeReference { url },
                            distribution.bind(Arc::clone(&value_registry)),
                        )
                    })
                })
                .try_collect_reports::<HashMap<_, _>>()
                .change_context(BuildEntityTypeRegistryError::CreatePropertyTypeDistributions)?,
        });

        let entity_object_registry = InMemoryEntityObjectRegistry {
            entities: get_entity_types_response
                .closed_entity_types
                .map(|entity_types| {
                    entity_types
                        .into_iter()
                        .map(|entity_type| {
                            (
                                EntityTypeReference {
                                    url: entity_type.id.clone(),
                                },
                                PropertyObjectDistribution::from(entity_type)
                                    .bind(Arc::clone(&property_registry)),
                            )
                        })
                        .collect::<HashMap<_, _>>()
                })
                .unwrap_or_default(),
        };

        let len = entity_object_registry.entities.len();
        runner
            .resources
            .entity_object_catalogs
            .insert(self.id.clone(), entity_object_registry);

        Ok(len)
    }
}
