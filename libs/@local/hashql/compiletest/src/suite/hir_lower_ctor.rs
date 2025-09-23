use core::fmt::Write as _;

use hashql_ast::{lowering::lower, node::expr::Expr};
use hashql_core::{
    heap::Heap,
    module::ModuleRegistry,
    pretty::{PrettyOptions, PrettyPrint as _},
    span::SpanId,
    r#type::environment::Environment,
};
use hashql_hir::{
    fold::Fold as _,
    intern::Interner,
    lower::{alias::AliasReplacement, ctor::ConvertTypeConstructor},
    node::Node,
};

use super::{
    Suite, SuiteDiagnostic,
    common::{Header, process_diagnostics},
};
use crate::suite::common::process_diagnostic_result;

pub(crate) struct HirLowerCtorSuite;

impl Suite for HirLowerCtorSuite {
    fn name(&self) -> &'static str {
        "hir/lower/ctor"
    }

    fn run<'heap>(
        &self,
        heap: &'heap Heap,
        mut expr: Expr<'heap>,
        diagnostics: &mut Vec<SuiteDiagnostic>,
    ) -> Result<String, SuiteDiagnostic> {
        let environment = Environment::new(SpanId::SYNTHETIC, heap);
        let registry = ModuleRegistry::new(&environment);
        let mut output = String::new();

        let result = lower(
            heap.intern_symbol("::main"),
            &mut expr,
            &environment,
            &registry,
        );
        let types = process_diagnostic_result(diagnostics, result)?;

        let interner = Interner::new(heap);
        let (node, reify_diagnostics) = Node::from_ast(expr, &environment, &interner, &types);
        process_diagnostics(diagnostics, reify_diagnostics)?;

        let node = node.expect("should be `Some` if there are non-fatal errors");

        let _ = writeln!(
            output,
            "{}\n\n{}",
            Header::new("Initial HIR"),
            node.pretty_print(&environment, PrettyOptions::default().without_color())
        );

        let mut replacement = AliasReplacement::new(&interner);
        let Ok(node) = replacement.fold_node(node);

        let mut converter =
            ConvertTypeConstructor::new(&interner, &types.locals, &registry, &environment);

        let node = match converter.fold_node(node) {
            Ok(node) => node,
            Err(reported) => {
                let diagnostic = process_diagnostics(diagnostics, reported)
                    .expect_err("reported diagnostics should always be fatal");
                return Err(diagnostic);
            }
        };

        let _ = writeln!(
            output,
            "\n{}\n\n{}",
            Header::new("HIR after ctor conversion"),
            node.pretty_print(&environment, PrettyOptions::default().without_color())
        );

        Ok(output)
    }
}
