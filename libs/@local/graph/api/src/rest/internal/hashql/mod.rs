//! HashQL query endpoint.
//!
//! Accepts a HashQL query as raw JSON, compiles it through the full pipeline
//! (parse, type-check, optimize, codegen), executes the generated SQL, and returns
//! the result. Compilation errors are reported as structured diagnostics with
//! source spans.

use alloc::{alloc::Global, sync::Arc};
use core::num::NonZero;
use std::thread::available_parallelism;

use aide::transform::TransformOperation;
use axum::extract::State;
use error_stack::{Report, ResultExt as _};
use hash_graph_authorization::policies::{
    MergePolicies, PolicyComponents,
    store::{PolicyStore, PrincipalStore},
};
use hash_graph_postgres_store::store::postgres::PostgresClient;
use hash_graph_store::{filter::protection::PropertyProtectionFilterConfig, pool::StorePool};
use hash_temporal_client::TemporalClient;
use hashql_core::{
    heap::{Heap, Pool, ResetAllocator as _, Scratch},
    span::{SpanId, SpanTable},
};
use hashql_diagnostics::{IntoStatus as _, Source, Sources, StatusExt as _, Success};
use hashql_eval::{
    error::EvalDiagnosticCategory,
    orchestrator::Orchestrator,
    postgres::{AuthorizationPatch, PreparedQueryPatch},
};
use hashql_syntax_jexpr::{JsonPointers, span::Span};
use serde_json::value::RawValue;
use tokio_util::task::LocalPoolHandle;
use type_system::principal::actor::ActorId;

use self::{
    compile::Compilation,
    error::{
        HashQlDiagnosticCategory, QueryError, QueryFailure, QueryRejection, QueryResponse,
        status_to_response,
    },
    value::OwnedValue,
};
use super::Credentials;
use crate::rest::{
    ApiState, FilterProtection,
    credentials::Actor,
    extract::{Header, Json},
    routing::{self, Outcome, Route},
};

mod compile;
mod error;
mod value;

/// Shared resources for HashQL query compilation and execution, created once at server startup.
pub struct CompilerState {
    pub scratches: Pool<Scratch, Global>,
    pub heaps: Pool<Heap, Global>,
    pub pool: LocalPoolHandle,
}

impl CompilerState {
    /// Creates a new compiler context.
    ///
    /// `memory_pool_size` bounds the heap and scratch pools; `None` leaves them unbounded.
    /// `exec_pool_size` sets the thread count; `None` uses the number of available CPU cores.
    pub fn new(memory_pool_size: Option<usize>, exec_pool_size: Option<NonZero<usize>>) -> Self {
        let scratches = memory_pool_size.map_or_else(Pool::new, Pool::bounded);
        let heaps = memory_pool_size.map_or_else(Pool::new, Pool::bounded);

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

struct ExecutionContext<S> {
    temporal: Option<Arc<TemporalClient>>,
    actor_id: ActorId,
    store: Arc<S>,
    filter_protection: Arc<PropertyProtectionFilterConfig<'static>>,
}

#[derive(serde::Deserialize, schemars::JsonSchema)]
pub(crate) struct CompilationOutputOptions {
    /// Whether a query that fails is answered with its diagnostics as an HTML page.
    #[serde(default, rename = "Interactive")]
    pub interactive: bool,
    /// Whether the value is answered as plain JSON, without the HashQL kind of each value.
    #[serde(default, rename = "Json-Compat")]
    pub json_compat: bool,
}

/// Compiles and executes a HashQL query, returning its value or the way it failed.
#[expect(clippy::future_not_send)]
async fn query_local_impl<S>(
    ctx: Arc<CompilerState>,
    spans: &mut SpanTable<Span>,
    source: &str,
    ExecutionContext {
        temporal,
        actor_id,
        store,
        filter_protection,
    }: ExecutionContext<S>,
) -> (
    Result<Success<OwnedValue, HashQlDiagnosticCategory, SpanId>, QueryFailure>,
    JsonPointers,
)
where
    S: for<'pool> StorePool<Store<'pool>: AsRef<PostgresClient> + PrincipalStore + PolicyStore>,
{
    // Heap and scratch must be created inside this function because `spawn_pinned` requires
    // `'static`. Moving them across the spawn boundary isn't possible since they borrow from
    // the pool guards.
    let mut scratch = ctx.scratches.get();
    let heap = ctx.heaps.get();

    let (compiled, pointers) = Compilation::compile(&heap, &mut scratch, spans, source);
    let status = async {
        let Success {
            value: mut compilation,
            advisories,
        } = compiled?;

        let store = store
            .acquire(temporal.clone())
            .await
            .change_context(QueryError::StoreUnavailable)?;

        let mut policy_components = PolicyComponents::builder(&store, Some(actor_id));
        policy_components.add_actions(
            compilation.permissions.actions.iter().copied(),
            MergePolicies::Yes,
        );
        let policy_components = policy_components
            .await
            .change_context(QueryError::Authorization)?;
        let property = &*filter_protection;

        let patch = AuthorizationPatch::new(&policy_components, property);

        // TODO: in the future when we cache queries, this will have to clone them, but because this
        // is oneshot, we can just ignore that for now.
        for query in compilation.artifact.postgres.iter_mut() {
            PreparedQueryPatch::new()
                .layer(&patch)
                .apply(query, &mut *scratch);

            scratch.reset();
        }
        drop(scratch);

        let context = compilation.context();
        let orchestrator = Orchestrator::new(&store, &compilation.artifact.postgres, &context);
        orchestrator
            .run(&compilation.inputs, compilation.entrypoint, [])
            .await
            .into_status()
            .map_category(|category| {
                HashQlDiagnosticCategory::Eval(EvalDiagnosticCategory::Orchestrator(category))
            })
            .with_diagnostics(advisories)
            .map_value(OwnedValue::from)
            .map_err(QueryFailure::Diagnostics)
    }
    .await;

    (status, pointers)
}

#[expect(clippy::future_not_send)]
async fn query_local<S>(
    ctx: Arc<CompilerState>,
    query: Arc<RawValue>,
    options: CompilationOutputOptions,
    exec: ExecutionContext<S>,
) -> Result<Json<QueryResponse>, QueryRejection>
where
    S: for<'pool> StorePool<Store<'pool>: AsRef<PostgresClient> + PrincipalStore + PolicyStore>,
{
    let mut sources = Sources::new();
    let source_id = sources.push(Source::new(query.get()));

    let mut spans = SpanTable::new(source_id);

    let (status, pointers) = query_local_impl(ctx, &mut spans, query.get(), exec).await;
    status_to_response(status, &sources, &spans, &pointers, &options)
}

/// Spawns a query onto the local thread pool and awaits the response.
async fn run_query<S>(
    ctx: Arc<CompilerState>,
    query: Arc<RawValue>,
    options: CompilationOutputOptions,
    exec: ExecutionContext<S>,
) -> Result<Json<QueryResponse>, QueryRejection>
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
        .spawn_pinned(|| query_local(ctx, query, options, exec))
        .await;

    result.unwrap_or_else(|error| {
        Err(Report::new(error)
            .change_context(QueryError::Panicked)
            .into())
    })
}

/// The query to run.
#[derive(serde::Deserialize, schemars::JsonSchema)]
#[serde(deny_unknown_fields)]
pub(crate) struct HashQlRequest {
    /// The query, as a J-Expr.
    query: Arc<RawValue>,
}

impl Outcome for Result<Json<QueryResponse>, QueryRejection> {}

async fn query_hashql<S>(
    actor: Actor<Credentials>,
    State(store): State<Arc<S>>,
    State(compiler): State<Arc<CompilerState>>,
    State(temporal): State<Option<Arc<TemporalClient>>>,
    State(FilterProtection(filter_protection)): State<FilterProtection>,
    Header(options): Header<CompilationOutputOptions>,
    Json(HashQlRequest { query }): Json<HashQlRequest>,
) -> Result<Json<QueryResponse>, QueryRejection>
where
    S: for<'pool> StorePool<Store<'pool>: AsRef<PostgresClient> + PrincipalStore + PolicyStore>
        + Send
        + Sync
        + 'static,
{
    let exec = ExecutionContext {
        temporal,
        actor_id: actor.into(),
        store,
        filter_protection,
    };

    run_query(compiler, query, options, exec).await
}

fn document_query_hashql(operation: TransformOperation<'_>) -> TransformOperation<'_> {
    operation
        .id("queryHashql")
        .summary("Run a HashQL query")
        .description(
            "Compiles the query and evaluates it as the caller. Returns the value of the query \
             with the diagnostics that did not fail it. A query that fails is answered with its \
             diagnostics.",
        )
}

pub(super) fn route<S>() -> Route<ApiState<S>>
where
    S: for<'pool> StorePool<Store<'pool>: AsRef<PostgresClient> + PrincipalStore + PolicyStore>
        + Send
        + Sync
        + 'static,
{
    routing::post(query_hashql::<S>, document_query_hashql)
}
