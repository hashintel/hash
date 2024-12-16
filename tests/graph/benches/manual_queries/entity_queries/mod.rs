use core::fmt;
use std::{collections::HashMap, env, ffi::OsStr, fs::File, io, path::Path};

use criterion::{BenchmarkId, Criterion};
use criterion_macro::criterion;
use error_stack::Report;
use hash_graph_api::rest::entity::{GetEntitiesRequest, GetEntitySubgraphRequest};
use hash_graph_authorization::{backend::SpiceDbOpenApi, zanzibar::ZanzibarClient};
use hash_graph_postgres_store::{
    Environment, load_env,
    store::{
        DatabaseConnectionInfo, DatabasePoolConfig, DatabaseType, PostgresStorePool,
        PostgresStoreSettings,
    },
};
use hash_graph_store::{entity::EntityStore, pool::StorePool as _};
use hash_graph_types::account::AccountId;
use serde::{Deserialize as _, Serialize as _};
use serde_json::Value as JsonValue;
use tokio::runtime::Runtime;
use tokio_postgres::NoTls;
use walkdir::WalkDir;

use crate::util::setup_subscriber;

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
enum GraphQuery<'q, 's, 'p> {
    #[serde(borrow)]
    GetEntities(GetEntitiesQuery<'q, 's, 'p>),
    #[serde(borrow)]
    GetEntitySubgraph(GetEntitySubgraphQuery<'q, 's, 'p>),
}

#[derive(Debug, PartialEq, Eq, Hash, serde::Serialize)]
#[serde(rename_all = "kebab-case")]
enum GraphQueryType {
    GetEntities,
    GetEntitySubgraph,
}

impl fmt::Display for GraphQueryType {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.serialize(fmt)
    }
}

impl GraphQuery<'_, '_, '_> {
    const fn query_type(&self) -> GraphQueryType {
        match self {
            Self::GetEntities(_) => GraphQueryType::GetEntities,
            Self::GetEntitySubgraph(_) => GraphQueryType::GetEntitySubgraph,
        }
    }
}

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct GetEntitiesQuery<'q, 's, 'p> {
    actor_id: AccountId,
    #[serde(borrow)]
    request: GetEntitiesRequest<'q, 's, 'p>,
}

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct GetEntitySubgraphQuery<'q, 's, 'p> {
    actor_id: AccountId,
    #[serde(borrow)]
    request: GetEntitySubgraphRequest<'q, 's, 'p>,
}

fn read_groups(path: impl AsRef<Path>) -> Result<Vec<(String, JsonValue)>, Report<io::Error>> {
    WalkDir::new(path)
        .sort_by_file_name()
        .into_iter()
        .filter_map(Result::ok)
        .filter(|entry| {
            !entry.file_type().is_dir() && entry.path().extension() == Some(OsStr::new("json"))
        })
        .map(|entry| {
            Ok((
                entry
                    .path()
                    .file_stem()
                    .ok_or_else(|| {
                        io::Error::new(io::ErrorKind::Other, "File does not have a valid file name")
                    })?
                    .to_string_lossy()
                    .into_owned(),
                serde_json::from_reader(File::open(entry.path())?).map_err(io::Error::from)?,
            ))
        })
        .collect()
}

async fn run_benchmark<'q, 's, 'p: 'q, S>(store: &S, request: GraphQuery<'q, 's, 'p>)
where
    S: EntityStore + Sync,
{
    match request {
        GraphQuery::GetEntities(request) => {
            let _response = store
                .get_entities(request.actor_id, request.request.into())
                .await
                .expect("failed to read entities from store");
        }
        GraphQuery::GetEntitySubgraph(request) => {
            let _response = store
                .get_entity_subgraph(request.actor_id, request.request.into())
                .await
                .expect("failed to read entity subgraph from store");
        }
    }
}

#[criterion]
fn bench_json_queries(crit: &mut Criterion) {
    load_env(Environment::Test);

    let groups = read_groups("manual_queries/entity_queries").expect("groups should be readable");
    let groups = groups
        .iter()
        .try_fold(
            HashMap::<GraphQueryType, Vec<(&str, GraphQuery)>>::new(),
            |mut map, (name, request)| {
                GraphQuery::deserialize(request).map(|request| {
                    map.entry(request.query_type())
                        .or_default()
                        .push((name, request));
                    map
                })
            },
        )
        .expect("benchmark definitions should be valid");

    let runtime = Runtime::new().expect("runtime should be creatable");

    let pool = runtime
        .block_on(PostgresStorePool::new(
            &DatabaseConnectionInfo::new(
                DatabaseType::Postgres,
                env::var("HASH_GRAPH_PG_USER").unwrap_or_else(|_| "graph".to_owned()),
                env::var("HASH_GRAPH_PG_PASSWORD").unwrap_or_else(|_| "graph".to_owned()),
                env::var("HASH_GRAPH_PG_HOST").unwrap_or_else(|_| "localhost".to_owned()),
                env::var("HASH_GRAPH_PG_PORT")
                    .map(|port| {
                        port.parse::<u16>()
                            .unwrap_or_else(|_| panic!("{port} is not a valid port"))
                    })
                    .unwrap_or(5432),
                env::var("HASH_GRAPH_PG_DATABASE").unwrap_or_else(|_| "graph".to_owned()),
            ),
            &DatabasePoolConfig::default(),
            NoTls,
            PostgresStoreSettings::default(),
        ))
        .expect("pool should be able to be created");

    let spicedb_client = SpiceDbOpenApi::new(
        format!(
            "{}:{}",
            env::var("HASH_SPICEDB_HOST").unwrap_or_else(|_| "localhost".to_owned()),
            env::var("HASH_SPICEDB_HTTP_PORT")
                .map(|port| {
                    port.parse::<u16>()
                        .unwrap_or_else(|_| panic!("{port} is not a valid port"))
                })
                .unwrap_or(8443)
        ),
        Some(&env::var("HASH_SPICEDB_GRPC_PRESHARED_KEY").unwrap_or_else(|_| "secret".to_owned())),
    )
    .expect("SpiceDB client should be able to be instantiated");

    let store = runtime
        .block_on(pool.acquire(ZanzibarClient::new(spicedb_client), None))
        .expect("pool should be able to acquire store");

    for (query_type, requests) in groups {
        let group_id = query_type.to_string();
        let mut group = crit.benchmark_group(&group_id);

        for (name, request) in requests {
            let parameter = "";
            group.bench_function(BenchmarkId::new(name, parameter), |bencher| {
                let _guard = setup_subscriber(&group_id, Some(name), Some(parameter));

                bencher.to_async(&runtime).iter_batched(
                    || request.clone(),
                    |request| run_benchmark(&store, request),
                    criterion::BatchSize::SmallInput,
                );
            });
        }
    }
}
