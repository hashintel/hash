use core::mem;

use hashql_core::{
    heap::BumpAllocator,
    span::SpanId,
    symbol::{Ident, IdentKind},
    value::Primitive,
};

use super::Expander;
use crate::{
    lower::expander::error,
    node::{
        expr::{CallExpr, Expr, ExprKind, FieldExpr, call::Argument},
        id::NodeId,
    },
};

/// Extract a field identifier from an argument.
///
/// Handles both named field access (identifiers like `name`) and indexed field
/// access (integer literals like `0` for tuple fields). Integer literals are
/// validated for bounds.
fn argument_to_field<'heap, S>(
    expander: &mut Expander<'_, 'heap, S>,
    argument: &Argument<'heap>,
) -> Option<Ident<'heap>> {
    // Integer literal for tuple field access
    if let ExprKind::Literal(literal) = &argument.value.kind {
        if literal.r#type.is_some() {
            expander
                .diagnostics
                .push(error::field_literal_type_annotation(literal.span));
        }

        let Primitive::Integer(integer) = literal.kind else {
            expander
                .diagnostics
                .push(error::invalid_field_literal_type(literal.span));
            return None;
        };

        if integer.as_usize().is_none() {
            expander
                .diagnostics
                .push(error::field_index_out_of_bounds(literal.span));
            return None;
        }

        return Some(Ident {
            span: literal.span,
            value: integer.as_symbol(),
            kind: IdentKind::Lexical,
        });
    }

    // Named field access
    if let ExprKind::Path(path) = &argument.value.kind
        && let Some(&ident) = path.as_ident()
    {
        return Some(ident);
    }

    expander
        .diagnostics
        .push(error::invalid_access_field(argument));

    None
}

fn lower_access_impl<'heap, S>(
    span: SpanId,
    expander: &mut Expander<'_, 'heap, S>,

    value: &mut Argument<'heap>,
    field: &Argument<'heap>,
) -> Expr<'heap>
where
    S: BumpAllocator,
{
    let Some(field) = argument_to_field(expander, field) else {
        return Expr::dummy();
    };

    let mut value = mem::replace(&mut value.value, Expr::dummy());
    expander.visit(&mut value);

    Expr {
        id: NodeId::PLACEHOLDER,
        span,
        kind: ExprKind::Field(FieldExpr {
            id: NodeId::PLACEHOLDER,
            span,
            value: Box::new_in(value, expander.heap),
            field,
        }),
    }
}

pub(super) fn lower_access<'heap, S>(
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
            .push(error::labeled_arguments_in_access(labeled_arguments));
    }

    match &mut **arguments {
        [value, field] => lower_access_impl(*span, expander, value, field),
        _ => {
            expander
                .diagnostics
                .push(error::invalid_access_argument_count(*span, arguments));

            Expr::dummy()
        }
    }
}
