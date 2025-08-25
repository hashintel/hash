use core::error::Error;
use std::collections::HashMap;

use error_stack::{Report, ResultExt as _};
use hash_graph_authorization::policies::store::PrincipalStore as _;
use hash_graph_store::{data_type::DataTypeStore as _, pool::StorePool as _};
use hash_graph_test_data::seeding::{
    context::StageId,
    producer::{data_type::DataTypeProducerDeps, ontology::InMemoryWebCatalog},
};

use super::Runner;
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

impl GenerateDataTypesStage {
    pub fn execute(&self, runner: &mut Runner) -> Result<usize, Report<DataTypeError>> {
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
        Ok(len)
    }
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PersistDataTypesInputs {
    pub data_types: Vec<String>,
    pub web_to_user: Vec<String>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PersistDataTypesStage {
    pub id: String,
    pub inputs: PersistDataTypesInputs,
}

impl PersistDataTypesStage {
    pub async fn execute(&self, runner: &mut Runner) -> Result<usize, Report<DataTypeError>> {
        // Merge data types from multiple sources (consume from resources)
        let mut all_params = Vec::new();
        for key in &self.inputs.data_types {
            if let Some(vals) = runner.resources.data_types.remove(key) {
                all_params.extend(vals);
            }
        }

        // Ensure DB and acquire fetching store
        let pool = runner
            .ensure_db()
            .await
            .change_context(DataTypeError::Persist)?;
        let mut store = pool
            .acquire_owned(None)
            .await
            .change_context(DataTypeError::Persist)?;

        // System machine for remote types
        let machine_id = store
            .get_or_create_system_machine("h")
            .await
            .change_context(DataTypeError::Persist)?;

        // Build web->user map from provided user resources
        let mut web_actor_by_web: HashMap<
            type_system::principal::actor_group::WebId,
            type_system::principal::actor::ActorEntityUuid,
        > = HashMap::new();
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
        for param in all_params {
            match param.ownership {
                type_system::ontology::provenance::OntologyOwnership::Local { web_id } => {
                    local_by_web.entry(web_id).or_default().push(param);
                }
                type_system::ontology::provenance::OntologyOwnership::Remote { .. } => {
                    remote_params.push(param);
                }
            }
        }

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

        Ok(total_created)
    }
}
