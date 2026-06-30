//! HashQL query endpoint.
//!
//! Accepts a HashQL query as raw JSON, compiles it through the full pipeline
//! (parse, type-check, optimize, codegen), executes the generated SQL, and returns
//! the result. Compilation errors are reported as structured diagnostics with
//! source spans.

mod compile;
mod error;
mod value;

use alloc::sync::Arc;
use core::num::NonZero;
use std::thread::available_parallelism;

use axum::{Extension, Router, response::IntoResponse as _, routing::post};
use hash_graph_authorization::policies::{
    MergePolicies, PolicyComponents,
    store::{PolicyStore, PrincipalStore},
};
use hash_graph_postgres_store::store::postgres::PostgresClient;
use hash_graph_store::{filter::protection::PropertyProtectionFilterConfig, pool::StorePool};
use hash_temporal_client::TemporalClient;
use hashql_core::{
    heap::{HeapPool, ResetAllocator as _, ScratchPool},
    span::{SpanId, SpanTable},
};
use hashql_diagnostics::{IntoStatus as _, Source, Sources, Status, StatusExt as _, Success};
use hashql_eval::{
    error::EvalDiagnosticCategory,
    orchestrator::Orchestrator,
    postgres::{AuthorizationPatch, PreparedQueryPatch},
};
use hashql_mir::interpret::Inputs;
use hashql_syntax_jexpr::span::Span;
use http::StatusCode;
use serde_json::value::RawValue;
use tokio_util::task::LocalPoolHandle;
use type_system::principal::actor::ActorEntityUuid;
use utoipa::OpenApi;

use self::{
    compile::Compilation,
    error::{HashQlDiagnosticCategory, status_to_response},
    value::OwnedValue,
};
use super::AuthenticatedUserHeader;
use crate::rest::{InteractiveHeader, JsonCompatHeader, json::Json, status::BoxedResponse};

/// Shared resources for HashQL query compilation and execution, created once at server startup.
pub struct CompilerContext {
    pub scratches: ScratchPool,
    pub heaps: HeapPool,
    pub pool: LocalPoolHandle,
}

impl CompilerContext {
    /// Creates a new compiler context.
    ///
    /// `memory_pool_size` bounds the heap and scratch pools; `None` leaves them unbounded.
    /// `exec_pool_size` sets the thread count; `None` uses the number of available CPU cores.
    pub fn new(memory_pool_size: Option<usize>, exec_pool_size: Option<NonZero<usize>>) -> Self {
        let scratches = memory_pool_size.map_or_else(ScratchPool::new, ScratchPool::bounded);
        let heaps = memory_pool_size.map_or_else(HeapPool::new, HeapPool::bounded);

        let thread_count = exec_pool_size.unwrap_or_else(|| {
            available_parallelism().unwrap_or(const { NonZero::new(4).unwrap() })
        });

        let pool = LocalPoolHandle::new(thread_count.get());
        Self {
            scratches,
            heaps,
            pool,
        }
    }
}

/// Per-request database context.
struct ExecutionContext<S> {
    temporal: Option<Arc<TemporalClient>>,
    actor_id: ActorEntityUuid,
    store: Arc<S>,
    filter_protection: Arc<PropertyProtectionFilterConfig<'static>>,
}

/// Controls the response format for a HashQL query.
pub(crate) struct CompilationOutputOptions {
    /// Render errors as HTML with source annotations instead of structured JSON.
    pub interactive: bool,
    /// Serialize the result as plain JSON values, stripping HashQL-specific type wrappers.
    pub json_compat: bool,
}

/// Compiles and executes a HashQL query, returning the result as a [`Status`].
#[expect(clippy::future_not_send)]
async fn query_local_impl<S>(
    ctx: Arc<CompilerContext>,
    exec: ExecutionContext<S>,
    spans: &mut SpanTable<Span>,
    query: &[u8],
) -> Status<OwnedValue, HashQlDiagnosticCategory, SpanId>
where
    S: for<'pool> StorePool<Store<'pool>: AsRef<PostgresClient> + PrincipalStore + PolicyStore>,
{
    // Heap and scratch must be created inside this function because `spawn_pinned` requires
    // `'static`. Moving them across the spawn boundary isn't possible since they borrow from
    // the pool guards.
    let mut scratch = ctx.scratches.get();
    let heap = ctx.heaps.get();

    let inputs = Inputs::new(); // TODO: https://linear.app/hash/issue/BE-41/hashql-expose-input-in-graph-api

    let Success {
        value: mut compilation,
        advisories,
    } = Compilation::compile(&heap, &mut scratch, spans, query)?;

    let Success {
        value: store,
        advisories,
    } = exec
        .store
        .acquire(exec.temporal.clone())
        .await
        .map_err(|report| error::store_acquire_diagnostic(&report, compilation.root_span))
        .into_status()
        .with_diagnostics(advisories)?;

    let mut policy_components = PolicyComponents::builder(&store).with_actor(exec.actor_id);
    policy_components.add_actions(
        compilation.permissions.actions.iter().copied(),
        MergePolicies::Yes,
    );
    let Success {
        value: policy_components,
        advisories,
    } = policy_components
        .await
        .map_err(|report| error::authorization_context_diagnostic(&report, compilation.root_span))
        .into_status()
        .with_diagnostics(advisories)?;
    let property = &*exec.filter_protection;

    let patch = AuthorizationPatch::new(&policy_components, property);

    // TODO: in the future when we cache queries, this will have to clone them, but because this is
    // oneshot, we can just ignore that for now.
    for query in compilation.artifact.postgres.iter_mut() {
        PreparedQueryPatch::new()
            .layer(&patch)
            .apply(query, &mut *scratch);

        scratch.reset();
    }

    let context = compilation.context();
    let orchestrator = Orchestrator::new(&store, &compilation.artifact.postgres, &context);
    orchestrator
        .run(&inputs, compilation.entrypoint, [])
        .await
        .into_status()
        .map_category(|category| {
            HashQlDiagnosticCategory::Eval(EvalDiagnosticCategory::Orchestrator(category))
        })
        .with_diagnostics(advisories)
        .map_value(OwnedValue::from)
}

#[expect(clippy::future_not_send)]
async fn query_local<S>(
    ctx: Arc<CompilerContext>,
    exec: ExecutionContext<S>,
    query: Arc<RawValue>,
    options: CompilationOutputOptions,
) -> BoxedResponse
where
    S: for<'pool> StorePool<Store<'pool>: AsRef<PostgresClient> + PrincipalStore + PolicyStore>,
{
    let mut sources = Sources::new();
    let source_id = sources.push(Source::new(query.get()));

    let mut spans = SpanTable::new(source_id);

    let status = query_local_impl(ctx, exec, &mut spans, query.get().as_bytes()).await;
    status_to_response(status, &sources, &spans, &options)
}

/// Spawns a query onto the local thread pool and awaits the response.
async fn run_query<S>(
    ctx: Arc<CompilerContext>,
    exec: ExecutionContext<S>,
    query: Arc<RawValue>,
    options: CompilationOutputOptions,
) -> BoxedResponse
where
    S: for<'pool> StorePool<Store<'pool>: AsRef<PostgresClient> + PrincipalStore + PolicyStore>
        + Send
        + Sync
        + 'static,
{
    // The compiler and interpreter hold references into bump-allocated heaps, making their
    // futures `!Send`. `spawn_pinned` runs them on a dedicated thread; the returned handle
    // is `Send` so the HTTP handler can await it normally.
    let pool = ctx.pool.clone();
    let result = pool
        .spawn_pinned(|| query_local(ctx, exec, query, options))
        .await;

    result.unwrap_or_else(|error| {
        tracing::error!(?error, "panicked while executing query");

        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({"fatal": "internal error: query execution failed"})),
        )
            .into_response()
            .into()
    })
}

fn deserialize_empty_inputs<'de, D>(deserializer: D) -> Result<Vec<()>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let inputs: Vec<()> = serde::Deserialize::<'de>::deserialize(deserializer)?;
    if inputs.is_empty() {
        return Ok(inputs);
    }

    Err(serde::de::Error::custom(
        "`inputs` must be an empty array until input support ships",
    ))
}

/// Request body for the `/hashql` endpoint.
#[derive(serde::Deserialize, utoipa::ToSchema)]
pub(crate) struct HashQlRequest {
    #[schema(value_type = serde_json::Value)]
    query: Arc<RawValue>,
    /// Input values for the query. Must be an empty list until input support ships.
    #[expect(
        dead_code,
        reason = "inputs will be required once HashQL input support ships"
    )]
    #[serde(deserialize_with = "deserialize_empty_inputs")]
    inputs: Vec<()>,
}

#[utoipa::path(
    post,
    path = "/hashql",
    request_body = HashQlRequest,
    tag = "HashQL",
    params(
        ("X-Authenticated-User-Actor-Id" = ActorEntityUuid, Header, description = "The ID of the actor which is used to authorize the request"),
        ("Interactive" = Option<bool>, Header, description = "When true, error responses are rendered as HTML instead of JSON"),
        ("Json-Compat" = Option<bool>, Header, description = "When true, serializes the result as plain JSON values, stripping HashQL-specific type wrappers"),
    ),
    responses(
        (status = 200, content_type = "application/json", description = "Query executed successfully"),
        (status = 400, content_type = "application/json", description = "Query compilation or validation error"),
        (status = 500, description = "Internal compiler or database error"),
    )
)]
#[expect(clippy::too_many_arguments, reason = "axum handler extractors")]
pub(crate) async fn query_hashql<S>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    Extension(store_pool): Extension<Arc<S>>,
    Extension(compiler): Extension<Arc<CompilerContext>>,
    Extension(temporal): Extension<Option<Arc<TemporalClient>>>,
    Extension(filter_protection): Extension<Arc<PropertyProtectionFilterConfig<'static>>>,
    InteractiveHeader(interactive): InteractiveHeader,
    JsonCompatHeader(json_compat): JsonCompatHeader,
    Json(request): Json<HashQlRequest>,
) -> BoxedResponse
where
    S: for<'pool> StorePool<Store<'pool>: AsRef<PostgresClient> + PrincipalStore + PolicyStore>
        + Send
        + Sync
        + 'static,
{
    let exec = ExecutionContext {
        temporal,
        actor_id,
        store: store_pool,
        filter_protection,
    };

    let options = CompilationOutputOptions {
        interactive,
        json_compat,
    };

    run_query(compiler, exec, request.query, options).await
}

#[derive(OpenApi)]
#[openapi(
    paths(query_hashql),
    components(schemas(HashQlRequest)),
    tags((name = "HashQL", description = "HashQL query execution API"))
)]
pub(crate) struct HashQlResource;

impl HashQlResource {
    pub(crate) fn routes<S>() -> Router
    where
        S: for<'pool> StorePool<Store<'pool>: AsRef<PostgresClient> + PrincipalStore + PolicyStore>
            + Send
            + Sync
            + 'static,
    {
        Router::new().route("/hashql", post(query_hashql::<S>))
    }
}
