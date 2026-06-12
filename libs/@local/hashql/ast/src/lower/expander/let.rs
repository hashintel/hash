use core::mem;

use hashql_core::{span::SpanId, symbol::Ident};

use super::{Expander, error::ExpanderDiagnosticIssues};
use crate::{
    node::{
        expr::{CallExpr, Expr, ExprKind, LetExpr, call::Argument},
        id::NodeId,
    },
    visit::Visitor,
};

fn argument_to_ident<'heap>(argument: &Argument<'heap>) -> Option<Ident<'heap>> {
    if let ExprKind::Path(path) = &argument.value.kind
        && let Some(&ident) = path.as_ident()
    {
        Some(ident)
    } else {
        None
    }
}

fn lower_let_3<'heap>(
    span: SpanId,
    expander: &mut Expander<'_, 'heap>,

    name: &Argument<'heap>,
    mut value: Argument<'heap>,
    mut body: Argument<'heap>,
) -> Expr<'heap> {
    let Some(name) = argument_to_ident(&name) else {
        todo!("ERROR: name must be an ident");
        return Expr::dummy();
    };

    // TODO: we must make sure that the scoping here works out, the problem is that `visit_expr`
    // bails out early.
    let item = expander.visit(&mut value.value);

    expander.enter(
        hashql_core::module::Universe::Value,
        name.value,
        item,
        |expander| {
            expander.visit(&mut body.value);
        },
    );

    Expr {
        id: NodeId::PLACEHOLDER,
        span,
        kind: ExprKind::Let(LetExpr {
            id: NodeId::PLACEHOLDER,
            span,
            name,
            value: value.value,
            r#type: None,
            body: body.value,
        }),
    }
}

pub(super) fn lower_let<'env, 'heap>(
    expander: &mut Expander<'env, 'heap>,
    CallExpr {
        id: _,
        span,
        function: _,
        arguments,
        labeled_arguments,
    }: &mut CallExpr<'heap>,
) -> Expr<'heap> {
    if !labeled_arguments.is_empty() {
        todo!("ERROR: labelled arguments are not supported")
        // we continue after diagnostic issue
    }

    match &mut **arguments {
        [name, value, body] => {
            todo!()
        }
        [name, r#type, value, body] => {
            todo!()
        }
        _ => {
            todo!("ERROR: issue diagnostic");

            Expr::dummy()
        }
    }
}
