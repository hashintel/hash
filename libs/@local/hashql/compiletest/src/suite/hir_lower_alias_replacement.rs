use core::fmt::Write as _;

use hashql_ast::{lowering::lower, node::expr::Expr};
use hashql_core::{
    heap::Heap,
    module::ModuleRegistry,
    pretty::{PrettyOptions, PrettyPrint as _},
    span::SpanId,
    r#type::environment::Environment,
};
use hashql_hir::{fold::Fold as _, intern::Interner, lower::alias::AliasReplacement, node::Node};

use super::{Suite, SuiteDiagnostic, common::process_diagnostics};
use crate::suite::common::Header;

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
        let mut output = String::new();

        let (types, lower_diagnostics) = lower(
            heap.intern_symbol("::main"),
            &mut expr,
            &environment,
            &registry,
        );

        process_diagnostics(diagnostics, lower_diagnostics)?;

        let interner = Interner::new(heap);
        let (node, reify_diagnostics) = Node::from_ast(expr, &environment, &interner, &types);
        process_diagnostics(diagnostics, reify_diagnostics)?;

        let node = node.expect("should be `Some` if there are non-fatal errors");

        let _ = writeln!(output, "{}\n", Header::new("Initial HIR"));

        let _ = writeln!(
            output,
            "{}",
            node.pretty_print(&environment, PrettyOptions::default().without_color())
        );

        let _ = writeln!(output, "\n{}\n", Header::new("HIR after alias replacement"));

        let mut replacement = AliasReplacement::new(&interner);
        let Ok(node) = replacement.fold_node(node);

        let _ = writeln!(
            &mut output,
            "{}",
            node.pretty_print(&environment, PrettyOptions::default().without_color())
        );

        Ok(output)
    }
}
