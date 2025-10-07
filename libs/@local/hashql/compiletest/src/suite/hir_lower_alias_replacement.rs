use core::fmt::Write as _;

use hashql_ast::{lowering::lower, node::expr::Expr};
use hashql_core::{
    heap::Heap,
    module::ModuleRegistry,
    pretty::{PrettyOptions, PrettyPrint as _},
    span::SpanId,
    r#type::environment::Environment,
};
use hashql_diagnostics::DiagnosticIssues;
use hashql_hir::{
    context::HirContext, fold::Fold as _, intern::Interner, lower::alias::AliasReplacement,
    node::Node, pretty::PrettyPrintEnvironment,
};

use super::{Suite, SuiteDiagnostic};
use crate::suite::common::{Header, process_issues, process_status};

pub(crate) struct HirLowerAliasReplacementSuite;

impl Suite for HirLowerAliasReplacementSuite {
    fn name(&self) -> &'static str {
        "hir/lower/alias-replacement"
    }

    fn run<'heap>(
        &self,
        heap: &'heap Heap,
        mut expr: Expr<'heap>,
        diagnostics: &mut Vec<SuiteDiagnostic>,
    ) -> Result<String, SuiteDiagnostic> {
        let environment = Environment::new(SpanId::SYNTHETIC, heap);
        let registry = ModuleRegistry::new(&environment);
        let interner = Interner::new(heap);
        let mut context = HirContext::new(&interner, &registry);

        let mut output = String::new();

        let result = lower(
            heap.intern_symbol("::main"),
            &mut expr,
            &environment,
            &registry,
        );
        let types = process_status(diagnostics, result)?;

        let node = process_status(diagnostics, Node::from_ast(expr, &mut context, &types))?;

        let _ = writeln!(
            output,
            "{}\n\n{}",
            Header::new("Initial HIR"),
            node.pretty_print(
                &PrettyPrintEnvironment {
                    env: &environment,
                    symbols: &context.symbols,
                },
                PrettyOptions::default().without_color()
            )
        );

        let mut issues = DiagnosticIssues::new();
        let mut replacement = AliasReplacement::new(&context, &mut issues);
        let Ok(node) = replacement.fold_node(node);

        process_issues(diagnostics, issues)?;

        let _ = writeln!(
            output,
            "\n{}\n\n{}",
            Header::new("HIR after alias replacement"),
            node.pretty_print(
                &PrettyPrintEnvironment {
                    env: &environment,
                    symbols: &context.symbols,
                },
                PrettyOptions::default().without_color()
            )
        );

        Ok(output)
    }
}
