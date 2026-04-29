//! Staged compilation pipeline from J-Expr source to prepared SQL queries.
//!
//! [`Pipeline`] drives the full HashQL compilation sequence: parsing J-Expr
//! source into an AST, lowering through HIR and MIR, running optimization and
//! execution analysis passes, and finally compiling to [`PreparedQueries`]
//! ready for PostgreSQL execution.
//!
//! Each stage is exposed as a separate method so callers can inspect or test
//! intermediate results. Diagnostics (warnings, advisories) accumulate in
//! [`Pipeline::diagnostics`] across all stages; fatal errors are returned
//! immediately as [`BoxedDiagnostic`].
//!
//! Intended for use by the compiletest harness and integration test binaries
//! that need the full compilation pipeline without assembling it from
//! individual crate APIs.

use hashql_core::{
    heap::{Heap, ResetAllocator as _, Scratch},
    module::ModuleRegistry,
    span::{SpanId, SpanTable},
    r#type::environment::Environment,
};
use hashql_diagnostics::{
    Diagnostic, DiagnosticCategory, Failure, Status, Success, diagnostic::BoxedDiagnostic,
    issues::BoxedDiagnosticIssues, source::SourceId,
};
use hashql_hir::context::HirContext;
use hashql_mir::{
    body::Body,
    context::MirContext,
    def::{DefId, DefIdSlice, DefIdVec},
    pass::{
        Changed, GlobalAnalysisPass as _, GlobalTransformPass as _, GlobalTransformState,
        analysis::SizeEstimationAnalysis,
        execution::{ExecutionAnalysis, ExecutionAnalysisResidual},
        transform::{Inline, InlineConfig, PostInline, PreInline},
    },
    reify::ReifyContext,
};
use hashql_syntax_jexpr::span::Span;

/// Unwraps a [`Status`] into its success value, draining advisories and
/// secondary diagnostics into the shared accumulator.
///
/// On failure, secondary diagnostics are drained and the primary diagnostic
/// is returned as the error.
fn process_status<T, C>(
    diagnostics: &mut BoxedDiagnosticIssues<'static, SpanId>,
    status: Status<T, C, SpanId>,
) -> Result<T, BoxedDiagnostic<'static, SpanId>>
where
    C: DiagnosticCategory + 'static,
{
    match status {
        Ok(Success { value, advisories }) => {
            diagnostics.extend(
                advisories
                    .into_iter()
                    .map(|advisory| advisory.generalize().boxed()),
            );

            Ok(value)
        }
        Err(Failure { primary, secondary }) => {
            diagnostics.extend(secondary.into_iter().map(Diagnostic::boxed));

            Err(primary.generalize().boxed())
        }
    }
}

macro_rules! bind_tri {
    ($diagnostics:expr) => {
        macro_rules! tri {
            ($$status:expr) => {
                process_status($diagnostics, $$status)?
            };
        }
    };
}

/// Staged compilation driver from J-Expr source to prepared SQL queries.
///
/// Owns the shared compilation state (heap reference, type environment, span
/// table, scratch allocator) and accumulates non-fatal diagnostics across
/// stages. Call the methods in order:
///
/// 1. [`parse`](Self::parse): J-Expr bytes to AST
/// 2. [`lower`](Self::lower): AST through HIR to MIR bodies
/// 3. [`transform`](Self::transform): MIR optimization passes (inlining)
/// 4. [`prepare`](Self::prepare): execution analysis
///
/// After each stage, check [`diagnostics`](Self::diagnostics) for warnings.
/// Fatal errors short-circuit via the `Result` return.
pub struct Pipeline<'heap> {
    pub heap: &'heap Heap,
    pub scratch: Scratch,
    pub env: Environment<'heap>,
    pub spans: SpanTable<Span>,
    pub diagnostics: BoxedDiagnosticIssues<'static, SpanId>,
}

impl<'heap> Pipeline<'heap> {
    /// Creates a new pipeline bound to `heap`.
    ///
    /// Initializes the type environment, span table, scratch allocator, and
    /// an empty diagnostic accumulator.
    pub fn new(heap: &'heap Heap) -> Self {
        Self {
            heap,
            env: Environment::new(heap),
            spans: SpanTable::new(SourceId::new_unchecked(0x00)),
            diagnostics: BoxedDiagnosticIssues::default(),
            scratch: Scratch::new(),
        }
    }

    /// Parses J-Expr source bytes into an AST expression.
    ///
    /// # Errors
    ///
    /// Returns a diagnostic if the input is not valid J-Expr syntax.
    pub fn parse(
        &mut self,
        content: impl AsRef<[u8]>,
    ) -> Result<hashql_ast::node::expr::Expr<'heap>, BoxedDiagnostic<'static, SpanId>> {
        let mut parser = hashql_syntax_jexpr::Parser::new(self.heap, &mut self.spans);

        parser
            .parse_expr(content.as_ref())
            .map_err(Diagnostic::boxed)
    }

    /// Lowers an AST expression through HIR into MIR.
    ///
    /// Performs AST type lowering, HIR node construction, HIR specialization
    /// and lowering, then reifies the result into MIR bodies. Returns the
    /// MIR interner, the entry definition, and the complete set of bodies.
    ///
    /// # Errors
    ///
    /// Returns a diagnostic if any lowering stage fails (type resolution,
    /// HIR construction, specialization, or MIR reification).
    pub fn lower(
        &mut self,
        mut expr: hashql_ast::node::expr::Expr<'heap>,
    ) -> Result<
        (
            hashql_mir::intern::Interner<'heap>,
            DefId,
            DefIdVec<Body<'heap>>,
        ),
        BoxedDiagnostic<'static, SpanId>,
    > {
        bind_tri!(&mut self.diagnostics);
        let registry = ModuleRegistry::new(&self.env);

        let types = tri!(hashql_ast::lowering::lower(
            self.heap.intern_symbol("::main"),
            &mut expr,
            &self.env,
            &registry,
        ));

        let hir_interner = hashql_hir::intern::Interner::new(self.heap);
        let mut hir_context = HirContext::new(&hir_interner, &registry);

        let node = tri!(hashql_hir::node::NodeData::from_ast(
            expr,
            &mut hir_context,
            &types
        ));

        let node = tri!(hashql_hir::lower::lower(
            node,
            &types,
            &mut self.env,
            &mut hir_context,
        ));

        let mut bodies = DefIdVec::new();

        let mir_interner = hashql_mir::intern::Interner::new(self.heap);
        let mut mir_context = MirContext::new(&self.env, &mir_interner);
        let mut reify_context = ReifyContext {
            bodies: &mut bodies,
            mir: &mut mir_context,
            hir: &hir_context,
        };

        let entry = tri!(hashql_mir::reify::from_hir(node, &mut reify_context));

        // drain the context, because we're going to re-create it
        self.diagnostics.extend(
            mir_context
                .diagnostics
                .into_iter()
                .map(hashql_diagnostics::Diagnostic::boxed),
        );

        Ok((mir_interner, entry, bodies))
    }

    /// Runs MIR optimization passes on the body set.
    ///
    /// Applies pre-inline cleanup, function inlining, and post-inline
    /// simplification in sequence. Bodies are modified in place.
    ///
    /// # Errors
    ///
    /// Returns a diagnostic if any transform pass emits a fatal error.
    pub fn transform(
        &mut self,
        interner: &hashql_mir::intern::Interner<'heap>,
        bodies: &mut DefIdSlice<Body<'heap>>,
    ) -> Result<(), BoxedDiagnostic<'static, SpanId>> {
        let mut context = MirContext::new(&self.env, interner);
        let mut state = GlobalTransformState::new_in(&*bodies, self.heap);

        self.scratch.reset();

        let mut pass = PreInline::new_in(&mut self.scratch);
        let _: Changed = pass.run(&mut context, &mut state, bodies);
        self.scratch.reset();

        let mut pass = Inline::new_in(InlineConfig::default(), &mut self.scratch);
        let _: Changed = pass.run(&mut context, &mut state, bodies);
        self.scratch.reset();

        let mut pass = PostInline::new_in(&mut self.scratch);
        let _: Changed = pass.run(&mut context, &mut state, bodies);
        self.scratch.reset();

        let status = context.diagnostics.generalize().boxed().into_status(());
        process_status(&mut self.diagnostics, status)?;

        Ok(())
    }

    /// Runs execution analysis and compiles MIR bodies to prepared SQL queries.
    ///
    /// Performs size estimation, execution island analysis (determining which
    /// parts of each body run on PostgreSQL vs the interpreter), then compiles
    /// the PostgreSQL islands into [`PreparedQueries`] containing the SQL
    /// statements, parameter bindings, and column descriptors.
    ///
    /// # Errors
    ///
    /// Returns a diagnostic if execution analysis or SQL compilation fails.
    pub fn prepare<'bodies>(
        &mut self,
        interner: &hashql_mir::intern::Interner<'heap>,
        bodies: &'bodies mut DefIdSlice<Body<'heap>>,
    ) -> Result<
        DefIdVec<Option<ExecutionAnalysisResidual<&'heap Heap>>, &'heap Heap>,
        BoxedDiagnostic<'static, SpanId>,
    > {
        let mut context = MirContext::new(&self.env, interner);

        let mut pass = SizeEstimationAnalysis::new_in(&self.scratch);
        pass.run(&mut context, bodies);
        let footprints = pass.finish();
        self.scratch.reset();

        let pass = ExecutionAnalysis {
            footprints: &footprints,
            scratch: &mut self.scratch,
        };
        let analysis = pass.run_all_in(&mut context, bodies, self.heap);
        self.scratch.reset();

        let status = context.diagnostics.generalize().boxed().into_status(());
        process_status(&mut self.diagnostics, status)?;

        Ok(analysis)
    }
}
