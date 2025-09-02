use core::error::Error;
use std::collections::HashMap;

use error_stack::{Report, ResultExt as _};
use hash_graph_authorization::policies::store::PrincipalStore as _;
use hash_graph_store::{data_type::DataTypeStore as _, pool::StorePool as _};
use hash_graph_test_data::seeding::{
    context::StageId,
    producer::data_type::{DataTypeCatalog, DataTypeProducerDeps},
};
use rand::{Rng, seq::IndexedRandom as _};
use type_system::{
    ontology::data_type::schema::DataTypeReference,
    principal::{actor::ActorEntityUuid, actor_group::WebId},
};

use super::{Runner, web_catalog::InMemoryWebCatalog};
use crate::config;

#[derive(Debug, derive_more::Display)]
pub enum DataTypeError {
    #[display("Missing data type config: {name}")]
    MissingConfig { name: String },
    #[display("Failed to create data type producer")]
    CreateProducer,
    #[display("Failed to persist data types to the database")]
    Persist,
    #[display("Missing owner for web: {web_id}")]
    MissingOwner {
        web_id: type_system::principal::actor_group::WebId,
    },
    #[display("Failed to create data type catalog")]
    CreateCatalog,
}

impl Error for DataTypeError {}

#[derive(Debug, Default, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DataTypeInputs {
    #[serde(default)]
    pub user_catalog: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GenerateDataTypesStage {
    pub id: String,
    pub config_ref: String,
    #[serde(default)]
    pub inputs: DataTypeInputs,
    pub count: usize,
    #[serde(default)]
    pub stage_id: Option<u16>,
}

#[derive(Debug, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GenerateDataTypesResult {
    pub created_data_types: usize,
}

impl GenerateDataTypesStage {
    pub fn execute(
        &self,
        runner: &mut Runner,
    ) -> Result<GenerateDataTypesResult, Report<DataTypeError>> {
        let id = &self.id;
        let cfg = config::DATA_TYPE_PRODUCER_CONFIGS
            .get(&self.config_ref)
            .ok_or_else(|| {
                Report::new(DataTypeError::MissingConfig {
                    name: self.config_ref.clone(),
                })
            })?;

        // Use a single pre-merged user catalog if provided
        let user_catalog = self
            .inputs
            .user_catalog
            .as_ref()
            .and_then(|key| runner.resources.user_catalogs.get(key))
            .cloned();

        let deps = DataTypeProducerDeps {
            user_catalog: user_catalog.as_ref(),
            org_catalog: None::<&InMemoryWebCatalog>,
        };

        let stage_id = self
            .stage_id
            .map_or_else(|| StageId::from_name(&self.id), StageId::new);

        // Generate all params first to avoid borrow conflicts
        // TODO: implement streaming to avoid loading all data types into memory at once for large
        //       counts
        let params: Vec<_> = runner
            .run_producer(|| cfg.create_producer(deps), self.count, stage_id)
            .change_context(DataTypeError::CreateProducer)?
            .collect();

        let len = params.len();
        runner.resources.data_types.insert(id.clone(), params);
        Ok(GenerateDataTypesResult {
            created_data_types: len,
        })
    }
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PersistDataTypesInputs {
    pub data_types: Vec<String>,
    pub web_to_user: Vec<String>,
}

#[derive(Debug, Default, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PersistDataTypesResult {
    pub persisted_data_types: usize,
    pub local_webs: usize,
    pub local_data_types: usize,
    pub remote_data_types: usize,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PersistDataTypesStage {
    pub id: String,
    pub inputs: PersistDataTypesInputs,
}

impl PersistDataTypesStage {
    pub async fn execute(
        &self,
        runner: &mut Runner,
    ) -> Result<PersistDataTypesResult, Report<DataTypeError>> {
        let mut all_data_types = Vec::new();
        for data_type_key in &self.inputs.data_types {
            let data_types = runner
                .resources
                .data_types
                .get(data_type_key)
                .ok_or_else(|| {
                    Report::new(DataTypeError::MissingConfig {
                        name: data_type_key.clone(),
                    })
                })?;
            all_data_types.extend_from_slice(data_types);
        }

        // Ensure DB and acquire fetching store
        let pool = runner
            .ensure_db()
            .await
            .change_context(DataTypeError::Persist)?;
        let mut store = pool
            .acquire(None)
            .await
            .change_context(DataTypeError::Persist)?;

        // System machine for remote types
        let machine_id = store
            .get_or_create_system_machine("h")
            .await
            .change_context(DataTypeError::Persist)?;

        // Build web->user map from provided user resources
        let mut web_actor_by_web: HashMap<WebId, ActorEntityUuid> = HashMap::new();
        for user_key in &self.inputs.web_to_user {
            let Some(users) = runner.resources.users.get(user_key) else {
                return Err(Report::new(DataTypeError::MissingConfig {
                    name: user_key.clone(),
                }));
            };

            for user in users {
                web_actor_by_web.insert(user.id.into(), user.id.into());
            }
        }

        // Partition by ownership only
        let mut local_by_web: HashMap<type_system::principal::actor_group::WebId, Vec<_>> =
            HashMap::new();
        let mut remote_params = Vec::new();
        for param in all_data_types {
            match param.ownership {
                type_system::ontology::provenance::OntologyOwnership::Local { web_id } => {
                    local_by_web.entry(web_id).or_default().push(param);
                }
                type_system::ontology::provenance::OntologyOwnership::Remote { .. } => {
                    remote_params.push(param);
                }
            }
        }

        let local_webs = local_by_web.len();
        let remote_data_types = remote_params.len();

        // Persist locals per web, as user
        let mut total_created = 0_usize;
        for (web_id, group) in local_by_web {
            let actor_id = *web_actor_by_web
                .get(&web_id)
                .ok_or_else(|| Report::new(DataTypeError::MissingOwner { web_id }))?;
            total_created += store
                .create_data_types(actor_id, group)
                .await
                .change_context(DataTypeError::Persist)?
                .len();
        }

        // Persist remotes as system machine
        if !remote_params.is_empty() {
            total_created += store
                .create_data_types(machine_id.into(), remote_params)
                .await
                .change_context(DataTypeError::Persist)?
                .len();
        }
        drop(store);

        Ok(PersistDataTypesResult {
            persisted_data_types: total_created,
            local_webs,
            local_data_types: total_created - remote_data_types,
            remote_data_types,
        })
    }
}

#[derive(Debug, derive_more::Display)]
pub enum DataTypeCatalogError {
    #[display("Empty data type catalog")]
    EmptyCatalog,
}

impl Error for DataTypeCatalogError {}

/// Simple in-memory implementation of [`DataTypeCatalog`].
#[derive(Debug, Clone)]
pub struct InMemoryDataTypeCatalog {
    data_types: Vec<DataTypeReference>,
}

impl InMemoryDataTypeCatalog {
    /// Create a new catalog from a collection of data type references.
    ///
    /// # Errors
    ///
    /// Returns an error if the catalog is empty.
    pub fn new(data_types: Vec<DataTypeReference>) -> Result<Self, DataTypeCatalogError> {
        if data_types.is_empty() {
            return Err(DataTypeCatalogError::EmptyCatalog);
        }

        Ok(Self { data_types })
    }
}

impl DataTypeCatalog for InMemoryDataTypeCatalog {
    fn data_type_references(&self) -> &[DataTypeReference] {
        &self.data_types
    }

    fn sample_data_type<R: Rng + ?Sized>(&self, rng: &mut R) -> &DataTypeReference {
        // Uniform selection from available data types using SliceRandom::choose
        self.data_types
            .choose(rng)
            .unwrap_or_else(|| unreachable!("catalog should not be empty"))
    }
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BuildDataTypeCatalogStage {
    pub id: String,
    pub input: Vec<String>,
}

#[derive(Debug, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BuildDataTypeCatalogResult {
    pub collected_data_types: usize,
}

impl BuildDataTypeCatalogStage {
    pub fn execute(
        &self,
        runner: &mut Runner,
    ) -> Result<BuildDataTypeCatalogResult, Report<DataTypeError>> {
        let mut data_type_ids = Vec::new();
        for input in &self.input {
            let data_types = runner.resources.data_types.get(input).ok_or_else(|| {
                Report::new(DataTypeError::MissingConfig {
                    name: input.clone(),
                })
            })?;
            data_type_ids.extend(data_types.iter().map(|params| DataTypeReference {
                url: params.schema.id.clone(),
            }));
        }

        let catalog = InMemoryDataTypeCatalog::new(data_type_ids)
            .change_context(DataTypeError::CreateCatalog)?;

        let len = catalog.data_type_references().len();

        runner
            .resources
            .data_type_catalogs
            .insert(self.id.clone(), catalog);

        Ok(BuildDataTypeCatalogResult {
            collected_data_types: len,
        })
    }
}
