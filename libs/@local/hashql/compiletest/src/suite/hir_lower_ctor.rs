use core::fmt::Write as _;

use hashql_ast::node::expr::Expr;
use hashql_core::{
    heap::Heap,
    module::ModuleRegistry,
    pretty::{PrettyOptions, PrettyPrint as _},
    span::SpanId,
    r#type::environment::Environment,
};
use hashql_diagnostics::DiagnosticIssues;
use hashql_hir::{
    context::HirContext, fold::Fold as _, intern::Interner, lower::ctor::ConvertTypeConstructor,
    node::NodeData, pretty::PrettyPrintEnvironment,
};

use super::{
    Suite, SuiteDiagnostic,
    common::Header,
    hir_lower_alias_replacement::{TestOptions, hir_lower_alias_replacement},
};
use crate::suite::common::process_issues;

pub(crate) fn hir_lower_ctor<'heap>(
    heap: &'heap Heap,
    expr: Expr<'heap>,
    environment: &Environment<'heap>,
    context: &mut HirContext<'_, 'heap>,
    options: &mut TestOptions,
) -> Result<NodeData<'heap>, SuiteDiagnostic> {
    let (node, types) = hir_lower_alias_replacement(heap, expr, environment, context, options)?;

    let mut issues = DiagnosticIssues::new();

    let mut converter =
        ConvertTypeConstructor::new(context, &types.locals, environment, &mut issues);
    let Ok(node) = converter.fold_node(node);

    process_issues(options.diagnostics, issues)?;
    Ok(node)
}

pub(crate) struct HirLowerCtorSuite;

impl Suite for HirLowerCtorSuite {
    fn name(&self) -> &'static str {
        "hir/lower/ctor"
    }

    fn run<'heap>(
        &self,
        heap: &'heap Heap,
        expr: Expr<'heap>,
        diagnostics: &mut Vec<SuiteDiagnostic>,
    ) -> Result<String, SuiteDiagnostic> {
        let environment = Environment::new(SpanId::SYNTHETIC, heap);
        let registry = ModuleRegistry::new(&environment);
        let interner = Interner::new(heap);
        let mut context = HirContext::new(&interner, &registry);

        let mut output = String::new();

        let node = hir_lower_ctor(
            heap,
            expr,
            &environment,
            &mut context,
            &mut TestOptions {
                skip_alias_replacement: false,
                output: &mut output,
                diagnostics,
            },
        )?;

        let _ = writeln!(
            output,
            "\n{}\n\n{}",
            Header::new("HIR after ctor conversion"),
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
