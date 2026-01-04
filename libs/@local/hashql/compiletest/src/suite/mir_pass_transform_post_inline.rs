use std::io::Write as _;

use hashql_ast::node::expr::Expr;
use hashql_core::{
    heap::{Heap, ResetAllocator as _, Scratch},
    r#type::environment::Environment,
};
use hashql_diagnostics::DiagnosticIssues;
use hashql_mir::{
    body::Body,
    context::MirContext,
    def::{DefId, DefIdVec},
    intern::Interner,
    pass::{
        Changed, GlobalTransformPass as _, GlobalTransformState,
        transform::{InlineConfig, PostInline},
    },
};

use super::{
    RunContext, Suite, SuiteDiagnostic,
    common::process_issues,
    mir_pass_transform_inline::mir_pass_transform_inline,
    mir_pass_transform_pre_inline::{MirRenderer, RenderContext, Stage},
};
use crate::suite::{
    mir_pass_transform_pre_inline::{D2Renderer, TextRenderer},
    mir_reify::{d2_output_enabled, mir_spawn_d2},
};

pub(crate) fn mir_pass_transform_post_inline<'heap>(
    heap: &'heap Heap,
    expr: Expr<'heap>,

    interner: &Interner<'heap>,
    mut render: impl MirRenderer,
    environment: &mut Environment<'heap>,
    diagnostics: &mut Vec<SuiteDiagnostic>,
) -> Result<(DefId, DefIdVec<Body<'heap>>, Scratch), SuiteDiagnostic> {
    let (root, mut bodies, mut scratch) = mir_pass_transform_inline(
        heap,
        expr,
        InlineConfig::default(),
        interner,
        &mut render,
        environment,
        diagnostics,
    )?;

    let mut context = MirContext {
        heap,
        env: environment,
        interner,
        diagnostics: DiagnosticIssues::new(),
    };

    let mut pass = PostInline::new_in(&mut scratch);
    let _: Changed = pass.run(
        &mut context,
        &mut GlobalTransformState::new_in(&bodies, heap),
        &mut bodies,
    );
    scratch.reset();

    process_issues(diagnostics, context.diagnostics)?;

    render.render(
        &mut RenderContext {
            heap,
            env: environment,
            stage: Stage {
                id: "post-inline",
                title: "Post Inline MIR",
            },
            root,
        },
        &bodies,
    );

    Ok((root, bodies, scratch))
}

pub(crate) struct MirPassTransformPostInline;

impl Suite for MirPassTransformPostInline {
    fn priority(&self) -> usize {
        1
    }

    fn name(&self) -> &'static str {
        "mir/pass/transform/post-inline"
    }

    fn description(&self) -> &'static str {
        "Post inlining in the MIR"
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

        mir_pass_transform_post_inline(
            heap,
            expr,
            &interner,
            (
                TextRenderer::new(&mut buffer),
                d2.as_mut().map(|(writer, _)| D2Renderer::new(writer)),
            ),
            &mut environment,
            diagnostics,
        )?;

        if let Some((mut writer, handle)) = d2 {
            writer.flush().expect("should be able to write to buffer");
            drop(writer);

            let diagram = handle.join().expect("should be able to join handle");
            let diagram = String::from_utf8_lossy_owned(diagram);

            secondary_outputs.insert("svg", diagram);
        }

        Ok(String::from_utf8_lossy_owned(buffer))
    }
}
