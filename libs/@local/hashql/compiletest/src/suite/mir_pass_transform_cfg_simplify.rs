use std::io::Write;

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
use crate::suite::{common::Header, mir_reify::mir_format_text};

pub(crate) fn mir_pass_transform_cfg_simplify_default_renderer(
    mut buffer: impl Write,
) -> impl for<'heap> FnOnce(&'heap Heap, &Environment<'heap>, DefId, &DefIdSlice<Body<'heap>>) {
    |heap, env, root, bodies| {
        writeln!(buffer, "{}\n", Header::new("Initial MIR"))
            .expect("should be able to write to buffer");
        mir_format_text(heap, env, buffer, root, bodies);
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
    fn name(&self) -> &'static str {
        "mir/pass/transform/cfg-simplify"
    }

    fn run<'heap>(
        &self,
        RunContext {
            heap, diagnostics, ..
        }: RunContext<'_, 'heap>,
        expr: Expr<'heap>,
    ) -> Result<String, SuiteDiagnostic> {
        let mut environment = Environment::new(SpanId::SYNTHETIC, heap);
        let interner = Interner::new(heap);

        let mut buffer = Vec::new();
        let (root, bodies) = mir_pass_transform_cfg_simplify(
            heap,
            expr,
            &interner,
            mir_pass_transform_cfg_simplify_default_renderer(&mut buffer),
            &mut environment,
            diagnostics,
        )?;

        let _ = writeln!(buffer, "{}\n", Header::new("MIR after CFG Simplification"));
        mir_format_text(heap, &environment, &mut buffer, root, &bodies);

        Ok(String::from_utf8_lossy_owned(buffer))
    }
}
