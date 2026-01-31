extern crate alloc;
use core::sync::atomic::{self, AtomicUsize};
use std::{collections::HashMap, fs::File, io::BufReader, path::Path};

use criterion::{BatchSize, BenchmarkGroup, BenchmarkId, measurement::Measurement};
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
    data_type::CreateDataTypeParams, entity::CreateEntityParams,
    entity_type::CreateEntityTypeParams, filter::protection::PropertyProtectionFilterConfig,
    migration::StoreMigration as _, pool::StorePool as _, property_type::CreatePropertyTypeParams,
};
use hash_graph_test_data::seeding::{
    context::{ProduceContext, Provenance, RunId, ShardId, StageId},
    producer::{Producer, ProducerExt as _, user::UserCreation},
};
use hash_graph_type_fetcher::FetchingPool;
use rayon::iter::{IntoParallelIterator as _, ParallelIterator as _};
use regex::Regex;
use tokio::runtime::Runtime;
use tokio_postgres::NoTls;
use type_system::ontology::json_schema::DomainValidator;

use super::stages::{
    Stage,
    data_type::InMemoryDataTypeCatalog,
    entity::InMemoryEntityCatalog,
    entity_type::{InMemoryEntityObjectRegistry, InMemoryEntityTypeCatalog},
    property_type::InMemoryPropertyTypeCatalog,
    web_catalog::InMemoryWebCatalog,
};
use crate::init_tracing;

type InnerPool = hash_graph_postgres_store::store::PostgresStorePool;
type Pool = FetchingPool<InnerPool, (String, u16)>;

#[derive(Debug, derive_more::Display)]
pub enum ScenarioError {
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
pub struct BenchStage {
    pub name: String,
    pub steps: Vec<Stage>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Scenario {
    pub run_id: u16,
    pub num_shards: u16,
    pub setup: Vec<Stage>,
    pub benches: Vec<BenchStage>,
}

pub fn run_scenario_file<M: Measurement>(
    path: impl AsRef<Path>,
    runtime: &Runtime,
    benchmark_group: &mut BenchmarkGroup<M>,
) {
    let path = path.as_ref();
    let file = File::open(path).expect("Failed to open scenario file");
    let reader = BufReader::new(file);
    let scenario: Scenario = serde_json::from_reader(reader)
        .change_context(ScenarioError::Parse)
        .expect("Failed to parse scenario file");

    let name = path
        .file_stem()
        .unwrap_or(path.as_os_str())
        .to_string_lossy();

    run_scenario(&scenario, &name, runtime, benchmark_group);
}

#[tracing::instrument(level = "warn", skip_all, fields(otel.name = format!(r#"Scenario "{name}""#)))]
pub fn run_scenario<M: Measurement>(
    scenario: &Scenario,
    name: &str,
    runtime: &Runtime,
    benchmark_group: &mut BenchmarkGroup<M>,
) {
    let mut runner = Runner::new(RunId::new(scenario.run_id), scenario.num_shards);
    {
        for stage in &scenario.setup {
            let value = runtime
                .block_on(stage.execute(&mut runner))
                .expect("Could not execute stage");
            tracing::info!(scenario = %name, stage = %stage.id(), result = %value, "Step completed");
        }
    }

    for bench in &scenario.benches {
        let _telemetry_guard = init_tracing(name, &bench.name);
        let _bench_span =
            tracing::info_span!("Bench", otel.name = format!(r#"Bench "{}""#, bench.name))
                .entered();
        let iteration = AtomicUsize::new(0);
        benchmark_group.bench_function(BenchmarkId::new(name, &bench.name), |bencher| {
            bencher.to_async(runtime).iter_batched(
                || (runner.clone(), &iteration),
                |(mut runner, iteration)| async move {
                    let current_iteration = iteration.fetch_add(1, atomic::Ordering::Relaxed);
                    for stage in &bench.steps {
                        let _stage_span = tracing::info_span!(
                            "Stage",
                            otel.name = format!(r#"Stage "{}""#, stage.id()),
                        )
                        .entered();

                        let result = Box::pin(stage.execute(&mut runner))
                            .await
                            .expect("stage failed");
                        if current_iteration == 0 {
                            tracing::info!(result = %result, "Bench stage completed");
                        }
                    }
                },
                BatchSize::LargeInput,
            );
        });
    }
}

#[derive(Debug, Default, Clone)]
pub struct Resources {
    pub users: HashMap<String, Vec<UserCreation>>,
    pub user_catalogs: HashMap<String, InMemoryWebCatalog>,
    pub data_types: HashMap<String, Vec<CreateDataTypeParams>>,
    pub data_type_catalogs: HashMap<String, InMemoryDataTypeCatalog>,
    pub property_types: HashMap<String, Vec<CreatePropertyTypeParams>>,
    pub property_type_catalogs: HashMap<String, InMemoryPropertyTypeCatalog>,
    pub entity_types: HashMap<String, Vec<CreateEntityTypeParams>>,
    pub entity_type_catalogs: HashMap<String, InMemoryEntityTypeCatalog>,
    pub entity_object_catalogs: HashMap<String, InMemoryEntityObjectRegistry>,
    pub entity_catalogs: HashMap<String, InMemoryEntityCatalog>,
    pub entities: HashMap<String, Vec<CreateEntityParams>>,
}

#[derive(Debug, Clone)]
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

    #[expect(clippy::unnecessary_unwrap, reason = "lifetime issues")]
    pub async fn ensure_db(&mut self) -> Result<&Pool, Report<ScenarioError>> {
        if self.pool.is_some() {
            return Ok(self.pool.as_ref().expect("pool set by setup_db"));
        }

        self.setup_db().await?;
        Ok(self.pool.as_ref().expect("pool set by setup_db"))
    }

    pub(super) async fn setup_db(&mut self) -> Result<(), Report<ScenarioError>> {
        // TODO: Support multiple database instances to avoid rebuilding state between benchmark
        //       runs
        //   see https://linear.app/hashintel/issue/BE-30
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
            PostgresStoreSettings {
                validate_links: true,
                skip_embedding_creation: true,
                filter_protection: PropertyProtectionFilterConfig::new(), // Disabled for benchmarks
            },
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
