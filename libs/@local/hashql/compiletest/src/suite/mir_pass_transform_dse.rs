use std::io::Write as _;

use hashql_ast::node::expr::Expr;
use hashql_core::{
    heap::{Heap, Scratch},
    r#type::environment::Environment,
};
use hashql_diagnostics::DiagnosticIssues;
use hashql_mir::{
    body::Body,
    context::MirContext,
    def::{DefId, DefIdSlice, DefIdVec},
    intern::Interner,
    pass::{TransformPass as _, transform::DeadStoreElimination},
};

use super::{
    RunContext, Suite, SuiteDiagnostic, common::process_issues,
    mir_pass_transform_inst_simplify::mir_pass_transform_inst_simplify,
};
use crate::suite::{
    common::Header,
    mir_pass_transform_cfg_simplify::mir_pass_transform_cfg_simplify_default_renderer,
    mir_reify::{d2_output_enabled, mir_format_d2, mir_format_text, mir_spawn_d2},
};

pub(crate) fn mir_pass_transform_dse<'heap>(
    heap: &'heap Heap,
    expr: Expr<'heap>,
    interner: &Interner<'heap>,
    render: impl FnOnce(&'heap Heap, &Environment<'heap>, DefId, &DefIdSlice<Body<'heap>>),
    environment: &mut Environment<'heap>,
    diagnostics: &mut Vec<SuiteDiagnostic>,
) -> Result<(DefId, DefIdVec<Body<'heap>>, Scratch), SuiteDiagnostic> {
    let (root, mut bodies, mut scratch) =
        mir_pass_transform_inst_simplify(heap, expr, interner, render, environment, diagnostics)?;

    let mut context = MirContext {
        heap,
        env: environment,
        interner,
        diagnostics: DiagnosticIssues::new(),
    };

    // CFG -> SROA -> Inst -> DSE
    let mut pass = DeadStoreElimination::new_in(&mut scratch);
    for body in bodies.as_mut_slice() {
        pass.run(&mut context, body);
    }

    process_issues(diagnostics, context.diagnostics)?;
    Ok((root, bodies, scratch))
}

pub(crate) struct MirPassTransformDse;

impl Suite for MirPassTransformDse {
    fn priority(&self) -> usize {
        1
    }

    fn name(&self) -> &'static str {
        "mir/pass/transform/dse"
    }

    fn description(&self) -> &'static str {
        "Dead Store Elimination in the MIR"
    }

    fn secondary_file_extensions(&self) -> &[&str] {
        &["svg"]
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
        let mut environment = Environment::new(heap);
        let interner = Interner::new(heap);

        let mut buffer = Vec::new();
        let mut d2 = d2_output_enabled(self, suite_directives, reports).then(mir_spawn_d2);

        let (root, bodies, _) = mir_pass_transform_dse(
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

        let _ = writeln!(buffer, "\n{}\n", Header::new("MIR after DSE"));
        mir_format_text(heap, &environment, &mut buffer, root, &bodies);

        if let Some((mut writer, handle)) = d2 {
            writeln!(writer, "final: 'MIR after DSE' {{")
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
