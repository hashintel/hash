use core::fmt::Write as _;

use hashql_ast::{lowering::ExtractedTypes, node::expr::Expr};
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

use super::{Suite, SuiteDiagnostic, hir_reify::hir_reify};
use crate::suite::common::{Header, process_issues};

pub(crate) struct TestOptions<'data> {
    pub skip_alias_replacement: bool,
    pub output: &'data mut String,
    pub diagnostics: &'data mut Vec<SuiteDiagnostic>,
}

pub(crate) fn hir_lower_alias_replacement<'heap>(
    heap: &'heap Heap,
    expr: Expr<'heap>,
    environment: &Environment<'heap>,
    context: &mut HirContext<'_, 'heap>,
    options: &mut TestOptions,
) -> Result<(Node<'heap>, ExtractedTypes<'heap>), SuiteDiagnostic> {
    let (mut node, types) = hir_reify(heap, expr, environment, context, options.diagnostics)?;

    let _ = writeln!(
        options.output,
        "{}\n\n{}",
        Header::new("Initial HIR"),
        node.pretty_print(
            &PrettyPrintEnvironment {
                env: environment,
                symbols: &context.symbols,
            },
            PrettyOptions::default().without_color()
        )
    );

    if !options.skip_alias_replacement {
        let mut issues = DiagnosticIssues::new();
        let mut replacement = AliasReplacement::new(context, &mut issues);
        Ok(node) = replacement.fold_node(node);

        process_issues(options.diagnostics, issues)?;
    }

    Ok((node, types))
}

pub(crate) struct HirLowerAliasReplacementSuite;

impl Suite for HirLowerAliasReplacementSuite {
    fn name(&self) -> &'static str {
        "hir/lower/alias-replacement"
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

        let (node, _) = hir_lower_alias_replacement(
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
