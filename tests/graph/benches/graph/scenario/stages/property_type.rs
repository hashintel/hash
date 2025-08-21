use core::error::Error;
use std::collections::HashMap;

use error_stack::{Report, ResultExt as _};
use hash_graph_authorization::policies::store::PrincipalStore as _;
use hash_graph_store::{pool::StorePool as _, property_type::PropertyTypeStore as _};
use hash_graph_test_data::seeding::{
    context::StageId,
    distributions::ontology::property_type::values::{
        DataTypeCatalog as _, InMemoryDataTypeCatalog,
    },
    producer::{ontology::InMemoryWebCatalog, property_type::PropertyTypeProducerDeps},
};
use type_system::{
    ontology::{data_type::schema::DataTypeReference, provenance::OntologyOwnership},
    principal::{actor::ActorEntityUuid, actor_group::WebId},
};

use super::Runner;
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
    #[display("Empty data type catalog - cannot generate property types")]
    EmptyDataTypeCatalog,
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

impl GeneratePropertyTypesStage {
    pub fn execute(&self, runner: &mut Runner) -> Result<usize, Report<PropertyTypeError>> {
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
        let params: Vec<_> = runner
            .run_producer(|| cfg.create_producer(&deps), self.count, stage_id)
            .change_context(PropertyTypeError::CreateProducer)?
            .collect();

        let len = params.len();
        runner.resources.property_types.insert(id.clone(), params);
        Ok(len)
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

impl PersistPropertyTypesStage {
    pub async fn execute(&self, runner: &mut Runner) -> Result<usize, Report<PropertyTypeError>> {
        let pool = runner
            .ensure_db()
            .await
            .change_context(PropertyTypeError::Persist)?;

        let mut store = pool
            .acquire(None)
            .await
            .change_context(PropertyTypeError::Persist)?;

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

        // Get web-to-user mapping for permissions
        let mut web_to_user_map: HashMap<WebId, ActorEntityUuid> = HashMap::new();
        for web_to_user_key in &self.inputs.web_to_user {
            if let Some(users) = runner.resources.users.get(web_to_user_key) {
                for user in users {
                    web_to_user_map.insert(user.id.into(), user.id.into());
                }
            }
        }

        // Check if we have any property types to persist
        if all_property_types.is_empty() {
            return Ok(0);
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

        // Persist locals per web, as user
        let mut total_created = 0_usize;
        for (web_id, group) in local_by_web {
            let actor_id = *web_to_user_map
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

        Ok(total_created)
    }
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BuildDataTypeCatalogStage {
    pub id: String,
    pub input: String,
}

impl BuildDataTypeCatalogStage {
    pub fn execute(&self, runner: &mut Runner) -> Result<usize, Report<PropertyTypeError>> {
        let data_types = runner
            .resources
            .data_types
            .get(&self.input)
            .ok_or_else(|| {
                Report::new(PropertyTypeError::MissingConfig {
                    name: self.input.clone(),
                })
            })?;

        // Check for empty data types before creating catalog
        if data_types.is_empty() {
            return Err(Report::new(PropertyTypeError::EmptyDataTypeCatalog));
        }

        let catalog = InMemoryDataTypeCatalog::new(
            data_types
                .iter()
                .map(|params| DataTypeReference {
                    url: params.schema.id.clone(),
                })
                .collect::<Vec<_>>(),
        )
        .change_context(PropertyTypeError::EmptyDataTypeCatalog)?;

        let len = catalog.data_type_references().len();

        runner
            .resources
            .data_type_catalogs
            .insert(self.id.clone(), catalog);

        Ok(len)
    }
}
