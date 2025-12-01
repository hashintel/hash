use core::fmt::Write as _;

use hashql_ast::node::expr::Expr;
use hashql_core::{
    heap::Heap,
    module::ModuleRegistry,
    pretty::{Formatter, RenderOptions},
    r#type::environment::Environment,
};
use hashql_hir::{
    context::HirContext,
    intern::Interner,
    lower::{
        normalization::{Normalization, NormalizationState},
        thunking::Thunking,
    },
    node::Node,
    pretty::NodeFormatter,
};

use super::{
    RunContext, Suite, SuiteDiagnostic, hir_lower_alias_replacement::TestOptions,
    hir_lower_graph_hoisting::hir_lower_graph_hoisting,
};
use crate::suite::common::Header;

pub(crate) fn hir_lower_thunking<'heap>(
    heap: &'heap Heap,
    expr: Expr<'heap>,
    environment: &mut Environment<'heap>,
    context: &mut HirContext<'_, 'heap>,
    options: &mut TestOptions,
) -> Result<Node<'heap>, SuiteDiagnostic> {
    let node = hir_lower_graph_hoisting(heap, expr, environment, context, options)?;

    let thunking = Thunking::new(context, environment);
    let node = thunking.run(node);

    let mut normalization_state = NormalizationState::default();
    let normalization = Normalization::new(context, environment, &mut normalization_state);
    let node = normalization.run(node);

    Ok(node)
}

pub(crate) struct HirLowerThunkingSuite;

impl Suite for HirLowerThunkingSuite {
    fn name(&self) -> &'static str {
        "hir/lower/thunking"
    }

    fn run<'heap>(
        &self,
        RunContext {
            heap, diagnostics, ..
        }: RunContext<'_, 'heap>,
        expr: Expr<'heap>,
    ) -> Result<String, SuiteDiagnostic> {
        let mut environment = Environment::new(heap);
        let registry = ModuleRegistry::new(&environment);
        let interner = Interner::new(heap);
        let mut context = HirContext::new(&interner, &registry);

        let mut output = String::new();

        let node = hir_lower_thunking(
            heap,
            expr,
            &mut environment,
            &mut context,
            &mut TestOptions {
                skip_alias_replacement: false,
                output: &mut output,
                diagnostics,
            },
        )?;

        let formatter = Formatter::new(heap);
        let mut formatter = NodeFormatter::with_defaults(&formatter, &environment, &context);

        let _ = writeln!(
            output,
            "\n{}\n\n{}",
            Header::new("HIR after thunking"),
            formatter.render(node, RenderOptions::default().with_plain())
        );

        Ok(output)
    }
}
