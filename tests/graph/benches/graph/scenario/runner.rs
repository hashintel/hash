extern crate alloc;
use std::{collections::HashMap, fs::File, io::BufReader, path::Path, time::Instant};

use error_stack::{IntoReport, Report, ResultExt as _};
use hash_graph_authorization::policies::store::PolicyStore as _;
use hash_graph_postgres_store::{
    Environment, load_env,
    store::{
        DatabaseConnectionInfo, DatabasePoolConfig, DatabaseType, PostgresStorePool,
        PostgresStoreSettings,
    },
};
use hash_graph_store::{
    data_type::CreateDataTypeParams, entity_type::CreateEntityTypeParams,
    migration::StoreMigration as _, pool::StorePool as _, property_type::CreatePropertyTypeParams,
};
use hash_graph_test_data::seeding::{
    context::{ProduceContext, Provenance, RunId, ShardId, StageId},
    distributions::ontology::{
        entity_type::properties::InMemoryPropertyTypeCatalog,
        property_type::values::InMemoryDataTypeCatalog,
    },
    producer::{Producer, ProducerExt as _, ontology::InMemoryWebCatalog, user::UserCreation},
};
use hash_graph_type_fetcher::FetchingPool;
use rayon::iter::{IntoParallelIterator as _, ParallelIterator as _};
use regex::Regex;
use tokio_postgres::NoTls;
use type_system::ontology::json_schema::DomainValidator;

use super::stages::{Stage, StageError};

type InnerPool = hash_graph_postgres_store::store::PostgresStorePool;
type Pool = FetchingPool<InnerPool, (String, u16)>;

#[derive(Debug, derive_more::Display)]
pub enum ScenarioError {
    #[display("Failed to load scenario file")]
    Io,
    #[display("Failed to parse scenario file")]
    Parse,
    #[display("Failed to create data type producer")]
    CreateProducer,
    #[display("Generation failed")]
    Generate,
    #[display("Database error")]
    Db,
}

impl core::error::Error for ScenarioError {}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Scenario {
    pub run_id: u16,
    pub num_shards: u16,
    pub stages: Vec<Stage>,
}

pub async fn run_scenario_file(path: &Path) -> Result<ScenarioResult, Report<ScenarioError>> {
    let file = File::open(path).change_context(ScenarioError::Io)?;
    let reader = BufReader::new(file);
    let scenario: Scenario =
        serde_json::from_reader(reader).change_context(ScenarioError::Parse)?;
    run_scenario(&scenario)
        .await
        .change_context(ScenarioError::Parse)
}

pub async fn run_scenario(scenario: &Scenario) -> Result<ScenarioResult, Report<StageError>> {
    let mut runner = Runner::new(RunId::new(scenario.run_id), scenario.num_shards);
    Ok(ScenarioResult {
        steps: {
            let mut out = Vec::with_capacity(scenario.stages.len());
            for stage in &scenario.stages {
                let start = Instant::now();
                let produced = stage.execute(&mut runner).await?;
                out.push(StepMetrics {
                    id: match stage {
                        Stage::ResetDb(stage) => stage.id.clone(),
                        Stage::GenerateUsers(stage) => stage.id.clone(),
                        Stage::PersistUsers(stage) => stage.id.clone(),
                        Stage::WebCatalog(stage) => stage.id.clone(),
                        Stage::GenerateDataTypes(stage) => stage.id.clone(),
                        Stage::PersistDataTypes(stage) => stage.id.clone(),
                        Stage::BuildDataTypeCatalog(stage) => stage.id.clone(),
                        Stage::GeneratePropertyTypes(stage) => stage.id.clone(),
                        Stage::PersistPropertyTypes(stage) => stage.id.clone(),
                        Stage::BuildPropertyTypeCatalog(stage) => stage.id.clone(),
                        Stage::GenerateEntityTypes(stage) => stage.id.clone(),
                        Stage::PersistEntityTypes(stage) => stage.id.clone(),
                    },
                    produced,
                    duration_ms: start.elapsed().as_millis(),
                });
            }
            out
        },
    })
}

#[derive(Debug, serde::Serialize)]
pub struct StepMetrics {
    pub id: String,
    pub produced: usize,
    pub duration_ms: u128,
}

#[derive(Debug, serde::Serialize)]
pub struct ScenarioResult {
    pub steps: Vec<StepMetrics>,
}

#[derive(Debug, Default)]
pub struct Resources {
    pub users: HashMap<String, Vec<UserCreation>>,
    pub user_catalogs: HashMap<String, InMemoryWebCatalog>,
    pub data_types: HashMap<String, Vec<CreateDataTypeParams>>,
    pub data_type_catalogs: HashMap<String, InMemoryDataTypeCatalog>,
    pub property_types: HashMap<String, Vec<CreatePropertyTypeParams>>,
    pub property_type_catalogs: HashMap<String, InMemoryPropertyTypeCatalog>,
    pub entity_types: HashMap<String, Vec<CreateEntityTypeParams>>,
}

pub struct Runner {
    run_id: RunId,
    num_shards: u16,
    pub resources: Resources,
    pub pool: Option<Pool>,
}

impl Runner {
    fn new(run_id: RunId, num_shards: u16) -> Self {
        Self {
            run_id,
            num_shards,
            resources: Resources::default(),
            pool: None,
        }
    }

    pub async fn ensure_db(&mut self) -> Result<&Pool, Report<ScenarioError>> {
        if self.pool.is_some() {
            return Ok(self.pool.as_ref().expect("pool set by setup_db"));
        }

        self.setup_db().await?;
        Ok(self.pool.as_ref().expect("pool set by setup_db"))
    }

    pub(super) async fn setup_db(&mut self) -> Result<(), Report<ScenarioError>> {
        load_env(Environment::Test);

        let user = std::env::var("HASH_GRAPH_PG_USER").unwrap_or_else(|_| "graph".to_owned());
        let password =
            std::env::var("HASH_GRAPH_PG_PASSWORD").unwrap_or_else(|_| "graph".to_owned());
        let host = std::env::var("HASH_GRAPH_PG_HOST").unwrap_or_else(|_| "localhost".to_owned());
        let port = std::env::var("HASH_GRAPH_PG_PORT")
            .ok()
            .and_then(|port| port.parse::<u16>().ok())
            .unwrap_or(5432);
        let database =
            std::env::var("HASH_GRAPH_PG_DATABASE").unwrap_or_else(|_| "graph".to_owned());

        let conn_info = DatabaseConnectionInfo::new(
            DatabaseType::Postgres,
            user,
            password,
            host,
            port,
            database,
        );

        let pool = PostgresStorePool::new(
            &conn_info,
            &DatabasePoolConfig::default(),
            NoTls,
            PostgresStoreSettings::default(),
        )
        .await
        .change_context(ScenarioError::Db)?;

        let mut store = pool.acquire(None).await.change_context(ScenarioError::Db)?;

        if store.run_migrations().await.is_err() {
            let super_user =
                std::env::var("POSTGRES_USER").unwrap_or_else(|_| "postgres".to_owned());
            let super_password =
                std::env::var("POSTGRES_PASSWORD").unwrap_or_else(|_| "postgres".to_owned());
            let super_conn = DatabaseConnectionInfo::new(
                DatabaseType::Postgres,
                super_user,
                super_password,
                conn_info.host().to_owned(),
                conn_info.port(),
                conn_info.database().to_owned(),
            );

            PostgresStorePool::new(
                &super_conn,
                &DatabasePoolConfig::default(),
                NoTls,
                PostgresStoreSettings::default(),
            )
            .await
            .change_context(ScenarioError::Db)?
            .acquire_owned(None)
            .await
            .change_context(ScenarioError::Db)?
            .run_migrations()
            .await
            .change_context(ScenarioError::Db)?;
        }

        store
            .seed_system_policies()
            .await
            .change_context(ScenarioError::Db)?;
        drop(store);

        let allowed = std::env::var("HASH_GRAPH_ALLOWED_URL_DOMAIN_PATTERN")
            .ok()
            .and_then(|pattern| Regex::new(&pattern).ok())
            .unwrap_or_else(|| Regex::new(r"http://localhost:3000/@(?P<shortname>[\w-]+)/types/(?P<kind>(?:data-type)|(?:property-type)|(?:entity-type))/[\w\-_%]+/").expect("valid default regex"));
        let type_fetcher_host = std::env::var("HASH_GRAPH_TYPE_FETCHER_HOST")
            .unwrap_or_else(|_| "127.0.0.1".to_owned());
        let type_fetcher_port = std::env::var("HASH_GRAPH_TYPE_FETCHER_PORT")
            .ok()
            .and_then(|port| port.parse::<u16>().ok())
            .unwrap_or(4455);

        self.pool = Some(FetchingPool::new(
            pool,
            (type_fetcher_host, type_fetcher_port),
            DomainValidator::new(allowed),
        ));

        Ok(())
    }

    #[expect(
        clippy::integer_division,
        clippy::integer_division_remainder_used,
        reason = "Calculation of count per shard"
    )]
    pub(super) fn run_producer<T, P, E>(
        &self,
        make_producer: impl Fn() -> Result<P, E> + Sync,
        total_count: usize,
        stage_id: StageId,
    ) -> Result<impl Iterator<Item = T>, Report<ScenarioError>>
    where
        P: Producer<T, Error: IntoReport> + Send,
        T: Send,
        E: IntoReport,
    {
        let num_shards = usize::from(self.num_shards.max(1));
        let base = total_count / num_shards;
        let remainder = total_count % num_shards;

        Ok((0..self.num_shards)
            .into_par_iter()
            .map(|shard_id| {
                let context = ProduceContext {
                    run_id: self.run_id,
                    stage_id,
                    shard_id: ShardId::new(shard_id),
                    provenance: Provenance::Benchmark,
                    producer: P::ID,
                };

                let shard_index = usize::from(shard_id);
                let take_n = base + usize::from(shard_index < remainder);

                make_producer()
                    .change_context(ScenarioError::CreateProducer)?
                    .iter_mut(context)
                    .take(take_n)
                    .map(|result| result.change_context(ScenarioError::Generate))
                    .collect::<Result<Vec<T>, Report<ScenarioError>>>()
            })
            .collect::<Result<Vec<Vec<T>>, Report<ScenarioError>>>()?
            .into_iter()
            .flatten())
    }
}
