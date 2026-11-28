use alloc::alloc::Global;

use hash_graph_authorization::policies::action::ActionName;
use hashql_ast::error::AstDiagnosticCategory;
use hashql_core::{
    heap::{self, CollectIn as _, Heap, ScopeAllocator as _, Scratch},
    module::ModuleRegistry,
    span::SpanId,
    symbol::sym,
    r#type::environment::Environment,
};
use hashql_diagnostics::{
    DiagnosticIssues, IteratorStatusExt as _, Status, StatusExt as _, Success,
};
use hashql_eval::{
    context::{CodeExecutionContext, CodeGenerationContext},
    postgres::{PostgresCompiler, PreparedQueries},
};
use hashql_hir::{error::HirDiagnosticCategory, lower::LoweringResidual};
use hashql_mir::{
    body::Body,
    def::{DefId, DefIdVec},
    error::MirDiagnosticCategory,
    interpret::Inputs,
    pass::{
        LowerConfig,
        execution::{ExecutionAnalysisResidual, VertexType},
    },
    reify::from_hir_value_in,
};

use super::{
    error::HashQlDiagnosticCategory,
    source::{InputValues, ParsedRequest, RequestSources},
};

/// Free stack below which a query is compiled on a stack of its own.
const COMPILE_STACK_RED_ZONE: usize = 4 * 1024 * 1024;

/// Size of the stack a query is compiled on when the thread has less than
/// [`COMPILE_STACK_RED_ZONE`] free.
const COMPILE_STACK_SIZE: usize = 8 * 1024 * 1024;

pub(crate) struct CodeCompilationArtifact<'heap> {
    pub assignment: DefIdVec<Option<ExecutionAnalysisResidual<&'heap Heap>>, &'heap Heap>,

    pub interpreter: DefIdVec<Body<'heap>, &'heap Heap>,
    pub postgres: PreparedQueries<'heap, &'heap Heap>,
}

pub(crate) struct CodeExecutionPermissions<'heap> {
    pub actions: heap::Vec<'heap, ActionName>,
}

pub(crate) struct Compilation<'heap> {
    pub heap: &'heap Heap,

    pub interner: hashql_eval::intern::Interner<'heap>,
    pub env: Environment<'heap>,

    pub entrypoint: DefId,
    pub inputs: Inputs<'heap, Global>,
    pub artifact: CodeCompilationArtifact<'heap>,
    pub permissions: CodeExecutionPermissions<'heap>,
}

impl<'heap> Compilation<'heap> {
    pub(crate) fn compile<'request>(
        heap: &'heap Heap,
        scratch: &mut Scratch,
        query: &'request str,
        inputs: &'request InputValues,
    ) -> (
        Status<Self, HashQlDiagnosticCategory, SpanId>,
        RequestSources<'request>,
    ) {
        // The passes after the parser recurse once per level of nesting. A query nested to the
        // default limit of the parser needs more stack than a worker thread of the query pool
        // has, which is the 2 MiB default of a spawned thread.
        stacker::maybe_grow(COMPILE_STACK_RED_ZONE, COMPILE_STACK_SIZE, || {
            let (sources, parsed) =
                RequestSources::parse_in(heap, query, inputs, scratch.as_mut_scope());

            (Self::compile_parsed(heap, scratch, parsed), sources)
        })
    }

    #[expect(clippy::too_many_lines, reason = "orchestration of sequential tasks")]
    fn compile_parsed(
        heap: &'heap Heap,
        scratch: &mut Scratch,
        ParsedRequest { query, inputs }: ParsedRequest<'heap>,
    ) -> Status<Self, HashQlDiagnosticCategory, SpanId> {
        let scope = scratch.as_mut_scope();

        let Success {
            value: (mut ast, inputs),
            advisories,
        } = Status::zip(query, inputs).map_category(HashQlDiagnosticCategory::JExpr)?;

        let mut env = Environment::new(heap);
        let modules = ModuleRegistry::new(&env);

        // Lower the AST
        let Success {
            value: types,
            advisories,
        } = scope
            .scoped(|scope| {
                hashql_ast::lower::lower(sym::path::main, &mut ast, &env, &modules, scope)
            })
            .map_category(|category| {
                HashQlDiagnosticCategory::Ast(AstDiagnosticCategory::Lowering(category))
            })
            .with_diagnostics(advisories)?;

        let interner = hashql_hir::intern::Interner::new(heap);
        let mut hir_context = hashql_hir::context::HirContext::new(&interner, &modules);

        // Reify the HIR from the AST (value)
        let value_status = scope.scoped(|scope| {
            hashql_hir::node::NodeData::from_ast_in(ast, &mut hir_context, &types, scope)
        });
        let inputs_status = inputs
            .into_iter()
            .map(|(name, input)| {
                scope
                    .scoped(|scope| {
                        hashql_hir::node::Value::from_ast_in(input, &mut hir_context, scope)
                    })
                    .map_value(|input| (name, input))
            })
            .collect_status::<Vec<_>>();

        let Success {
            value: (hir, inputs),
            advisories,
        } = Status::zip(value_status, inputs_status)
            .map_category(|category| {
                HashQlDiagnosticCategory::Hir(HirDiagnosticCategory::Reification(category))
            })
            .with_diagnostics(advisories)?;

        // Lower the HIR
        let Success {
            value: (hir, LoweringResidual { inputs: parameters }),
            advisories,
        } = hashql_hir::lower::lower(hir, &types, &mut env, &mut hir_context)
            .map_category(|category| {
                HashQlDiagnosticCategory::Hir(HirDiagnosticCategory::Lowering(category))
            })
            .with_diagnostics(advisories)?;

        // now that we're HIR (pun intended), ensure that the inputs have the correct subtypes.
        let Success {
            value: (),
            advisories,
        } = scope
            .scoped(|scope| {
                hashql_hir::lower::checking::check_inputs(
                    &env,
                    &parameters,
                    inputs.iter().copied(),
                    scope,
                )
            })
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

        // Reify the MIR from the HIR
        let mir_value = scope.scoped(|scope| {
            let mut reify_context = hashql_mir::reify::ReifyContext {
                bodies: &mut bodies,
                mir: &mut mir_context,
                hir: &hir_context,
                scratch: &scope,
            };

            hashql_mir::reify::from_hir(hir, &mut reify_context)
                .map_category(|category| {
                    HashQlDiagnosticCategory::Mir(MirDiagnosticCategory::Reify(category))
                })
                .with_diagnostics(advisories)
        });

        let Success {
            value: entrypoint,
            advisories,
        } = mir_value?;

        let inputs: Inputs<_> = inputs
            .into_iter()
            .map(|(name, value)| {
                (
                    name,
                    scope
                        .scoped(|scope| from_hir_value_in(value, &interner.symbols, Global, scope)),
                )
            })
            .collect_in(Global);

        // Lower the MIR
        let Success {
            value: (),
            advisories,
        } = scope
            .scoped(|scope| {
                hashql_mir::pass::lower(
                    &mut mir_context,
                    scope,
                    &mut bodies,
                    &LowerConfig::default(),
                )
            })
            .map_category(HashQlDiagnosticCategory::Mir)
            .with_diagnostics(advisories)?;

        // Plan the execution
        let Success {
            value: execution,
            advisories,
        } = scope
            .scoped(|scope| hashql_mir::pass::place(&mut mir_context, scope, &mut bodies))
            .map_category(HashQlDiagnosticCategory::Mir)
            .with_diagnostics(advisories)?;

        // Build the postgres artifacts
        let interner = interner.into();
        let mut context =
            CodeGenerationContext::new_in(&env, &interner, &bodies, &execution, heap, scope);

        let queries = scope.scoped(|scope| {
            let mut postgres = PostgresCompiler::new_in(&mut context, scope);
            postgres.compile()
        });

        let mut actions = heap::Vec::new_in(heap);
        for query in queries.iter() {
            let action = match query.vertex_type {
                VertexType::Entity => ActionName::ViewEntity,
            };

            actions.push(action);
        }

        let permissions = CodeExecutionPermissions { actions };

        let Success {
            value: (),
            advisories,
        } = context
            .diagnostics
            .into_status(())
            .map_category(HashQlDiagnosticCategory::Eval)
            .with_diagnostics(advisories)?;

        Ok(Success {
            value: Self {
                heap,

                env,
                interner,
                entrypoint,
                inputs,
                artifact: CodeCompilationArtifact {
                    assignment: execution,
                    interpreter: bodies,
                    postgres: queries,
                },
                permissions,
            },
            advisories,
        })
    }

    #[expect(clippy::missing_const_for_fn, reason = "false positive")]
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

#[cfg(test)]
mod tests {
    use hashql_core::{
        heap::{Heap, Scratch, SymbolAllocator as _},
        span::SpanId,
    };
    use hashql_diagnostics::{Diagnostic, Label, Success, severity::Advisory};
    use hashql_mir::interpret::value::{Int, Value};
    use hashql_syntax_jexpr::error::{JExprDiagnosticCategory, ParserDiagnosticCategory};

    use super::Compilation;
    use crate::rest::internal::hashql::source::{InputValues, RequestSources};

    #[test]
    fn parser_advisory() {
        let inputs: InputValues = serde_json::from_str("{}").expect("the values should parse");

        let heap = Heap::new();
        let mut scratch = Scratch::new();
        let (_sources, mut parsed) = RequestSources::parse_in(
            &heap,
            r##"{"#literal": 1}"##,
            &inputs,
            scratch.as_mut_scope(),
        );

        parsed
            .query
            .as_mut()
            .expect("the query should parse")
            .advisories
            .push(
                Diagnostic::new(
                    JExprDiagnosticCategory::Parser(ParserDiagnosticCategory::ExpectedEof),
                    Advisory::WARNING,
                )
                .primary(Label::new(SpanId::SYNTHETIC, "warning of the parser")),
            );

        let compiled = Compilation::compile_parsed(&heap, &mut scratch, parsed)
            .expect("the query should compile");

        assert_eq!(compiled.advisories.len(), 1);
    }

    #[test]
    fn input_value() {
        let inputs: InputValues =
            serde_json::from_str(r##"{"x": {"#literal": 1}}"##).expect("the values should parse");

        let heap = Heap::new();
        let (compiled, _) = Compilation::compile(
            &heap,
            &mut Scratch::new(),
            r#"["input", "x", "Integer"]"#,
            &inputs,
        );
        let Success {
            value: compilation, ..
        } = compiled.expect("the query should compile");

        assert_eq!(
            compilation.inputs.get((&heap).alloc_symbol("x")),
            Some(&Value::Integer(Int::from(1_i32)))
        );
    }
}
