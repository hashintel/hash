use core::error::Error;
use std::collections::HashMap;

use error_stack::{Report, ResultExt as _};
use hash_graph_authorization::policies::store::PrincipalStore as _;
use hash_graph_store::{pool::StorePool as _, property_type::PropertyTypeStore as _};
use hash_graph_test_data::seeding::{
    context::StageId,
    producer::property_type::{PropertyTypeCatalog, PropertyTypeProducerDeps},
};
use rand::{Rng, seq::IndexedRandom as _};
use type_system::{
    ontology::{property_type::schema::PropertyTypeReference, provenance::OntologyOwnership},
    principal::{actor::ActorEntityUuid, actor_group::WebId},
};

use super::{Runner, web_catalog::InMemoryWebCatalog};
use crate::config;

#[derive(Debug, derive_more::Display)]
pub enum PropertyTypeError {
    #[display("Missing property type config: {name}")]
    MissingConfig { name: String },
    #[display("Unknown user catalog: {name}")]
    UnknownUserCatalog { name: String },
    #[display("Unknown data type catalog: {name}")]
    UnknownDataTypeCatalog { name: String },
    #[display("Failed to create property type producer")]
    CreateProducer,
    #[display("Failed to persist property types to the database")]
    Persist,
    #[display("Missing owner for web: {web_id}")]
    MissingOwner {
        web_id: type_system::principal::actor_group::WebId,
    },
    #[display("Failed to create property type catalog")]
    CreateCatalog,
}

impl Error for PropertyTypeError {}

#[derive(Debug, Default, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PropertyTypeInputs {
    #[serde(default)]
    pub user_catalog: Option<String>,
    #[serde(default)]
    pub data_type_catalog: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GeneratePropertyTypesStage {
    pub id: String,
    pub config_ref: String,
    #[serde(default)]
    pub inputs: PropertyTypeInputs,
    pub count: usize,
    #[serde(default)]
    pub stage_id: Option<u16>,
}

#[derive(Debug, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GeneratePropertyTypesResult {
    pub created_property_types: usize,
}

impl GeneratePropertyTypesStage {
    pub fn execute(
        &self,
        runner: &mut Runner,
    ) -> Result<GeneratePropertyTypesResult, Report<PropertyTypeError>> {
        let id = &self.id;
        let cfg = config::PROPERTY_TYPE_PRODUCER_CONFIGS
            .get(&self.config_ref)
            .ok_or_else(|| {
                Report::new(PropertyTypeError::MissingConfig {
                    name: self.config_ref.clone(),
                })
            })?;

        // Use a single pre-merged user catalog if provided
        let user_catalog = self
            .inputs
            .user_catalog
            .as_ref()
            .map(|key| {
                runner.resources.user_catalogs.get(key).ok_or_else(|| {
                    Report::new(PropertyTypeError::UnknownUserCatalog { name: key.clone() })
                })
            })
            .transpose()?;

        // Get data type catalog reference
        let data_type_catalog = self
            .inputs
            .data_type_catalog
            .as_ref()
            .map(|key| {
                runner.resources.data_type_catalogs.get(key).ok_or_else(|| {
                    Report::new(PropertyTypeError::UnknownDataTypeCatalog { name: key.clone() })
                })
            })
            .transpose()?;

        let deps = PropertyTypeProducerDeps {
            user_catalog,
            org_catalog: None::<&InMemoryWebCatalog>,
            data_type_catalog,
        };

        let stage_id = self
            .stage_id
            .map_or_else(|| StageId::from_name(&self.id), StageId::new);

        // Generate all params first to avoid borrow conflicts
        // TODO: implement streaming to avoid loading all property types into memory at once for
        //       large counts
        //   see https://linear.app/hash/issue/H-5222/stream-generated-types-into-the-persister-directly
        let params: Vec<_> = runner
            .run_producer(|| cfg.create_producer(deps), self.count, stage_id)
            .change_context(PropertyTypeError::CreateProducer)?
            .collect();

        let len = params.len();
        runner.resources.property_types.insert(id.clone(), params);
        Ok(GeneratePropertyTypesResult {
            created_property_types: len,
        })
    }
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PersistPropertyTypesInputs {
    pub property_types: Vec<String>,
    pub web_to_user: Vec<String>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PersistPropertyTypesStage {
    pub id: String,
    pub inputs: PersistPropertyTypesInputs,
}

#[derive(Debug, Default, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PersistPropertyTypesResult {
    pub persisted_property_types: usize,
    pub local_webs: usize,
    pub local_property_types: usize,
    pub remote_property_types: usize,
}

impl PersistPropertyTypesStage {
    pub async fn execute(
        &self,
        runner: &mut Runner,
    ) -> Result<PersistPropertyTypesResult, Report<PropertyTypeError>> {
        let mut all_property_types = Vec::new();
        for property_type_key in &self.inputs.property_types {
            let property_types = runner
                .resources
                .property_types
                .get(property_type_key)
                .ok_or_else(|| {
                    Report::new(PropertyTypeError::MissingConfig {
                        name: property_type_key.clone(),
                    })
                })?;
            all_property_types.extend_from_slice(property_types);
        }

        let pool = runner
            .ensure_db()
            .await
            .change_context(PropertyTypeError::Persist)?;

        let mut store = pool
            .acquire(None)
            .await
            .change_context(PropertyTypeError::Persist)?;

        // Build web->user map from provided user resources
        let mut web_actor_by_web: HashMap<WebId, ActorEntityUuid> = HashMap::new();
        for user_key in &self.inputs.web_to_user {
            let Some(users) = runner.resources.users.get(user_key) else {
                return Err(Report::new(PropertyTypeError::MissingConfig {
                    name: user_key.clone(),
                }));
            };

            for user in users {
                web_actor_by_web.insert(user.id.into(), user.id.into());
            }
        }

        // Check if we have any property types to persist
        if all_property_types.is_empty() {
            return Ok(PersistPropertyTypesResult::default());
        }

        // System machine for remote types
        let machine_id = store
            .get_or_create_system_machine("h")
            .await
            .change_context(PropertyTypeError::Persist)?;

        // Partition by ownership
        let mut local_by_web: HashMap<WebId, Vec<_>> = HashMap::new();
        let mut remote_params = Vec::new();

        for params in all_property_types {
            match params.ownership {
                OntologyOwnership::Local { web_id } => {
                    local_by_web.entry(web_id).or_default().push(params);
                }
                OntologyOwnership::Remote { .. } => {
                    remote_params.push(params);
                }
            }
        }

        let local_webs = local_by_web.len();
        let remote_property_types = remote_params.len();

        // Persist locals per web, as user
        let mut total_created = 0_usize;
        for (web_id, group) in local_by_web {
            let actor_id = *web_actor_by_web
                .get(&web_id)
                .ok_or_else(|| Report::new(PropertyTypeError::MissingOwner { web_id }))?;
            total_created += store
                .create_property_types(actor_id, group)
                .await
                .change_context(PropertyTypeError::Persist)?
                .len();
        }

        // Persist remotes as system machine
        if !remote_params.is_empty() {
            total_created += store
                .create_property_types(machine_id.into(), remote_params)
                .await
                .change_context(PropertyTypeError::Persist)?
                .len();
        }
        drop(store);

        Ok(PersistPropertyTypesResult {
            persisted_property_types: total_created,
            local_webs,
            local_property_types: total_created - remote_property_types,
            remote_property_types,
        })
    }
}

#[derive(Debug, derive_more::Display)]
pub enum PropertyTypeCatalogError {
    #[display("Empty data type catalog")]
    EmptyCatalog,
}

impl Error for PropertyTypeCatalogError {}

/// Simple in-memory implementation of [`DataTypeCatalog`].
#[derive(Debug, Clone)]
pub struct InMemoryPropertyTypeCatalog {
    property_types: Vec<PropertyTypeReference>,
}

impl InMemoryPropertyTypeCatalog {
    /// Create a new catalog from a collection of property type references.
    ///
    /// # Errors
    ///
    /// Returns an error if the catalog is empty.
    pub fn new(
        property_types: Vec<PropertyTypeReference>,
    ) -> Result<Self, PropertyTypeCatalogError> {
        if property_types.is_empty() {
            return Err(PropertyTypeCatalogError::EmptyCatalog);
        }

        Ok(Self { property_types })
    }
}

impl PropertyTypeCatalog for InMemoryPropertyTypeCatalog {
    fn property_type_references(&self) -> &[PropertyTypeReference] {
        &self.property_types
    }

    fn sample_property_type<R: Rng + ?Sized>(&self, rng: &mut R) -> &PropertyTypeReference {
        // Uniform selection from available data types using SliceRandom::choose
        self.property_types
            .choose(rng)
            .unwrap_or_else(|| unreachable!("catalog should not be empty"))
    }
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BuildPropertyTypeCatalogStage {
    pub id: String,
    pub input: Vec<String>,
}

#[derive(Debug, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BuildPropertyTypeCatalogResult {
    pub collected_property_types: usize,
}

impl BuildPropertyTypeCatalogStage {
    pub fn execute(
        &self,
        runner: &mut Runner,
    ) -> Result<BuildPropertyTypeCatalogResult, Report<PropertyTypeError>> {
        let mut property_type_ids = Vec::new();
        for input in &self.input {
            let property_types = runner.resources.property_types.get(input).ok_or_else(|| {
                Report::new(PropertyTypeError::MissingConfig {
                    name: input.clone(),
                })
            })?;
            property_type_ids.extend(property_types.iter().map(|params| PropertyTypeReference {
                url: params.schema.id.clone(),
            }));
        }

        let catalog = InMemoryPropertyTypeCatalog::new(property_type_ids)
            .change_context(PropertyTypeError::CreateCatalog)?;

        let len = catalog.property_type_references().len();

        runner
            .resources
            .property_type_catalogs
            .insert(self.id.clone(), catalog);

        Ok(BuildPropertyTypeCatalogResult {
            collected_property_types: len,
        })
    }
}
