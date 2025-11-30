use std::{
    io::{BufWriter, Write},
    process::ChildStdin,
};

use hashql_ast::node::expr::Expr;
use hashql_core::{heap::Heap, span::SpanId, r#type::environment::Environment};
use hashql_diagnostics::DiagnosticIssues;
use hashql_mir::{
    body::Body,
    context::MirContext,
    def::{DefId, DefIdSlice, DefIdVec},
    intern::Interner,
    pass::{Pass as _, transform::CfgSimplify},
};

use super::{RunContext, Suite, SuiteDiagnostic, common::process_issues, mir_reify::mir_reify};
use crate::suite::{
    common::Header,
    mir_reify::{d2_output_enabled, mir_format_d2, mir_format_text, mir_spawn_d2},
};

pub(crate) fn mir_pass_transform_cfg_simplify_default_renderer(
    mut text: impl Write,
    d2: Option<&mut BufWriter<ChildStdin>>, // This is a concrete type so that `None` works
) -> impl for<'heap> FnOnce(&'heap Heap, &Environment<'heap>, DefId, &DefIdSlice<Body<'heap>>) {
    |heap, env, root, bodies| {
        writeln!(text, "{}\n", Header::new("Initial MIR"))
            .expect("should be able to write to buffer");
        mir_format_text(heap, env, text, root, bodies);

        if let Some(writer) = d2 {
            writeln!(writer, "initial: 'Initial MIR' {{")
                .expect("should be able to write to buffer");
            mir_format_d2(heap, env, &mut *writer, root, bodies);
            writeln!(writer, "}}").expect("should be able to write to buffer");
        }
    }
}

pub(crate) fn mir_pass_transform_cfg_simplify<'heap>(
    heap: &'heap Heap,
    expr: Expr<'heap>,
    interner: &Interner<'heap>,
    render: impl FnOnce(&'heap Heap, &Environment<'heap>, DefId, &DefIdSlice<Body<'heap>>),
    environment: &mut Environment<'heap>,
    diagnostics: &mut Vec<SuiteDiagnostic>,
) -> Result<(DefId, DefIdVec<Body<'heap>>), SuiteDiagnostic> {
    let (root, mut bodies) = mir_reify(heap, expr, interner, environment, diagnostics)?;

    render(heap, environment, root, &bodies);

    let mut context = MirContext {
        heap,
        env: environment,
        interner,
        diagnostics: DiagnosticIssues::new(),
    };

    let mut pass = CfgSimplify::new();
    for body in bodies.as_mut_slice() {
        pass.run(&mut context, body);
    }

    process_issues(diagnostics, context.diagnostics)?;

    Ok((root, bodies))
}

pub(crate) struct MirPassTransformCfgSimplify;

impl Suite for MirPassTransformCfgSimplify {
    fn priority(&self) -> usize {
        1
    }

    fn secondary_file_extensions(&self) -> &[&str] {
        &["svg"]
    }

    fn name(&self) -> &'static str {
        "mir/pass/transform/cfg-simplify"
    }

    fn run<'heap>(
        &self,
        RunContext {
            heap,
            diagnostics,
            suite_directives,
            reports,
            secondary_outputs,
            ..
        }: RunContext<'_, 'heap>,
        expr: Expr<'heap>,
    ) -> Result<String, SuiteDiagnostic> {
        let mut environment = Environment::new(SpanId::SYNTHETIC, heap);
        let interner = Interner::new(heap);

        let mut buffer = Vec::new();
        let mut d2 = d2_output_enabled(self, suite_directives, reports).then(mir_spawn_d2);

        let (root, bodies) = mir_pass_transform_cfg_simplify(
            heap,
            expr,
            &interner,
            mir_pass_transform_cfg_simplify_default_renderer(
                &mut buffer,
                d2.as_mut().map(|(writer, _)| writer),
            ),
            &mut environment,
            diagnostics,
        )?;

        let _ = writeln!(
            buffer,
            "\n{}\n",
            Header::new("MIR after CFG Simplification")
        );
        mir_format_text(heap, &environment, &mut buffer, root, &bodies);

        if let Some((mut writer, handle)) = d2 {
            writeln!(writer, "final: 'MIR after CFG Simplification' {{")
                .expect("should be able to write to buffer");
            mir_format_d2(heap, &environment, &mut writer, root, &bodies);
            writeln!(writer, "}}").expect("should be able to write to buffer");

            writer.flush().expect("should be able to write to buffer");
            drop(writer);

            let diagram = handle.join().expect("should be able to join handle");
            let diagram = String::from_utf8_lossy_owned(diagram);

            secondary_outputs.insert("svg", diagram);
        }

        Ok(String::from_utf8_lossy_owned(buffer))
    }
}
