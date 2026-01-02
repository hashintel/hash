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
    def::{DefId, DefIdVec},
    intern::Interner,
    pass::transform::{Inline, InlineConfig},
};

use super::{
    RunContext, Suite, SuiteDiagnostic,
    common::process_issues,
    mir_pass_transform_pre_inlining::{
        MirRenderer, RenderContext, Stage, mir_pass_transform_pre_inlining,
    },
};
use crate::suite::{
    mir_pass_transform_pre_inlining::{D2Renderer, TextRenderer},
    mir_reify::{d2_output_enabled, mir_spawn_d2},
};

pub(crate) fn mir_pass_transform_inline<'heap>(
    heap: &'heap Heap,
    expr: Expr<'heap>,
    config: InlineConfig,
    interner: &Interner<'heap>,
    mut render: impl MirRenderer,
    environment: &mut Environment<'heap>,
    diagnostics: &mut Vec<SuiteDiagnostic>,
) -> Result<(DefId, DefIdVec<Body<'heap>>, Scratch), SuiteDiagnostic> {
    let (root, mut bodies, mut scratch) = mir_pass_transform_pre_inlining(
        heap,
        expr,
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

    let mut pass = Inline::new_in(config, &mut scratch);
    pass.run(&mut context, &mut bodies);

    process_issues(diagnostics, context.diagnostics)?;

    render.render(
        &mut RenderContext {
            heap,
            env: environment,
            stage: Stage {
                id: "inline",
                title: "Inlined MIR",
            },
            root,
        },
        &bodies,
    );

    Ok((root, bodies, scratch))
}

pub(crate) struct MirPassTransformInline;

impl Suite for MirPassTransformInline {
    fn priority(&self) -> usize {
        1
    }

    fn name(&self) -> &'static str {
        "mir/pass/transform/inline"
    }

    fn description(&self) -> &'static str {
        "Inlining in the MIR"
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

        let mut config = InlineConfig::default();

        #[expect(clippy::cast_sign_loss, clippy::cast_possible_truncation)]
        if let Some(aggressive_inline_cutoff) = suite_directives
            .get("aggressive-inline-cutoff")
            .and_then(toml::Value::as_integer)
        {
            config.aggressive_inline_cutoff = aggressive_inline_cutoff as usize;
        }

        let mut buffer = Vec::new();
        let mut d2 = d2_output_enabled(self, suite_directives, reports).then(mir_spawn_d2);

        mir_pass_transform_inline(
            heap,
            expr,
            config,
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
