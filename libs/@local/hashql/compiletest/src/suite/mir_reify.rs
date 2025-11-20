use std::{
    io::{BufWriter, Write as _},
    process::{Command, Stdio},
    thread,
    time::Instant,
};

use hashql_ast::node::expr::Expr;
use hashql_core::{
    heap::Heap,
    id::IdVec,
    module::ModuleRegistry,
    pretty::Formatter,
    span::SpanId,
    r#type::{TypeFormatter, TypeFormatterOptions, environment::Environment},
};
use hashql_hir::{context::HirContext, node::NodeData};
use hashql_mir::{
    body::Body,
    def::{DefId, DefIdVec},
    intern::Interner,
    pretty::{D2Buffer, D2Format, TextFormat},
};

use super::{RunContext, Suite, SuiteDiagnostic, common::process_status};
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
    let mut context = HirContext::new(&hir_interner, &registry);

    let result = hashql_ast::lowering::lower(
        heap.intern_symbol("::main"),
        &mut expr,
        environment,
        context.modules,
    );
    let types = process_status(diagnostics, result)?;

    let node = process_status(diagnostics, NodeData::from_ast(expr, &mut context, &types))?;

    let node = process_status(
        diagnostics,
        hashql_hir::lower::lower(node, &types, environment, &mut context),
    )?;

    let mut bodies = IdVec::new();
    let root = process_status(
        diagnostics,
        hashql_mir::reify::from_hir(
            node,
            &mut hashql_mir::reify::ReifyContext {
                bodies: &mut bodies,
                interner,
                environment,
                hir: &context,
                heap,
            },
        ),
    )?;

    Ok((root, bodies))
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
        let mut environment = Environment::new(SpanId::SYNTHETIC, heap);
        let interner = Interner::new(heap);

        let (root, bodies) = mir_reify(heap, expr, &interner, &mut environment, diagnostics)?;

        let formatter = Formatter::new(heap);
        let mut formatter = TypeFormatter::new(
            &formatter,
            &environment,
            TypeFormatterOptions::terse().with_qualified_opaque_names(true),
        );
        let mut text_format = TextFormat {
            writer: Vec::new(),
            indent: 4,
            sources: bodies.as_slice(),
            types: &mut formatter,
        };
        text_format
            .format(&bodies, &[root])
            .expect("should be able to write bodies");

        let output = String::from_utf8_lossy_owned(text_format.writer);

        let Some(d2) = suite_directives.get("d2") else {
            return Ok(output);
        };

        let Some(d2) = d2.as_bool() else {
            reports.capture(TrialError::Run(
                self.name(),
                "suite#d2 must be a valid boolean",
            ));

            return Ok(output);
        };

        if !d2 {
            return Ok(output);
        }

        let now = Instant::now();
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

        let mut d2_format = D2Format {
            writer,
            sources: bodies.as_slice(),
            dataflow: (),
            buffer: D2Buffer::default(),
            types: formatter,
        };
        d2_format
            .format(&bodies, &[root])
            .expect("should be able to write bodies");

        d2_format.writer.flush().expect("should be able to flush");
        drop(d2_format);

        let diagram = handle.join().expect("should be able to join handle");
        let diagram = String::from_utf8_lossy_owned(diagram);
        secondary_outputs.insert("svg", diagram);
        let taken = now.elapsed();
        tracing::info!("time taken to generate diagram: {:?}", taken);

        Ok(output)
    }
}
