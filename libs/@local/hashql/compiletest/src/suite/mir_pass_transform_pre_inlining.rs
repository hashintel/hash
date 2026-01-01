use std::io::{self, Write as _};

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
    pass::{Changed, GlobalTransformPass as _, GlobalTransformState, transform::PreInlining},
};

use super::{RunContext, Suite, SuiteDiagnostic, common::process_issues, mir_reify::mir_reify};
use crate::suite::{
    common::Header,
    mir_reify::{d2_output_enabled, mir_format_d2, mir_format_text, mir_spawn_d2},
};

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct Stage {
    id: &'static str,
    title: &'static str,
}

pub(crate) struct RenderContext<'env, 'heap> {
    pub heap: &'heap Heap,
    pub env: &'env Environment<'heap>,
    pub stage: Stage,
    pub root: DefId,
}

pub(crate) trait MirRenderer {
    fn render<'heap>(
        &mut self,
        context: &mut RenderContext<'_, 'heap>,
        bodies: &DefIdSlice<Body<'heap>>,
    );
}

impl<R> MirRenderer for &mut R
where
    R: MirRenderer,
{
    fn render<'heap>(
        &mut self,
        context: &mut RenderContext<'_, 'heap>,
        bodies: &DefIdSlice<Body<'heap>>,
    ) {
        R::render(self, context, bodies);
    }
}

impl<R> MirRenderer for Option<R>
where
    R: MirRenderer,
{
    fn render<'heap>(&mut self, _: &mut RenderContext<'_, 'heap>, _: &DefIdSlice<Body<'heap>>) {}
}

pub(crate) struct TextRenderer<W> {
    inner: W,
    index: usize,
}

impl<W> TextRenderer<W> {
    pub(crate) const fn new(inner: W) -> Self {
        Self { inner, index: 0 }
    }
}

impl<W> MirRenderer for TextRenderer<W>
where
    W: io::Write,
{
    fn render<'heap>(
        &mut self,
        RenderContext {
            heap,
            env,
            stage: Stage {
                id: _,
                title: header,
            },
            root,
        }: &mut RenderContext<'_, 'heap>,
        bodies: &DefIdSlice<Body<'heap>>,
    ) {
        if self.index > 0 {
            write!(self.inner, "\n\n").expect("should be able to write to buffer");
        }

        writeln!(self.inner, "{}\n", Header::new(header))
            .expect("should be able to write to buffer");
        mir_format_text(heap, env, &mut self.inner, *root, bodies);
        self.index += 1;
    }
}

pub(crate) struct D2Renderer<W> {
    inner: W,
}

impl<W> D2Renderer<W> {
    pub(crate) const fn new(inner: W) -> Self {
        Self { inner }
    }
}

impl<W> MirRenderer for D2Renderer<W>
where
    W: io::Write,
{
    fn render<'heap>(
        &mut self,
        RenderContext {
            heap,
            env,
            stage: Stage { id, title: header },
            root,
        }: &mut RenderContext<'_, 'heap>,
        bodies: &DefIdSlice<Body<'heap>>,
    ) {
        writeln!(self.inner, "{id}: '{header}' {{").expect("should be able to write to buffer");
        mir_format_d2(heap, env, &mut self.inner, *root, bodies);
        writeln!(self.inner, "}}").expect("should be able to write to buffer");
    }
}

impl<A, B> MirRenderer for (A, B)
where
    A: MirRenderer,
    B: MirRenderer,
{
    #[expect(clippy::min_ident_chars)]
    fn render<'heap>(
        &mut self,
        context: &mut RenderContext<'_, 'heap>,
        bodies: &DefIdSlice<Body<'heap>>,
    ) {
        let (a, b) = self;

        a.render(context, bodies);
        b.render(context, bodies);
    }
}

pub(crate) fn mir_pass_transform_pre_inlining<'heap>(
    heap: &'heap Heap,
    expr: Expr<'heap>,
    interner: &Interner<'heap>,
    mut render: impl MirRenderer,
    environment: &mut Environment<'heap>,
    diagnostics: &mut Vec<SuiteDiagnostic>,
) -> Result<(DefId, DefIdVec<Body<'heap>>, Scratch), SuiteDiagnostic> {
    let (root, mut bodies) = mir_reify(heap, expr, interner, environment, diagnostics)?;

    render.render(
        &mut RenderContext {
            heap,
            env: environment,
            stage: Stage {
                id: "initial",
                title: "Initial MIR",
            },
            root,
        },
        &bodies,
    );

    let mut context = MirContext {
        heap,
        env: environment,
        interner,
        diagnostics: DiagnosticIssues::new(),
    };
    let mut scratch = Scratch::new();

    let mut pass = PreInlining::new_in(&mut scratch);
    let _: Changed = pass.run(
        &mut context,
        &mut GlobalTransformState::new_in(&bodies, heap),
        &mut bodies,
    );

    process_issues(diagnostics, context.diagnostics)?;

    render.render(
        &mut RenderContext {
            heap,
            env: environment,
            stage: Stage {
                id: "pre-inlining",
                title: "Pre-inlining MIR",
            },
            root,
        },
        &bodies,
    );

    Ok((root, bodies, scratch))
}

pub(crate) struct MirPassTransformPreInlining;

impl Suite for MirPassTransformPreInlining {
    fn priority(&self) -> usize {
        1
    }

    fn secondary_file_extensions(&self) -> &[&str] {
        &["svg"]
    }

    fn name(&self) -> &'static str {
        "mir/pass/transform/pre-inlining"
    }

    fn description(&self) -> &'static str {
        "Pre-inlining transformations in the MIR"
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

        mir_pass_transform_pre_inlining(
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
