use alloc::alloc::Global;
use core::mem;

use hashql_compiletest::pipeline::Pipeline;
use hashql_core::{heap::ResetAllocator as _, span::SpanId};
use hashql_diagnostics::{Diagnostic, diagnostic::BoxedDiagnostic};
use hashql_eval::{
    context::EvalContext,
    orchestrator::{AppendEventLog, Event, Orchestrator},
    postgres::PostgresCompiler,
};
use hashql_mir::{
    body::Body,
    def::{DefId, DefIdSlice, DefIdVec},
    intern::Interner,
    interpret::{Inputs, value::Value},
};
use tokio::runtime;
use tokio_postgres::Client;

/// Intermediate state after parsing and lowering a J-Expr query.
///
/// Holds the MIR artifacts needed to build typed inputs (via the decoder
/// and the environment) before proceeding to execution.
pub(crate) struct Lowered<'heap> {
    pub interner: Interner<'heap>,
    pub entry: DefId,
    pub bodies: DefIdVec<Body<'heap>>,
}

/// Parses and lowers J-Expr source, returning MIR artifacts.
///
/// After this call the pipeline's environment contains all types referenced
/// by the query, so the caller can use the decoder to construct typed input
/// values before calling [`run`].
///
/// # Errors
///
/// Returns a diagnostic on parse or lowering failure.
pub(crate) fn lower<'heap>(
    pipeline: &mut Pipeline<'heap>,
    bytes: impl AsRef<[u8]>,
) -> Result<Lowered<'heap>, BoxedDiagnostic<'static, SpanId>> {
    let ast = pipeline.parse(bytes)?;
    let (interner, entry, bodies) = pipeline.lower(ast)?;

    Ok(Lowered {
        interner,
        entry,
        bodies,
    })
}

/// Transforms, analyzes, and executes a lowered query.
///
/// The caller provides pre-built inputs (constructed after lowering so that
/// the type environment is available for decoding).
///
/// # Errors
///
/// Returns a diagnostic on transform, analysis, or execution failure.
pub(crate) fn run<'heap>(
    pipeline: &mut Pipeline<'heap>,

    runtime: &runtime::Runtime,
    client: &Client,

    inputs: &Inputs<'heap, Global>,

    lowered: &mut Lowered<'heap>,
) -> Result<(Value<'heap, Global>, Vec<Event>), BoxedDiagnostic<'static, SpanId>> {
    run_impl(
        pipeline,
        runtime,
        client,
        inputs,
        &lowered.interner,
        lowered.entry,
        &mut lowered.bodies,
    )
}

/// Executes a pre-built MIR program.
///
/// Used by programmatic tests that construct bodies directly via the `body!`
/// macro instead of parsing J-Expr source.
///
/// # Errors
///
/// Returns a diagnostic on transform, analysis, or execution failure.
pub(crate) fn execute<'heap>(
    pipeline: &mut Pipeline<'heap>,

    runtime: &runtime::Runtime,
    client: &Client,

    inputs: &Inputs<'heap, Global>,

    interner: &Interner<'heap>,
    entry: DefId,
    bodies: &mut DefIdSlice<Body<'heap>>,
) -> Result<(Value<'heap, Global>, Vec<Event>), BoxedDiagnostic<'static, SpanId>> {
    run_impl(pipeline, runtime, client, inputs, interner, entry, bodies)
}

struct PostgresClient<'client>(&'client Client);
impl AsRef<Client> for PostgresClient<'_> {
    fn as_ref(&self) -> &Client {
        self.0
    }
}

fn run_impl<'heap>(
    pipeline: &mut Pipeline<'heap>,

    runtime: &runtime::Runtime,
    client: &Client,

    inputs: &Inputs<'heap, Global>,

    interner: &Interner<'heap>,
    entry: DefId,
    bodies: &mut DefIdSlice<Body<'heap>>,
) -> Result<(Value<'heap, Global>, Vec<Event>), BoxedDiagnostic<'static, SpanId>> {
    pipeline.transform(interner, bodies)?;
    let analysis = pipeline.prepare(interner, bodies)?;

    let mut context = EvalContext::new_in(
        &pipeline.env,
        interner,
        bodies,
        &analysis,
        pipeline.heap,
        &mut pipeline.scratch,
    );
    let mut postgres = PostgresCompiler::new_in(&mut context, &mut pipeline.scratch);
    let queries = postgres.compile();
    pipeline.scratch.reset();

    let diagnostics = mem::take(&mut context.diagnostics);
    pipeline.diagnostics.append(&mut diagnostics.boxed());

    let event_log = AppendEventLog::new();
    let orchestrator =
        Orchestrator::new(PostgresClient(client), &queries, &context).with_event_log(&event_log);

    let value = runtime
        .block_on(orchestrator.run(inputs, entry, []))
        .map_err(Diagnostic::boxed)?;

    Ok((value, event_log.take()))
}
