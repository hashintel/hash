use core::{iter, mem};

use hashql_core::{
    collections::fast_hash_map_with_capacity_in,
    heap::{self, BumpAllocator, Heap},
    module::{
        Universe,
        item::{IntrinsicItem, IntrinsicTypeItem, Item},
    },
    span::SpanId,
    symbol::{Ident, sym},
};

use super::{CurrentItem, Expander, error::ExpanderDiagnosticIssues};
use crate::{
    lower::expander::error,
    node::{
        expr::{CallExpr, Expr, ExprKind, TypeExpr, call::Argument},
        generic::{self, GenericConstraint},
        id::NodeId,
        path::PathSegmentArgument,
        r#type::{IntersectionType, StructType, TupleType, Type, TypeKind, UnionType},
    },
    visit::Visitor as _,
};

fn lower_call_to_type<'heap, S>(
    expander: &mut Expander<'_, 'heap, S>,
    mut call: CallExpr<'heap>,
) -> Type<'heap>
where
    S: BumpAllocator,
{
    if !call.labeled_arguments.is_empty() {
        expander
            .diagnostics
            .push(error::labeled_arguments_in_type_call(
                &call.labeled_arguments,
            ));
        return Type::dummy();
    }

    let Some(CurrentItem {
        item:
            Item {
                module: _,
                name: _,
                kind:
                    hashql_core::module::item::ItemKind::Intrinsic(IntrinsicItem::Type(type_intrinsic)),
            },
        has_arguments: _, // We don't care here, intrinsics never have arguments
    }) = expander.with_universe(Universe::Type, |expander| {
        expander.visit(&mut call.function)
    })
    else {
        // Only emit a diagnostic if the function didn't become Dummy from an earlier
        // resolution error. Dummy means a resolution diagnostic was already emitted.
        if !matches!(call.function.kind, ExprKind::Dummy) {
            expander
                .diagnostics
                .push(error::invalid_type_constructor_call(
                    call.function.span,
                    call.span,
                ));
        }

        return Type::dummy();
    };

    let mut types = Vec::with_capacity_in(call.arguments.len(), expander.heap);
    for mut argument in call.arguments {
        expander.with_universe(Universe::Type, |expander| {
            expander.visit(&mut argument.value)
        });

        types.push(lower_expr_to_type(expander, argument.value));
    }

    let kind = match type_intrinsic.name.as_constant() {
        Some(sym::path::Union::CONST) => TypeKind::Union(UnionType {
            id: NodeId::PLACEHOLDER,
            span: call.span,
            types,
        }),
        Some(sym::path::Intersection::CONST) => TypeKind::Intersection(IntersectionType {
            id: NodeId::PLACEHOLDER,
            span: call.span,
            types,
        }),
        _ => {
            expander.diagnostics.push(error::type_is_not_callable(
                type_intrinsic.name,
                call.function.span,
                call.span,
            ));
            return Type::dummy();
        }
    };

    Type {
        id: NodeId::PLACEHOLDER,
        span: call.span,
        kind,
    }
}

/// Converts a value-position [`Expr`] into a [`Type`].
///
/// Paths, tuples, structs, `_`, and type constructor calls (`|`, `&`) are
/// valid. Everything else produces a diagnostic and returns [`Type::dummy`].
/// [`ExprKind::Dummy`] is suppressed (a resolution error was already reported).
pub(super) fn lower_expr_to_type<'heap, S>(
    expander: &mut Expander<'_, 'heap, S>,
    expr: Expr<'heap>,
) -> Type<'heap>
where
    S: BumpAllocator,
{
    match expr.kind {
        ExprKind::Call(call) => lower_call_to_type(expander, call),
        ExprKind::Tuple(tuple) => {
            if let Some(annotation) = &tuple.r#type {
                // We continue, because it's not fatal, we just ignore it, compilation will
                // terminate before ever reaching the HIR.
                expander
                    .diagnostics
                    .push(error::type_annotation_in_type_position(
                        annotation.span,
                        expr.span,
                        error::AggregateKind::Tuple,
                    ));
            }

            let mut elements = Vec::with_capacity_in(tuple.elements.len(), expander.heap);

            for element in tuple.elements {
                elements.push(crate::node::r#type::TupleField {
                    id: NodeId::PLACEHOLDER,
                    span: element.span,
                    r#type: lower_expr_to_type(expander, element.value),
                });
            }

            Type {
                id: NodeId::PLACEHOLDER,
                span: expr.span,
                kind: TypeKind::Tuple(TupleType {
                    id: NodeId::PLACEHOLDER,
                    span: expr.span,
                    fields: elements,
                }),
            }
        }
        ExprKind::Struct(r#struct) => {
            if let Some(annotation) = &r#struct.r#type {
                // We continue, because it's not fatal, we just ignore it, compilation will
                // terminate before ever reaching the HIR.
                expander
                    .diagnostics
                    .push(error::type_annotation_in_type_position(
                        annotation.span,
                        expr.span,
                        error::AggregateKind::Struct,
                    ));
            }

            let mut fields = Vec::with_capacity_in(r#struct.entries.len(), expander.heap);

            for entry in r#struct.entries {
                fields.push(crate::node::r#type::StructField {
                    id: NodeId::PLACEHOLDER,
                    span: entry.span,
                    name: entry.key,
                    r#type: lower_expr_to_type(expander, entry.value),
                });
            }

            Type {
                id: NodeId::PLACEHOLDER,
                span: expr.span,
                kind: TypeKind::Struct(StructType {
                    id: NodeId::PLACEHOLDER,
                    span: expr.span,
                    fields,
                }),
            }
        }
        ExprKind::Path(path) => Type {
            id: NodeId::PLACEHOLDER,
            span: expr.span,
            kind: TypeKind::Path(path),
        },
        ExprKind::Underscore => Type {
            id: NodeId::PLACEHOLDER,
            span: expr.span,
            kind: TypeKind::Infer,
        },
        ExprKind::Dict(_)
        | ExprKind::List(_)
        | ExprKind::Literal(_)
        | ExprKind::Let(_)
        | ExprKind::Type(_)
        | ExprKind::NewType(_)
        | ExprKind::Input(_)
        | ExprKind::Closure(_)
        | ExprKind::If(_)
        | ExprKind::Field(_)
        | ExprKind::Index(_)
        | ExprKind::As(_)
        | ExprKind::Dummy => {
            if let Some(diagnostic) =
                error::invalid_expression_in_type_position(expr.span, &expr.kind)
            {
                expander.diagnostics.push(diagnostic);
            }

            Type {
                id: NodeId::PLACEHOLDER,
                span: expr.span,
                kind: TypeKind::Dummy,
            }
        }
    }
}

fn path_arguments_to_constraints_unvalidated<'heap, S>(
    heap: &'heap Heap,
    scratch: S,
    diagnostics: &mut ExpanderDiagnosticIssues,

    arguments: &mut [PathSegmentArgument<'heap>],
) -> heap::Vec<'heap, GenericConstraint<'heap>>
where
    S: BumpAllocator,
{
    let mut constraints = heap::Vec::with_capacity_in(arguments.len(), heap);
    let mut seen = fast_hash_map_with_capacity_in(arguments.len(), scratch);

    for argument in arguments {
        match argument {
            PathSegmentArgument::Argument(generic::GenericArgument {
                id,
                span,
                r#type:
                    Type {
                        id: _,
                        span: _,
                        kind: TypeKind::Path(path),
                    },
            }) if let Some(&ident) = path.as_ident() => {
                // In this case it's simply interpreted as a generic constraint with no bounds.
                if let Err(error) = seen.try_insert(ident.value, ident.span) {
                    diagnostics.push(error::duplicate_generic_constraint(
                        ident.span,
                        ident.value,
                        *error.entry.get(),
                    ));

                    continue;
                }

                constraints.push(GenericConstraint {
                    id: *id,
                    span: *span,
                    name: ident,
                    bound: None,
                });
            }
            PathSegmentArgument::Argument(generic_argument) => {
                let is_path = matches!(generic_argument.r#type.kind, TypeKind::Path(_));
                let span = if is_path {
                    generic_argument.r#type.span
                } else {
                    generic_argument.span
                };

                diagnostics.push(error::invalid_generic_argument(span, is_path));
            }
            PathSegmentArgument::Constraint(generic_constraint) => {
                if let Err(error) =
                    seen.try_insert(generic_constraint.name.value, generic_constraint.name.span)
                {
                    diagnostics.push(error::duplicate_generic_constraint(
                        generic_constraint.name.span,
                        generic_constraint.name.value,
                        *error.entry.get(),
                    ));

                    continue;
                }

                constraints.push(GenericConstraint {
                    id: NodeId::PLACEHOLDER,
                    span: generic_constraint.span,
                    name: generic_constraint.name,
                    bound: generic_constraint.bound.take(),
                });
            }
        }
    }

    constraints
}

pub(super) fn argument_to_generic_ident<'heap, S>(
    expander: &mut Expander<'_, 'heap, S>,

    argument: &mut Argument<'heap>,
) -> Option<(Ident<'heap>, heap::Vec<'heap, GenericConstraint<'heap>>)>
where
    S: BumpAllocator,
{
    if let ExprKind::Path(path) = &mut argument.value.kind
        && let Some((name, arguments)) = path.as_generic_ident_mut()
    {
        // Generic constraints _may_ be recursive. To allow for that we must put the name of the
        // ident into view before we do anything
        let constraints = expander.scratch.scoped_mut(|scratch| {
            path_arguments_to_constraints_unvalidated(
                expander.heap,
                scratch,
                &mut expander.diagnostics,
                arguments,
            )
        });

        // constraints are not yet validated (which is what we're doing now)
        let (constraints, ()) = expander.bind_many_with(
            constraints,
            |constraints, binder| {
                iter::chain(
                    iter::once((name.value, Universe::Type)),
                    constraints
                        .iter()
                        .map(|constraint| (constraint.name.value, Universe::Type)),
                )
                .for_each(|(symbol, universe)| {
                    binder.bind(symbol, universe);
                });
            },
            |expander, constraints| {
                // The constraints _have not yet_ been validated, this is on purpose, because we
                // must first convert them, now that they are converted, we can
                // validate them.

                for constraint in constraints {
                    if let Some(bound) = constraint.bound.as_mut() {
                        expander.visit_type(bound);
                    }
                }
            },
        );

        Some((name, constraints))
    } else {
        None
    }
}

fn lower_type_impl<'heap, S>(
    span: SpanId,
    expander: &mut Expander<'_, 'heap, S>,

    name: &mut Argument<'heap>,
    value: &mut Argument<'heap>,
    body: &mut Argument<'heap>,
) -> Expr<'heap>
where
    S: BumpAllocator,
{
    let (name, constraints) = if let Some(result) = argument_to_generic_ident(expander, name) {
        result
    } else {
        expander
            .diagnostics
            .push(error::invalid_type_binding_name(name));

        (
            Ident::synthetic(sym::dummy),
            heap::Vec::new_in(expander.heap),
        )
    };

    let mut value = mem::replace(&mut value.value, Expr::dummy());
    let mut body = mem::replace(&mut body.value, Expr::dummy());

    let (_, expr) = expander.bind_many_with(
        constraints,
        |constraints, binder| {
            binder.bind(name.value, Universe::Type);
            for constraint in constraints {
                binder.bind(constraint.name.value, Universe::Type);
            }
        },
        |expander, constraints| {
            let item =
                expander.with_universe(Universe::Type, |expander| expander.visit(&mut value));

            if let Some(CurrentItem {
                item:
                    item @ Item {
                        kind:
                            hashql_core::module::item::ItemKind::Intrinsic(IntrinsicItem::Type(
                                IntrinsicTypeItem {
                                    name: intrinsic_name,
                                },
                            )),
                        ..
                    },
                // We cannot replace an alias with arguments, because we'd lose the arguments
                has_arguments: false,
            }) = item
                && let Some(const_name) = intrinsic_name.as_constant()
                && matches!(
                    const_name,
                    sym::path::Union::CONST | sym::path::Intersection::CONST
                )
            {
                // We rebound an intrinsic, instead of erroring out, we use the body
                // directly, and "show" the new value:
                expander.bind(name.value, item, |expander| expander.visit(&mut body));

                return body;
            }

            expander.visit(&mut body);
            let value = lower_expr_to_type(expander, value);

            Expr {
                id: NodeId::PLACEHOLDER,
                span,
                kind: ExprKind::Type(TypeExpr {
                    id: NodeId::PLACEHOLDER,
                    span,
                    name,
                    constraints: mem::replace(constraints, Vec::new_in(expander.heap)),
                    value: Box::new_in(value, expander.heap),
                    body: Box::new_in(body, expander.heap),
                }),
            }
        },
    );

    if name.value == sym::dummy {
        return Expr::dummy();
    }

    expr
}

/// Lowers a `type` call into a [`TypeExpr`].
///
/// Form: `(type Name type-expr body)`. The name may include generic
/// parameters like `Pair<A, B>`. Constraints on generic parameters are
/// validated after all parameter names are in scope, so recursive
/// constraints like `T: Container<T>` are supported.
///
/// The name is bound in the type universe for `body`.
///
/// [`TypeExpr`]: crate::node::expr::TypeExpr
pub(super) fn lower_type<'heap, S>(
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
            .push(error::labeled_arguments_in_type(labeled_arguments));
    }

    if let [name, value, body] = &mut **arguments {
        lower_type_impl(*span, expander, name, value, body)
    } else {
        expander
            .diagnostics
            .push(error::invalid_type_argument_count(*span, arguments));

        Expr::dummy()
    }
}
