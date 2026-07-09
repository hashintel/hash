use core::mem;

use hashql_core::{heap::BumpAllocator, span::SpanId};

use super::Expander;
use crate::{
    lower::expander::error,
    node::{
        expr::{CallExpr, Expr, ExprKind, IfExpr, call::Argument},
        id::NodeId,
    },
};

fn lower_if_impl<'heap, S>(
    span: SpanId,
    expander: &mut Expander<'_, 'heap, S>,

    test: &mut Argument<'heap>,
    then: &mut Argument<'heap>,
    r#else: Option<&mut Argument<'heap>>,
) -> Expr<'heap>
where
    S: BumpAllocator,
{
    let mut test = mem::replace(&mut test.value, Expr::dummy());
    let mut then = mem::replace(&mut then.value, Expr::dummy());
    let mut r#else = r#else.map(|argument| mem::replace(&mut argument.value, Expr::dummy()));

    expander.visit(&mut test);
    expander.visit(&mut then);
    if let Some(r#else) = r#else.as_mut() {
        expander.visit(r#else);
    }

    Expr {
        id: NodeId::PLACEHOLDER,
        span,
        kind: ExprKind::If(IfExpr {
            id: NodeId::PLACEHOLDER,
            span,
            test: Box::new_in(test, expander.heap),
            then: Box::new_in(then, expander.heap),
            r#else: r#else.map(|r#else| Box::new_in(r#else, expander.heap)),
        }),
    }
}

/// Lowers an `if` call into an [`IfExpr`].
///
/// Accepts two forms:
/// - `(if condition then)` without an else branch
/// - `(if condition then else)` with an else branch
///
/// [`IfExpr`]: crate::node::expr::IfExpr
pub(super) fn lower_if<'heap, S>(
    expander: &mut Expander<'_, 'heap, S>,
    CallExpr {
        id: _,
        span,
        function: _,
        arguments,
        labeled_arguments,
    }: &mut CallExpr<'heap>,
) -> Expr<'heap>
where
    S: BumpAllocator,
{
    if !labeled_arguments.is_empty() {
        expander
            .diagnostics
            .push(error::labeled_arguments_in_if(labeled_arguments));
    }

    match &mut **arguments {
        [test, then] => lower_if_impl(*span, expander, test, then, None),
        [test, then, r#else] => lower_if_impl(*span, expander, test, then, Some(r#else)),
        _ => {
            expander
                .diagnostics
                .push(error::invalid_if_argument_count(*span, arguments));

            Expr::dummy()
        }
    }
}
