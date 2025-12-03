use std::{
    io::{self, BufWriter, Write as _},
    process::{ChildStdin, Command, Stdio},
    thread::{self, JoinHandle},
    time::Instant,
};

use error_stack::ReportSink;
use hashql_ast::node::expr::Expr;
use hashql_core::{
    heap::Heap,
    id::IdVec,
    module::ModuleRegistry,
    pretty::Formatter,
    r#type::{TypeFormatter, TypeFormatterOptions, environment::Environment},
};
use hashql_hir::{context::HirContext, node::NodeData};
use hashql_mir::{
    body::Body,
    context::MirContext,
    def::{DefId, DefIdSlice, DefIdVec},
    intern::Interner,
    pretty::{D2Buffer, D2Format, TextFormat},
};

use super::{RunContext, Suite, SuiteDiagnostic, SuiteDirectives, common::process_status};
use crate::executor::TrialError;

pub(crate) fn mir_reify<'heap>(
    heap: &'heap Heap,
    mut expr: Expr<'heap>,
    interner: &Interner<'heap>,
    environment: &mut Environment<'heap>,
    diagnostics: &mut Vec<SuiteDiagnostic>,
) -> Result<(DefId, DefIdVec<Body<'heap>>), SuiteDiagnostic> {
    let registry = ModuleRegistry::new(environment);
    let hir_interner = hashql_hir::intern::Interner::new(heap);
    let mut hir_context = HirContext::new(&hir_interner, &registry);

    let result = hashql_ast::lowering::lower(
        heap.intern_symbol("::main"),
        &mut expr,
        environment,
        hir_context.modules,
    );
    let types = process_status(diagnostics, result)?;

    let node = process_status(
        diagnostics,
        NodeData::from_ast(expr, &mut hir_context, &types),
    )?;

    let node = process_status(
        diagnostics,
        hashql_hir::lower::lower(node, &types, environment, &mut hir_context),
    )?;

    let mut mir_context = MirContext::new(environment, interner);

    let mut bodies = IdVec::new();
    let root = process_status(
        diagnostics,
        hashql_mir::reify::from_hir(
            node,
            &mut hashql_mir::reify::ReifyContext {
                bodies: &mut bodies,
                mir: &mut mir_context,
                hir: &hir_context,
            },
        ),
    )?;

    Ok((root, bodies))
}

pub(crate) fn mir_format_text<'heap>(
    heap: &'heap Heap,
    env: &Environment<'heap>,
    writer: impl io::Write,
    root: DefId,
    bodies: &DefIdSlice<Body<'heap>>,
) {
    let formatter = Formatter::new(heap);
    let types = TypeFormatter::new(
        &formatter,
        env,
        TypeFormatterOptions::terse().with_qualified_opaque_names(true),
    );

    let mut text_format = TextFormat {
        writer,
        indent: 4,
        sources: bodies,
        types,
    };
    text_format
        .format(bodies, &[root])
        .expect("should be able to write bodies");
}

pub(crate) fn mir_format_d2<'heap>(
    heap: &'heap Heap,
    env: &Environment<'heap>,
    writer: impl io::Write,
    root: DefId,
    bodies: &DefIdSlice<Body<'heap>>,
) {
    let formatter = Formatter::new(heap);
    let types = TypeFormatter::new(
        &formatter,
        env,
        TypeFormatterOptions::terse().with_qualified_opaque_names(true),
    );

    let mut d2_format = D2Format {
        writer,
        sources: bodies,
        dataflow: (),
        buffer: D2Buffer::default(),
        types,
    };
    d2_format
        .format(bodies, &[root])
        .expect("should be able to write bodies");
}

pub(crate) fn d2_output_enabled(
    this: &impl Suite,
    directives: &SuiteDirectives,
    reports: &mut ReportSink<TrialError>,
) -> bool {
    let Some(d2) = directives.get("d2") else {
        return false;
    };

    let Some(d2) = d2.as_bool() else {
        reports.capture(TrialError::Run(
            this.name(),
            "suite#d2 must be a valid boolean",
        ));

        return false;
    };

    d2
}

pub(crate) fn mir_spawn_d2() -> (BufWriter<ChildStdin>, JoinHandle<Vec<u8>>) {
    let mut child = Command::new("d2")
        .args(["-l", "elk", "-b=false", "--stdout-format", "svg", "-"])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .spawn()
        .expect("should be able to spawn d2");

    let stdin = child.stdin.take().expect("should be able to take stdin");
    let writer = BufWriter::new(stdin);

    let handle = thread::spawn(move || {
        // We cannot Sync/Send the actual bodies, so instead we create a thread to wait for the
        // output.
        child
            .wait_with_output()
            .expect("should be able to wait for d2")
            .stdout
    });

    (writer, handle)
}

pub(crate) struct MirReifySuite;

impl Suite for MirReifySuite {
    fn priority(&self) -> usize {
        // bump the priority, so that it is run before others, to offset the needed increased time
        // for diagram generation (700ms-800ms)
        1
    }

    fn secondary_file_extensions(&self) -> &[&str] {
        &["svg"]
    }

    fn name(&self) -> &'static str {
        "mir/reify"
    }

    fn run<'heap>(
        &self,
        RunContext {
            heap,
            diagnostics,
            suite_directives,
            secondary_outputs,
            reports,
            ..
        }: RunContext<'_, 'heap>,
        expr: Expr<'heap>,
    ) -> Result<String, SuiteDiagnostic> {
        let mut environment = Environment::new(heap);
        let interner = Interner::new(heap);

        let (root, bodies) = mir_reify(heap, expr, &interner, &mut environment, diagnostics)?;

        let mut buffer = Vec::new();
        mir_format_text(heap, &environment, &mut buffer, root, &bodies);

        let output = String::from_utf8_lossy_owned(buffer);

        if !d2_output_enabled(self, suite_directives, reports) {
            return Ok(output);
        }

        let now = Instant::now();
        let (mut writer, handle) = mir_spawn_d2();

        mir_format_d2(heap, &environment, &mut writer, root, &bodies);
        writer.flush().expect("should be able to flush");
        drop(writer);

        let diagram = handle.join().expect("should be able to join handle");
        let diagram = String::from_utf8_lossy_owned(diagram);

        let taken = now.elapsed();
        tracing::info!("time taken to generate diagram: {:?}", taken);

        secondary_outputs.insert("svg", diagram);

        Ok(output)
    }
}
