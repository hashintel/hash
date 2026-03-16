use core::mem;
use std::alloc::Global;

use hashql_compiletest::pipeline::Pipeline;
use hashql_core::{
    heap::{Heap, ResetAllocator as _},
    span::SpanId,
};
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

fn execute_impl<'heap>(
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

    let mut diagnostics = mem::take(&mut context.diagnostics);
    pipeline.diagnostics.append(&mut diagnostics.boxed());

    let orchestrator = Orchestrator::new(client, &queries, &context);

    runtime
        .block_on(orchestrator.run(inputs, entry, []))
        .map_err(Diagnostic::boxed)
}

pub(crate) fn execute_parse<'heap>(
    runtime: &runtime::Runtime,
    client: Client,

    heap: &'heap Heap,
    inputs: &Inputs<'heap, Global>,

    bytes: impl AsRef<[u8]>,
) -> Result<Value<'heap, Global>, BoxedDiagnostic<'static, SpanId>> {
    let mut pipeline = Pipeline::new(heap);

    let ast = pipeline.parse(bytes)?;
    let (interner, entry, mut bodies) = pipeline.lower(ast)?;

    execute_impl(
        &mut pipeline,
        runtime,
        client,
        inputs,
        &interner,
        entry,
        &mut bodies,
    )
}

pub(crate) fn execute<'heap>(
    runtime: &runtime::Runtime,
    client: Client,

    heap: &'heap Heap,
    inputs: &Inputs<'heap, Global>,

    interner: &Interner<'heap>,
    entry: DefId,
    bodies: &mut DefIdSlice<Body<'heap>>,
) -> Result<Value<'heap, Global>, BoxedDiagnostic<'static, SpanId>> {
    let mut pipeline = Pipeline::new(heap);

    execute_impl(
        &mut pipeline,
        runtime,
        client,
        inputs,
        interner,
        entry,
        bodies,
    )
}
