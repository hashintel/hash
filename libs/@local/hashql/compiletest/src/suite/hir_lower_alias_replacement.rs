use core::fmt::Write as _;

use anstream::adapter::strip_str;
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

        let mut output = node
            .pretty_print(&environment, PrettyOptions::default())
            .to_string();

        output.push_str("\n\n--------------------------------------\n\n");

        let mut replacement = AliasReplacement::new(&interner);
        let Ok(node) = replacement.fold_node(node);

        write!(
            &mut output,
            "{}",
            node.pretty_print(&environment, PrettyOptions::default())
        )
        .expect("infallible");

        Ok(strip_str(&output).to_string())
    }
}
