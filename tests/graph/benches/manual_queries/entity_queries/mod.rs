use core::{fmt, iter, mem};
use std::{collections::HashMap, env, ffi::OsStr, fs::File, io, path::Path};

use criterion::{BatchSize, BenchmarkId, Criterion};
use criterion_macro::criterion;
use either::Either;
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
use hash_graph_store::{
    entity::EntityStore, pool::StorePool as _, subgraph::edges::GraphResolveDepths,
};
use itertools::{Itertools as _, iproduct};
use serde::{Deserialize as _, Serialize as _};
use serde_json::Value as JsonValue;
use tokio::runtime::Runtime;
use tokio_postgres::NoTls;
use type_system::principal::actor::ActorEntityUuid;
use uuid::Uuid;
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

    fn sample_size(&self) -> usize {
        match self {
            Self::GetEntities(query) => query.settings.sample_size,
            Self::GetEntitySubgraph(query) => query.settings.sample_size,
        }
        .unwrap_or(100)
    }

    const fn sampling_mode(&self) -> criterion::SamplingMode {
        let sampling_mode = match self {
            Self::GetEntities(query) => query.settings.sampling_mode,
            Self::GetEntitySubgraph(query) => query.settings.sampling_mode,
        };
        match sampling_mode {
            SamplingMode::Auto => criterion::SamplingMode::Auto,
            SamplingMode::Linear => criterion::SamplingMode::Linear,
            SamplingMode::Flat => criterion::SamplingMode::Flat,
        }
    }

    fn prepare_request(self) -> impl Iterator<Item = (Self, String)> {
        match self {
            Self::GetEntities(query) => Either::Left(
                query
                    .prepare_request()
                    .map(|(request, parameter)| (Self::GetEntities(request), parameter)),
            ),
            Self::GetEntitySubgraph(query) => Either::Right(
                query
                    .prepare_request()
                    .map(|(request, parameter)| (Self::GetEntitySubgraph(request), parameter)),
            ),
        }
    }
}

#[derive(Debug, Default, Copy, Clone, serde::Deserialize)]
enum SamplingMode {
    #[default]
    Auto,
    Linear,
    Flat,
}

#[derive(Debug, Default, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Settings<P> {
    #[serde(default)]
    sample_size: Option<usize>,
    #[serde(default)]
    sampling_mode: SamplingMode,
    #[serde(default)]
    parameters: P,
}

#[derive(Debug, Default, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct GetEntitiesQueryParameters {
    #[serde(default)]
    actor_id: Vec<ActorEntityUuid>,
    #[serde(default)]
    limit: Vec<usize>,
    #[serde(default)]
    include_count: Vec<bool>,
}

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct GetEntitiesQuery<'q, 's, 'p> {
    actor_id: ActorEntityUuid,
    #[serde(borrow)]
    request: GetEntitiesRequest<'q, 's, 'p>,
    #[serde(default)]
    settings: Settings<GetEntitiesQueryParameters>,
}

impl GetEntitiesQuery<'_, '_, '_> {
    fn prepare_request(mut self) -> impl Iterator<Item = (Self, String)> {
        let modifies_actor_id = !self.settings.parameters.actor_id.is_empty();
        let modifies_limit = !self.settings.parameters.limit.is_empty();
        let modifies_include_count = !self.settings.parameters.include_count.is_empty();

        let actor_id = iter::once(self.actor_id)
            .chain(mem::take(&mut self.settings.parameters.actor_id))
            .sorted_by_key(|actor_id| Uuid::from(*actor_id))
            .dedup();
        let limit = iter::once(self.request.limit)
            .chain(
                mem::take(&mut self.settings.parameters.limit)
                    .into_iter()
                    .map(Some),
            )
            .sorted()
            .dedup();
        let include_count = iter::once(self.request.include_count)
            .chain(mem::take(&mut self.settings.parameters.include_count))
            .sorted()
            .dedup();

        iproduct!(actor_id, limit, include_count).map(move |(actor_id, limit, include_count)| {
            let mut parameters = Vec::new();
            if modifies_actor_id {
                parameters.push(format!("actor_id={actor_id}"));
            }
            if modifies_limit && let Some(limit) = limit {
                parameters.push(format!("limit={limit}"));
            }
            if modifies_include_count {
                parameters.push(format!("include_count={include_count}"));
            }
            (
                Self {
                    actor_id,
                    request: GetEntitiesRequest {
                        limit,
                        include_count,
                        ..self.request.clone()
                    },
                    settings: self.settings.clone(),
                },
                parameters.join(","),
            )
        })
    }
}

#[derive(Debug, Default, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct GetEntitySubgraphQueryParameters {
    #[serde(default)]
    actor_id: Vec<ActorEntityUuid>,
    #[serde(default)]
    limit: Vec<usize>,
    #[serde(default)]
    include_count: Vec<bool>,
    #[serde(default)]
    graph_resolve_depths: Vec<GraphResolveDepths>,
}

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct GetEntitySubgraphQuery<'q, 's, 'p> {
    actor_id: ActorEntityUuid,
    #[serde(borrow)]
    request: GetEntitySubgraphRequest<'q, 's, 'p>,
    #[serde(default)]
    settings: Settings<GetEntitySubgraphQueryParameters>,
}

fn format_graph_resolve_depths(depths: GraphResolveDepths) -> String {
    format!(
        "resolve_depths=inherit:{};values:{};properties:{};links:{};link_dests:{};type:{};left:{}/\
         {};right:{}/{}",
        depths.inherits_from.outgoing,
        depths.constrains_values_on.outgoing,
        depths.constrains_properties_on.outgoing,
        depths.constrains_links_on.outgoing,
        depths.constrains_link_destinations_on.outgoing,
        depths.is_of_type.outgoing,
        depths.has_left_entity.incoming,
        depths.has_left_entity.outgoing,
        depths.has_right_entity.incoming,
        depths.has_right_entity.outgoing
    )
}

impl GetEntitySubgraphQuery<'_, '_, '_> {
    fn prepare_request(mut self) -> impl Iterator<Item = (Self, String)> {
        let modifies_actor_id = !self.settings.parameters.actor_id.is_empty();
        let modifies_limit = !self.settings.parameters.limit.is_empty();
        let modifies_include_count = !self.settings.parameters.include_count.is_empty();
        let modifies_graph_resolve_depths =
            !self.settings.parameters.graph_resolve_depths.is_empty();

        let actor_id = iter::once(self.actor_id)
            .chain(mem::take(&mut self.settings.parameters.actor_id))
            .sorted_by_key(|actor_id| Uuid::from(*actor_id))
            .dedup();
        let limit = iter::once(self.request.limit)
            .chain(
                mem::take(&mut self.settings.parameters.limit)
                    .into_iter()
                    .map(Some),
            )
            .sorted()
            .dedup();
        let include_count = iter::once(self.request.include_count)
            .chain(mem::take(&mut self.settings.parameters.include_count))
            .sorted()
            .dedup();
        let graph_resolve_depths = iter::once(self.request.graph_resolve_depths)
            .chain(mem::take(
                &mut self.settings.parameters.graph_resolve_depths,
            ))
            .sorted()
            .dedup();

        iproduct!(actor_id, limit, include_count, graph_resolve_depths).map(
            move |(actor_id, limit, include_count, graph_resolve_depths)| {
                let mut parameters = Vec::new();
                if modifies_actor_id {
                    parameters.push(format!("actor_id={actor_id}"));
                }
                if modifies_limit && let Some(limit) = limit {
                    parameters.push(format!("limit={limit}"));
                }
                if modifies_include_count {
                    parameters.push(format!("include_count={include_count}"));
                }
                if modifies_graph_resolve_depths {
                    parameters.push(format_graph_resolve_depths(graph_resolve_depths));
                }
                (
                    Self {
                        actor_id,
                        request: GetEntitySubgraphRequest {
                            limit,
                            include_count,
                            ..self.request.clone()
                        },
                        settings: self.settings.clone(),
                    },
                    parameters.join(","),
                )
            },
        )
    }
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
                    .ok_or_else(|| io::Error::other("File does not have a valid file name"))?
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
            group.sample_size(request.sample_size());
            group.sampling_mode(request.sampling_mode());

            for (request, parameter) in request.prepare_request() {
                group.bench_function(BenchmarkId::new(name, &parameter), |bencher| {
                    let _guard = setup_subscriber(&group_id, Some(name), Some(&parameter));

                    bencher.to_async(&runtime).iter_batched(
                        || request.clone(),
                        |request| run_benchmark(&store, request),
                        BatchSize::SmallInput,
                    );
                });
            }
        }
    }
}
