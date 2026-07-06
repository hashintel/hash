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
use hash_graph_postgres_store::store::PostgresStorePool;
use hash_graph_store::pool::StorePool as _;
use hash_temporal_client::TemporalClient;
use hashql_core::{
    heap::{HeapPool, ScratchPool},
    span::{SpanId, SpanTable},
};
use hashql_diagnostics::{
    Diagnostic, IntoStatus as _, Label, Message, Source, Sources, Status, StatusExt as _, Success,
    severity::Critical,
};
use hashql_eval::{error::EvalDiagnosticCategory, orchestrator::Orchestrator};
use hashql_mir::interpret::Inputs;
use hashql_syntax_jexpr::span::Span;
use http::StatusCode;
use serde_json::value::RawValue;
use tokio_util::task::LocalPoolHandle;
use utoipa::OpenApi;

use self::{
    compile::Compilation,
    error::{HashQlDiagnosticCategory, status_to_response},
    value::OwnedValue,
};
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
struct ExecutionContext {
    postgres: PostgresStorePool,
    temporal: Option<Arc<TemporalClient>>,
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
async fn query_local_impl(
    ctx: Arc<CompilerContext>,
    exec: ExecutionContext,
    spans: &mut SpanTable<Span>,
    query: &[u8],
) -> Status<OwnedValue, HashQlDiagnosticCategory, SpanId> {
    // Heap and scratch must be created inside this function because `spawn_pinned` requires
    // `'static`. Moving them across the spawn boundary isn't possible since they borrow from
    // the pool guards.
    let mut scratch = ctx.scratches.get();
    let heap = ctx.heaps.get();

    let inputs = Inputs::new(); // TODO: https://linear.app/hash/issue/BE-41/hashql-expose-input-in-graph-api

    let Success {
        value: compilation,
        advisories,
    } = Compilation::compile(&heap, &mut scratch, spans, query)?;
    drop(scratch);

    let context = compilation.context();

    let Success {
        value: client,
        advisories,
    } = exec
        .postgres
        .acquire(exec.temporal)
        .await
        .map_err(|report| {
            let mut diagnostic =
                Diagnostic::new(HashQlDiagnosticCategory::Infrastructure, Critical::BUG).primary(
                    Label::new(compilation.root_span, "failed to acquire postgres client"),
                );

            if cfg!(debug_assertions) {
                diagnostic.add_message(Message::note(format!("{report:?}")));
            } else {
                tracing::error!(?report, "failed to acquire postgres client");
            }

            diagnostic
        })
        .into_status()
        .with_diagnostics(advisories)?;

    let orchestrator = Orchestrator::new(client, &compilation.artifact.postgres, &context);
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
async fn query_local(
    ctx: Arc<CompilerContext>,
    exec: ExecutionContext,
    query: Arc<RawValue>,
    options: CompilationOutputOptions,
) -> BoxedResponse {
    let mut sources = Sources::new();
    let source_id = sources.push(Source::new(query.get()));

    let mut spans = SpanTable::new(source_id);

    let status = query_local_impl(ctx, exec, &mut spans, query.get().as_bytes()).await;
    status_to_response(status, &sources, &spans, &options)
}

/// Spawns a query onto the local thread pool and awaits the response.
async fn run_query(
    ctx: Arc<CompilerContext>,
    exec: ExecutionContext,
    query: Arc<RawValue>,
    options: CompilationOutputOptions,
) -> BoxedResponse {
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
#[serde(deny_unknown_fields)]
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
        ("Interactive" = Option<bool>, Header, description = "When true, error responses are rendered as HTML instead of JSON"),
        ("Json-Compat" = Option<bool>, Header, description = "When true, serializes the result as plain JSON values, stripping HashQL-specific type wrappers"),
    ),
    responses(
        (status = 200, content_type = "application/json", description = "Query executed successfully"),
        (status = 400, content_type = "application/json", description = "Query compilation or validation error"),
        (status = 500, description = "Internal compiler or database error"),
    )
)]
pub(crate) async fn query_hashql(
    Extension(compiler): Extension<Arc<CompilerContext>>,
    Extension(postgres): Extension<Arc<PostgresStorePool>>,
    Extension(temporal): Extension<Option<Arc<TemporalClient>>>,
    InteractiveHeader(interactive): InteractiveHeader,
    JsonCompatHeader(json_compat): JsonCompatHeader,
    Json(request): Json<HashQlRequest>,
) -> BoxedResponse {
    let exec = ExecutionContext {
        postgres: (*postgres).clone(),
        temporal,
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
    pub(crate) fn routes() -> Router {
        Router::new().route("/hashql", post(query_hashql))
    }
}
