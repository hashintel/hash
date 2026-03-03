use core::{fmt, iter, mem};
use std::{collections::HashMap, env, ffi::OsStr, fs::File, io, path::Path};

use criterion::{BatchSize, BenchmarkId, Criterion};
use criterion_macro::criterion;
use either::Either;
use error_stack::Report;
use hash_graph_api::rest::{
    self,
    entity::{EntityQueryOptions, QueryEntitiesRequest, QueryEntitySubgraphRequest},
};
use hash_graph_postgres_store::{
    Environment, load_env,
    store::{
        DatabaseConnectionInfo, DatabasePoolConfig, DatabaseType, PostgresStorePool,
        PostgresStoreSettings,
    },
};
use hash_graph_store::{
    entity::EntityStore, pool::StorePool as _, subgraph::edges::SubgraphTraversalParams,
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
    QueryEntities(QueryEntitiesQuery<'q, 's, 'p>),
    #[serde(borrow)]
    QueryEntitySubgraph(QueryEntitySubgraphQuery<'q, 's, 'p>),
}

#[derive(Debug, PartialEq, Eq, Hash, serde::Serialize)]
#[serde(rename_all = "kebab-case")]
enum GraphQueryType {
    QueryEntities,
    QueryEntitySubgraph,
}

impl fmt::Display for GraphQueryType {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.serialize(fmt)
    }
}

impl GraphQuery<'_, '_, '_> {
    const fn query_type(&self) -> GraphQueryType {
        match self {
            Self::QueryEntities(_) => GraphQueryType::QueryEntities,
            Self::QueryEntitySubgraph(_) => GraphQueryType::QueryEntitySubgraph,
        }
    }

    fn sample_size(&self) -> usize {
        match self {
            Self::QueryEntities(query) => query.settings.sample_size,
            Self::QueryEntitySubgraph(query) => query.settings.sample_size,
        }
        .unwrap_or(100)
    }

    const fn sampling_mode(&self) -> criterion::SamplingMode {
        let sampling_mode = match self {
            Self::QueryEntities(query) => query.settings.sampling_mode,
            Self::QueryEntitySubgraph(query) => query.settings.sampling_mode,
        };
        match sampling_mode {
            SamplingMode::Auto => criterion::SamplingMode::Auto,
            SamplingMode::Linear => criterion::SamplingMode::Linear,
            SamplingMode::Flat => criterion::SamplingMode::Flat,
        }
    }

    fn prepare_request(self) -> impl Iterator<Item = (Self, String)> {
        match self {
            Self::QueryEntities(query) => Either::Left(
                query
                    .prepare_request()
                    .map(|(request, parameter)| (Self::QueryEntities(request), parameter)),
            ),
            Self::QueryEntitySubgraph(query) => Either::Right(
                query
                    .prepare_request()
                    .map(|(request, parameter)| (Self::QueryEntitySubgraph(request), parameter)),
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
struct QueryEntitiesQueryParameters {
    #[serde(default)]
    actor_id: Vec<ActorEntityUuid>,
    #[serde(default)]
    limit: Vec<usize>,
    #[serde(default)]
    include_count: Vec<bool>,
}

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct QueryEntitiesQuery<'q, 's, 'p> {
    actor_id: ActorEntityUuid,
    #[serde(borrow)]
    request: QueryEntitiesRequest<'q, 's, 'p>,
    #[serde(default)]
    settings: Settings<QueryEntitiesQueryParameters>,
}

impl QueryEntitiesQuery<'_, '_, '_> {
    fn prepare_request(mut self) -> impl Iterator<Item = (Self, String)> {
        let modifies_actor_id = !self.settings.parameters.actor_id.is_empty();
        let modifies_limit = !self.settings.parameters.limit.is_empty();
        let modifies_include_count = !self.settings.parameters.include_count.is_empty();

        let (query, options) = self.request.into_parts();

        let actor_id = iter::once(self.actor_id)
            .chain(mem::take(&mut self.settings.parameters.actor_id))
            .sorted_by_key(|actor_id| Uuid::from(*actor_id))
            .dedup();
        let limit = iter::once(options.limit)
            .chain(
                mem::take(&mut self.settings.parameters.limit)
                    .into_iter()
                    .map(Some),
            )
            .sorted()
            .dedup();
        let include_count = iter::once(options.include_count)
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
                    request: QueryEntitiesRequest::from_parts(
                        query.clone(),
                        EntityQueryOptions {
                            limit,
                            include_count,
                            ..options.clone()
                        },
                    ),
                    settings: self.settings.clone(),
                },
                parameters.join(","),
            )
        })
    }
}

#[derive(Debug, Default, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct QueryEntitySubgraphQueryParameters {
    #[serde(default)]
    actor_id: Vec<ActorEntityUuid>,
    #[serde(default)]
    limit: Vec<usize>,
    #[serde(default)]
    include_count: Vec<bool>,
    #[serde(default)]
    traversal_params: Vec<SubgraphTraversalParams>,
}

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct QueryEntitySubgraphQuery<'q, 's, 'p> {
    actor_id: ActorEntityUuid,
    #[serde(borrow)]
    request: QueryEntitySubgraphRequest<'q, 's, 'p>,
    #[serde(default)]
    settings: Settings<QueryEntitySubgraphQueryParameters>,
}

fn format_traversal_params(params: &SubgraphTraversalParams) -> String {
    match params {
        SubgraphTraversalParams::Paths { traversal_paths } => format!(
            "traversal_paths={}|{}",
            traversal_paths
                .iter()
                .map(|path| path.edges.len())
                .sum::<usize>(),
            traversal_paths.len(),
        ),
        SubgraphTraversalParams::ResolveDepths {
            traversal_paths,
            graph_resolve_depths: depths,
        } => format!(
            "traversal_paths={}|{},resolve_depths=inherit:{};values:{};properties:{};links:{};\
             link_dests:{};type:{}",
            traversal_paths
                .iter()
                .map(|path| path.edges.len())
                .sum::<usize>(),
            traversal_paths.len(),
            depths.inherits_from,
            depths.constrains_values_on,
            depths.constrains_properties_on,
            depths.constrains_links_on,
            depths.constrains_link_destinations_on,
            depths.is_of_type,
        ),
    }
}

impl QueryEntitySubgraphQuery<'_, '_, '_> {
    fn prepare_request(mut self) -> impl Iterator<Item = (Self, String)> {
        let modifies_actor_id = !self.settings.parameters.actor_id.is_empty();
        let modifies_limit = !self.settings.parameters.limit.is_empty();
        let modifies_include_count = !self.settings.parameters.include_count.is_empty();
        let modifies_graph_resolve_depths = !self.settings.parameters.traversal_params.is_empty();

        let (query, options, traversal_params) = self.request.clone().into_parts();

        let actor_id = iter::once(self.actor_id)
            .chain(mem::take(&mut self.settings.parameters.actor_id))
            .sorted_by_key(|actor_id| Uuid::from(*actor_id))
            .dedup();
        let limit = iter::once(options.limit)
            .chain(
                mem::take(&mut self.settings.parameters.limit)
                    .into_iter()
                    .map(Some),
            )
            .sorted()
            .dedup();
        let include_count = iter::once(options.include_count)
            .chain(mem::take(&mut self.settings.parameters.include_count))
            .sorted()
            .dedup();
        let traversal_params_iter = iter::once(traversal_params)
            .chain(mem::take(&mut self.settings.parameters.traversal_params));

        iproduct!(actor_id, limit, include_count, traversal_params_iter).map(
            move |(actor_id, limit, include_count, traversal_params)| {
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
                    parameters.push(format_traversal_params(&traversal_params));
                }
                (
                    Self {
                        actor_id,
                        request: QueryEntitySubgraphRequest::from_parts(
                            query.clone(),
                            EntityQueryOptions {
                                limit,
                                include_count,
                                ..options.clone()
                            },
                            traversal_params,
                        ),
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
        GraphQuery::QueryEntities(request) => {
            let (query, options) = request.request.into_parts();
            let rest::entity::EntityQuery::Filter { filter } = query else {
                panic!("unsupported query type")
            };

            let _response = store
                .query_entities(request.actor_id, options.into_params(filter))
                .await
                .expect("failed to read entities from store");
        }
        GraphQuery::QueryEntitySubgraph(request) => {
            let (query, options, traversal) = request.request.into_parts();
            let rest::entity::EntityQuery::Filter { filter } = query else {
                panic!("unsupported query type")
            };

            let _response = store
                .query_entity_subgraph(
                    request.actor_id,
                    options.into_traversal_params(filter, traversal),
                )
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
                env::var("HASH_GRAPH_PG_PORT").map_or(5432, |port| {
                    port.parse::<u16>()
                        .unwrap_or_else(|_| panic!("{port} is not a valid port"))
                }),
                env::var("HASH_GRAPH_PG_DATABASE").unwrap_or_else(|_| "graph".to_owned()),
            ),
            &DatabasePoolConfig::default(),
            NoTls,
            PostgresStoreSettings::default(),
        ))
        .expect("pool should be able to be created");

    let store = runtime
        .block_on(pool.acquire(None))
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
