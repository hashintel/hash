use core::mem;

use hashql_core::{span::SpanId, symbol::Ident};

use super::Expander;
use crate::node::{
    expr::{CallExpr, Expr, ExprKind, LetExpr, call::Argument},
    id::NodeId,
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
    mut value: &mut Argument<'heap>,
    mut r#type: Option<&mut Argument<'heap>>,
    mut body: &mut Argument<'heap>,
) -> Expr<'heap> {
    let Some(name) = argument_to_ident(name) else {
        todo!("ERROR: name must be an ident");
        return Expr::dummy();
    };

    let item = expander.visit(&mut value.value);

    expander.enter(
        hashql_core::module::Universe::Value,
        name.value,
        item,
        |expander| {
            expander.visit(&mut body.value);
        },
    );

    if let Some(r#type) = &mut r#type {
        expander.visit(&mut r#type.value);
    }

    Expr {
        id: NodeId::PLACEHOLDER,
        span,
        kind: ExprKind::Let(LetExpr {
            id: NodeId::PLACEHOLDER,
            span,
            name,
            value: Box::new_in(mem::replace(&mut value.value, Expr::dummy()), expander.heap),
            r#type: None,
            body: Box::new_in(mem::replace(&mut body.value, Expr::dummy()), expander.heap),
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
