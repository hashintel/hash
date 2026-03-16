use alloc::alloc::Global;
use core::mem;

use hashql_compiletest::pipeline::Pipeline;
use hashql_core::{heap::ResetAllocator as _, span::SpanId};
use hashql_diagnostics::{Diagnostic, diagnostic::BoxedDiagnostic};
use hashql_eval::{context::EvalContext, orchestrator::Orchestrator, postgres::PostgresCompiler};
use hashql_mir::{
    body::Body,
    def::{DefId, DefIdSlice},
    intern::Interner,
    interpret::{Inputs, value::Value},
};
use tokio::runtime;
use tokio_postgres::Client;

fn run_impl<'heap>(
    pipeline: &mut Pipeline<'heap>,

    runtime: &runtime::Runtime,
    client: Client,

    inputs: &Inputs<'heap, Global>,

    interner: &Interner<'heap>,
    entry: DefId,
    bodies: &mut DefIdSlice<Body<'heap>>,
) -> Result<Value<'heap, Global>, BoxedDiagnostic<'static, SpanId>> {
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

    let orchestrator = Orchestrator::new(client, &queries, &context);

    runtime
        .block_on(orchestrator.run(inputs, entry, []))
        .map_err(Diagnostic::boxed)
}

/// Parses J-Expr source bytes and executes the resulting query.
///
/// The caller owns the pipeline and retains access to accumulated diagnostics
/// (warnings, advisories) regardless of whether execution succeeds or fails.
///
/// # Errors
///
/// Returns a diagnostic on compilation or execution failure.
pub(crate) fn execute_parse<'heap>(
    pipeline: &mut Pipeline<'heap>,

    runtime: &runtime::Runtime,
    client: Client,

    inputs: &Inputs<'heap, Global>,

    bytes: impl AsRef<[u8]>,
) -> Result<Value<'heap, Global>, BoxedDiagnostic<'static, SpanId>> {
    let ast = pipeline.parse(bytes)?;
    let (interner, entry, mut bodies) = pipeline.lower(ast)?;

    run_impl(
        pipeline,
        runtime,
        client,
        inputs,
        &interner,
        entry,
        &mut bodies,
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
    client: Client,

    inputs: &Inputs<'heap, Global>,

    interner: &Interner<'heap>,
    entry: DefId,
    bodies: &mut DefIdSlice<Body<'heap>>,
) -> Result<Value<'heap, Global>, BoxedDiagnostic<'static, SpanId>> {
    run_impl(pipeline, runtime, client, inputs, interner, entry, bodies)
}
