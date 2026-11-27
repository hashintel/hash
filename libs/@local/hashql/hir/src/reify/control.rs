use core::alloc::Allocator;

use hashql_ast::node::{
    expr::{ClosureExpr, Expr, IfExpr, InputExpr, LetExpr},
    r#type::Type,
};
use hashql_core::{
    span::{SpanId, Spanned},
    symbol::{Ident, sym},
};

use super::{
    expr::{ExprReifier, Fold},
    path::make_qualified_path,
};
use crate::node::{
    HirId, Node, NodeData,
    branch::{Branch, If},
    call::{Call, CallArgument, PointerKind},
    closure::{Closure, ClosureParam, ClosureSignature},
    kind::NodeKind,
    r#let::{Binding, Let},
    operation::{InputOp, InputOperation, Operation},
};

pub(super) fn reify_let<'heap, 'scratch, S: Allocator>(
    reifier: &mut ExprReifier<'_, '_, '_, 'heap, 'scratch, S>,
    LetExpr {
        id: _,
        span: _,
        name,
        value,
        r#type,
        body,
    }: LetExpr<'heap>,
    bindings: Option<&mut Vec<Binding<'heap>, &'scratch S>>,
) -> Option<Fold<'heap>> {
    let value_span = value.span;
    let binder = reifier.binders.bind(name, reifier.context);

    let mut value = reifier.reify_expr(*value);

    if let Some(value) = value.as_mut()
        && let Some(r#type) = r#type.as_ref()
    {
        *value = reifier.wrap_type_assertion_node(r#type.span, *value, r#type);
    }

    if let Some(bindings) = bindings {
        // Already inside a chain of nested `let`s: append this binding and fold into the body.
        bindings.push(Binding {
            // TODO: https://linear.app/hash/issue/BE-76/hashql-allow-spanids-to-span-multiple-spans
            span: value_span,
            binder,
            value: value?,
        });

        let body = reifier.expr_fold(*body, Some(bindings));
        reifier.binders.unbind(name.value);

        return body.map(Fold::Promote);
    }

    let mut bindings = Vec::new_in(reifier.scratch);
    let mut incomplete = true;

    // Delay returning on a failed value so diagnostics in the body are still collected.
    if let Some(value) = value {
        incomplete = false;
        bindings.push(Binding {
            // TODO: https://linear.app/hash/issue/BE-76/hashql-allow-spanids-to-span-multiple-spans
            span: value_span,
            binder,
            value,
        });
    }

    let body = reifier.expr_fold(*body, Some(&mut bindings));
    reifier.binders.unbind(name.value);

    let body = body?;
    if incomplete {
        return None;
    }

    let kind = NodeKind::Let(Let {
        bindings: reifier.context.interner.bindings.intern_slice(&bindings),
        body,
    });

    Some(Fold::Partial(kind))
}

const fn input_node_kind(span: SpanId, name: Ident<'_>, op: InputOp) -> NodeKind<'_> {
    NodeKind::Operation(Operation::Input(InputOperation {
        op: Spanned { span, value: op },
        name,
    }))
}

fn input_node<'heap, S: Allocator>(
    reifier: &mut ExprReifier<'_, '_, '_, 'heap, '_, S>,
    span: SpanId,
    name: Ident<'heap>,
    op: InputOp,
) -> Node<'heap> {
    reifier.context.interner.intern_node(NodeData {
        id: reifier.context.counter.hir.next(),
        span,
        kind: input_node_kind(span, name, op),
    })
}

fn input_expr_default<'heap, S: Allocator>(
    reifier: &mut ExprReifier<'_, '_, '_, 'heap, '_, S>,
    span: SpanId,
    name: Ident<'heap>,
    r#type: &Type<'heap>,
    default: Expr<'heap>,
) -> Option<NodeKind<'heap>> {
    // `input(name, type: type, default: expr)` lowers to
    // `if INPUT_EXISTS(name) then INPUT_LOAD(name) else (default as type)`.
    let default = reifier.reify_expr(default)?;

    let then = input_node(reifier, span, name, InputOp::Load { required: false });
    let type_id = reifier.types.anonymous[r#type.id];
    reifier.context.map.insert_type_id(then.id, type_id);

    Some(NodeKind::Branch(Branch::If(If {
        test: input_node(reifier, span, name, InputOp::Exists),
        then,
        r#else: reifier.wrap_type_assertion_node(span, default, r#type),
    })))
}

fn input_expr_required<'heap, S: Allocator>(
    reifier: &mut ExprReifier<'_, '_, '_, 'heap, '_, S>,
    hir_id: HirId,
    span: SpanId,
    r#type: &Type<'heap>,
    name: Ident<'heap>,
) -> NodeKind<'heap> {
    let type_id = reifier.types.anonymous[r#type.id];
    reifier.context.map.insert_type_id(hir_id, type_id);

    input_node_kind(span, name, InputOp::Load { required: true })
}

pub(super) fn reify_input<'heap, S: Allocator>(
    reifier: &mut ExprReifier<'_, '_, '_, 'heap, '_, S>,
    hir_id: HirId,
    InputExpr {
        id: _,
        span,
        name,
        r#type,
        default,
    }: InputExpr<'heap>,
) -> Option<NodeKind<'heap>> {
    if let Some(default) = default {
        input_expr_default(reifier, span, name, &r#type, *default)
    } else {
        Some(input_expr_required(reifier, hir_id, span, &r#type, name))
    }
}

pub(super) fn reify_closure<'heap, S: Allocator>(
    reifier: &mut ExprReifier<'_, '_, '_, 'heap, '_, S>,
    hir_id: HirId,
    ClosureExpr {
        id: _,
        span: _,
        signature,
        body,
    }: ClosureExpr<'heap>,
) -> Option<NodeKind<'heap>> {
    let signature_def = reifier.types.signatures[signature.id];
    reifier.context.map.insert_type_def(hir_id, signature_def);

    let mut params = Vec::with_capacity_in(signature.inputs.len(), reifier.scratch);
    for &hashql_ast::node::expr::closure::ClosureParam {
        id: _,
        span,
        name,
        bound: _,
    } in &signature.inputs
    {
        let binder = reifier.binders.bind(name, reifier.context);
        params.push(ClosureParam { span, name: binder });
    }

    let body = reifier.reify_expr(*body)?;

    for param in &signature.inputs {
        reifier.binders.unbind(param.name.value);
    }

    Some(NodeKind::Closure(Closure {
        signature: ClosureSignature {
            span: signature.span,
            params: reifier.context.interner.intern_closure_params(&params),
        },
        body,
    }))
}

fn if_expr_then_some<'heap, S: Allocator>(
    reifier: &mut ExprReifier<'_, '_, '_, 'heap, '_, S>,
    node: Node<'heap>,
) -> Node<'heap> {
    let some_path = make_qualified_path(reifier, node.span, &[sym::core, sym::option, sym::Some]);

    let node = NodeData {
        id: reifier.context.counter.hir.next(),
        span: node.span,
        kind: NodeKind::Call(Call {
            kind: PointerKind::Fat,
            function: some_path,
            arguments: reifier
                .context
                .interner
                .intern_call_arguments(&[CallArgument {
                    span: node.span,
                    value: node,
                }]),
        }),
    };

    reifier.context.interner.intern_node(node)
}

fn if_expr_else_none<'heap, S: Allocator>(
    reifier: &mut ExprReifier<'_, '_, '_, 'heap, '_, S>,
    span: SpanId,
) -> Node<'heap> {
    let none_path = make_qualified_path(reifier, span, &[sym::core, sym::option, sym::None]);

    let node = NodeData {
        id: reifier.context.counter.hir.next(),
        span,
        kind: NodeKind::Call(Call {
            kind: PointerKind::Fat,
            function: none_path,
            arguments: reifier.context.interner.intern_call_arguments(&[]),
        }),
    };

    reifier.context.interner.intern_node(node)
}

pub(super) fn reify_if<'heap, S: Allocator>(
    reifier: &mut ExprReifier<'_, '_, '_, 'heap, '_, S>,
    IfExpr {
        id: _,
        span,
        test,
        then,
        r#else,
    }: IfExpr<'heap>,
) -> Option<NodeKind<'heap>> {
    if let Some(r#else) = r#else {
        let test = reifier.reify_expr(*test);
        let then = reifier.reify_expr(*then);
        let r#else = reifier.reify_expr(*r#else);

        return Some(NodeKind::Branch(Branch::If(If {
            test: test?,
            then: then?,
            r#else: r#else?,
        })));
    }

    // Desugar `if test then body` without an `else` branch to `Option<T>`.
    let (test, then) = Option::zip(reifier.reify_expr(*test), reifier.reify_expr(*then))?;

    Some(NodeKind::Branch(Branch::If(If {
        test,
        then: if_expr_then_some(reifier, then),
        r#else: if_expr_else_none(reifier, span),
    })))
}
