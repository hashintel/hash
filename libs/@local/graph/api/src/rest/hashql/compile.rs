use hashql_ast::error::AstDiagnosticCategory;
use hashql_core::{
    heap::{Heap, ResetAllocator as _, Scratch},
    module::ModuleRegistry,
    span::{SpanId, SpanTable},
    symbol::sym,
    r#type::environment::Environment,
};
use hashql_diagnostics::{DiagnosticIssues, IntoStatus as _, Status, StatusExt as _, Success};
use hashql_eval::{
    context::{CodeExecutionContext, CodeGenerationContext},
    postgres::{PostgresCompiler, PreparedQueries},
};
use hashql_hir::error::HirDiagnosticCategory;
use hashql_mir::{
    body::Body,
    def::{DefId, DefIdVec},
    error::MirDiagnosticCategory,
    pass::{LowerConfig, execution::ExecutionAnalysisResidual},
};
use hashql_syntax_jexpr::span::Span;

use super::error::HashQlDiagnosticCategory;

pub(crate) struct CodeCompilationArtifact<'heap> {
    pub assignment: DefIdVec<Option<ExecutionAnalysisResidual<&'heap Heap>>, &'heap Heap>,

    pub interpreter: DefIdVec<Body<'heap>, &'heap Heap>,
    pub postgres: PreparedQueries<'heap, &'heap Heap>,
}

pub(crate) struct Compilation<'heap> {
    pub heap: &'heap Heap,

    pub root_span: SpanId,

    pub interner: hashql_eval::intern::Interner<'heap>,
    pub env: Environment<'heap>,

    pub entrypoint: DefId,
    pub artifact: CodeCompilationArtifact<'heap>,
}

impl<'heap> Compilation<'heap> {
    #[expect(clippy::too_many_lines, reason = "orchestration of sequential tasks")]
    pub(crate) fn compile(
        heap: &'heap Heap,
        scratch: &mut Scratch,
        spans: &mut SpanTable<Span>,
        query: &[u8],
    ) -> Status<Self, HashQlDiagnosticCategory, SpanId> {
        // Parse the query
        let mut parser = hashql_syntax_jexpr::Parser::new(heap, spans);
        let Success {
            value: mut ast,
            advisories,
        } = parser
            .parse_expr(query)
            .into_status()
            .map_category(HashQlDiagnosticCategory::JExpr)?;

        let root_span = ast.span;

        let mut env = Environment::new(heap);
        let modules = ModuleRegistry::new(&env);

        // Lower the AST
        let Success {
            value: types,
            advisories,
        } = hashql_ast::lower::lower(sym::path::main, &mut ast, &env, &modules, &mut *scratch)
            .map_category(|category| {
                HashQlDiagnosticCategory::Ast(AstDiagnosticCategory::Lowering(category))
            })
            .with_diagnostics(advisories)?;

        let interner = hashql_hir::intern::Interner::new(heap);
        let mut hir_context = hashql_hir::context::HirContext::new(&interner, &modules);

        // Reify the HIR from the AST
        let Success {
            value: hir,
            advisories,
        } = hashql_hir::node::NodeData::from_ast(ast, &mut hir_context, &types)
            .map_category(|category| {
                HashQlDiagnosticCategory::Hir(HirDiagnosticCategory::Reification(category))
            })
            .with_diagnostics(advisories)?;

        // Lower the HIR
        let Success {
            value: hir,
            advisories,
        } = hashql_hir::lower::lower(hir, &types, &mut env, &mut hir_context)
            .map_category(|category| {
                HashQlDiagnosticCategory::Hir(HirDiagnosticCategory::Lowering(category))
            })
            .with_diagnostics(advisories)?;

        let interner = hashql_mir::intern::Interner::new(heap);
        let mut bodies = DefIdVec::new_in(heap);
        let mut mir_context = hashql_mir::context::MirContext {
            heap,
            env: &env,
            interner: &interner,
            diagnostics: DiagnosticIssues::new(),
        };
        let mut reify_context = hashql_mir::reify::ReifyContext {
            bodies: &mut bodies,
            mir: &mut mir_context,
            hir: &hir_context,
            scratch: &*scratch,
        };

        // Reify the MIR from the HIR
        let Success {
            value: entrypoint,
            advisories,
        } = hashql_mir::reify::from_hir(hir, &mut reify_context)
            .map_category(|category| {
                HashQlDiagnosticCategory::Mir(MirDiagnosticCategory::Reify(category))
            })
            .with_diagnostics(advisories)?;

        // Lower the MIR
        let Success {
            value: (),
            advisories,
        } = hashql_mir::pass::lower(
            &mut mir_context,
            scratch,
            &mut bodies,
            &LowerConfig::default(),
        )
        .map_category(HashQlDiagnosticCategory::Mir)
        .with_diagnostics(advisories)?;

        // Plan the execution
        let Success {
            value: execution,
            advisories,
        } = hashql_mir::pass::place(&mut mir_context, scratch, &mut bodies)
            .map_category(HashQlDiagnosticCategory::Mir)
            .with_diagnostics(advisories)?;

        // Build the postgres artifacts
        let interner = interner.into();
        let mut context = CodeGenerationContext::new_in(
            &env,
            &interner,
            &bodies,
            &execution,
            heap,
            &mut *scratch,
        );

        let mut postgres = PostgresCompiler::new_in(&mut context, &mut *scratch);
        let queries = postgres.compile();
        scratch.reset();

        context
            .diagnostics
            .into_status(())
            .map_category(HashQlDiagnosticCategory::Eval)
            .with_diagnostics(advisories)?;

        Status::success(Self {
            heap,

            root_span,
            env,
            interner,
            entrypoint,
            artifact: CodeCompilationArtifact {
                assignment: execution,
                interpreter: bodies,
                postgres: queries,
            },
        })
    }

    pub(crate) fn context(&self) -> CodeExecutionContext<'_, 'heap, &'heap Heap> {
        CodeExecutionContext {
            env: &self.env,
            interner: &self.interner,
            bodies: &self.artifact.interpreter,
            execution: &self.artifact.assignment,
            alloc: self.heap,
        }
    }
}
