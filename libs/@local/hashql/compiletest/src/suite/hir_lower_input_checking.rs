use core::fmt::Write as _;

use hashql_ast::node::{
    expr::{Expr, ExprKind, StructExpr, r#struct::StructEntry},
    value::Value as AstValue,
};
use hashql_core::{
    heap::{ResetAllocator as _, Scratch},
    module::ModuleRegistry,
    pretty::{Formatter, RenderOptions},
    symbol::Symbol,
    r#type::{
        TypeFormatter,
        environment::{Environment, LatticeEnvironment},
    },
};
use hashql_hir::{
    context::HirContext,
    intern::Interner,
    lower::{
        LoweringResidual,
        checking::{InputParameter, check_inputs},
        lower,
    },
    node::Value,
    pretty::NodeFormatter,
};

use super::{
    RunContext, Suite, SuiteDiagnostic,
    common::{Annotated, Header, process_status},
    hir_reify::hir_reify,
};

/// Splits the expression of a test into its query and the values it supplies for the inputs.
///
/// A test of this suite is a struct with the fields `query` and `inputs`, as the body of a request
/// to the Graph API is. `inputs` is a struct with one field for each supplied input.
fn split_request(expr: Expr<'_>) -> (Expr<'_>, Vec<(Symbol<'_>, Expr<'_>)>) {
    let ExprKind::Struct(StructExpr { entries, .. }) = expr.kind else {
        panic!("the test must be a struct with the fields `query` and `inputs`");
    };

    let mut query = None;
    let mut inputs = None;

    for StructEntry { key, value, .. } in entries {
        match key.value.as_str() {
            "query" => query = Some(value),
            "inputs" => inputs = Some(value),
            name => panic!("unexpected field `{name}`, expected `query` or `inputs`"),
        }
    }

    let query = query.expect("the test must have a `query` field");
    let ExprKind::Struct(StructExpr { entries, .. }) =
        inputs.expect("the test must have an `inputs` field").kind
    else {
        panic!("`inputs` must be a struct with one field for each supplied input");
    };

    let inputs = entries
        .into_iter()
        .map(|StructEntry { key, value, .. }| (key.value, value))
        .collect();

    (query, inputs)
}

pub(crate) struct HirLowerInputCheckingSuite;

impl Suite for HirLowerInputCheckingSuite {
    fn name(&self) -> &'static str {
        "hir/lower/input-checking"
    }

    fn description(&self) -> &'static str {
        "Type checking of the values supplied for the inputs of a query"
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
        let mut scratch = Scratch::new();

        let (query, inputs) = split_request(expr);

        let (node, types) = hir_reify(query, &environment, &mut context, diagnostics)?;

        let mut values = Vec::with_capacity(inputs.len());
        for (name, value) in inputs {
            let value = process_status(
                diagnostics,
                Value::from_ast_in(AstValue::new_unchecked(value), &mut context, &scratch),
            )?;
            scratch.reset();

            values.push((name, value));
        }

        let (_, LoweringResidual { inputs: parameters }) = process_status(
            diagnostics,
            lower(node, &types, &mut environment, &mut context),
        )?;

        process_status(
            diagnostics,
            check_inputs(
                &environment,
                &parameters,
                values.iter().copied(),
                scratch.as_mut_scope(),
            ),
        )?;

        let mut parameters: Vec<_> = parameters.into_iter().collect();
        parameters.sort_unstable_by_key(|&(name, _)| name);

        let formatter = Formatter::new(heap);
        let mut value_formatter = NodeFormatter::with_defaults(&formatter, &environment, &context);
        let mut type_formatter = TypeFormatter::with_defaults(&formatter, &environment);
        let mut lattice = LatticeEnvironment::new(&environment);

        let mut output = String::new();

        let _ = writeln!(output, "{}\n", Header::new("Parameters"));

        for (
            name,
            InputParameter {
                r#type,
                required,
                span: _,
            },
        ) in parameters
        {
            // The sigil of a load in the HIR: `$` for a required input, `?` for an optional one
            let sigil = if required { '$' } else { '?' };

            let _ = writeln!(
                output,
                "{}\n",
                Annotated {
                    content: format_args!("{sigil}{name}"),
                    annotation: type_formatter
                        .render(r#type, RenderOptions::default().with_plain())
                }
            );
        }

        let _ = writeln!(output, "{}\n", Header::new("Values"));

        for (name, value) in values {
            let r#type = value.r#type(&mut lattice, scratch.as_mut_scope());
            scratch.reset();

            let _ = writeln!(
                output,
                "{}\n",
                Annotated {
                    content: format_args!(
                        "{name} = {}",
                        value_formatter.render(value.node(), RenderOptions::default().with_plain())
                    ),
                    annotation: type_formatter
                        .render(r#type, RenderOptions::default().with_plain())
                }
            );
        }

        Ok(output)
    }
}
