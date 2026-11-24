use core::alloc::Allocator;

use hashql_ast::{
    lower::ExtractedTypes,
    node::{
        expr::{AsExpr, CallExpr, Expr, ExprKind, FieldExpr, IndexExpr, call::Argument},
        r#type::Type,
    },
};
use hashql_core::{heap, intern::Interned, span::SpanId};
use hashql_diagnostics::DiagnosticIssues;

use super::{
    control::{reify_closure, reify_if, reify_input, reify_let},
    data::{self, DataReifier},
    error::{
        EnclosingSite, ReificationDiagnosticIssues, ReificationStatus, ReificationTarget,
        dummy_expression, internal_error, underscore_expression, unprocessed_expression,
    },
    finish_reify,
    path::reify_path,
    scope::BinderScope,
};
use crate::{
    context::HirContext,
    intern::Interner,
    node::{
        Node, NodeData,
        access::{Access, FieldAccess, IndexAccess},
        call::{Call, CallArgument, PointerKind},
        kind::NodeKind,
        r#let::Binding,
        operation::{Operation, TypeAssertion, TypeOperation},
    },
};

pub(super) enum Fold<'heap> {
    Partial(NodeKind<'heap>),
    Promote(Node<'heap>),
}

#[derive(Debug)]
pub(super) struct ExprReifier<'ctx, 'types, 'env, 'heap, A: Allocator> {
    pub context: &'ctx mut HirContext<'env, 'heap>,
    pub types: &'types ExtractedTypes<'heap>,
    pub diagnostics: ReificationDiagnosticIssues,
    pub binders: BinderScope<'heap, A>,
    enclosing: Option<EnclosingSite<'heap>>,
    pub scratch: A,
}

impl<'ctx, 'types, 'env, 'heap, A> ExprReifier<'ctx, 'types, 'env, 'heap, A>
where
    A: Allocator + Clone,
{
    pub(super) fn new(
        context: &'ctx mut HirContext<'env, 'heap>,
        types: &'types ExtractedTypes<'heap>,
        scratch: A,
    ) -> Self {
        let binders = BinderScope::new_in(types, context, scratch.clone());
        Self {
            context,
            types,
            diagnostics: DiagnosticIssues::new(),
            binders,
            enclosing: None,
            scratch,
        }
    }

    pub(super) fn reify(mut self, expr: Expr<'heap>) -> ReificationStatus<Node<'heap>> {
        let expr_span = expr.span;
        let node = self.reify_expr(expr);
        finish_reify(
            self.context,
            self.diagnostics,
            node,
            expr_span,
            ReificationTarget::Expr,
        )
    }

    pub(super) fn wrap_type_assertion_node(
        &mut self,
        span: SpanId,
        value: Node<'heap>,
        r#type: &Type<'heap>,
    ) -> Node<'heap> {
        self.context.interner.intern_node(NodeData {
            id: self.context.counter.hir.next(),
            span,
            kind: NodeKind::Operation(Operation::Type(TypeOperation::Assertion(TypeAssertion {
                value,
                r#type: self.types.anonymous[r#type.id],
                force: false,
            }))),
        })
    }

    fn call_arguments(
        &mut self,
        args: heap::Vec<'heap, Argument<'heap>>,
    ) -> Option<Interned<'heap, [CallArgument<'heap>]>> {
        let mut incomplete = false;
        let mut arguments = Vec::with_capacity_in(args.len(), self.scratch.clone());

        for argument in args {
            let Some(value) = self.reify_expr(argument.value) else {
                incomplete = true;
                continue;
            };

            arguments.push(CallArgument {
                span: argument.span,
                value,
            });
        }

        if incomplete {
            return None;
        }

        Some(self.context.interner.intern_call_arguments(&arguments))
    }

    fn call_expr(
        &mut self,
        CallExpr {
            id: _,
            span,
            function,
            arguments,
            labeled_arguments,
        }: CallExpr<'heap>,
    ) -> Option<NodeKind<'heap>> {
        if !labeled_arguments.is_empty() {
            self.diagnostics.push(internal_error(
                span,
                "labeled arguments in call expressions should have been processed earlier",
            ));
            return None;
        }

        let function = self.reify_expr(*function);
        let arguments = self.call_arguments(arguments);

        let (function, arguments) = Option::zip(function, arguments)?;

        Some(NodeKind::Call(Call {
            kind: PointerKind::Fat,
            function,
            arguments,
        }))
    }

    fn field_expr(
        &mut self,
        FieldExpr {
            id: _,
            span: _,
            value,
            field,
        }: FieldExpr<'heap>,
    ) -> Option<NodeKind<'heap>> {
        let value = self.reify_expr(*value)?;

        Some(NodeKind::Access(Access::Field(FieldAccess {
            expr: value,
            field,
        })))
    }

    fn index_expr(
        &mut self,
        IndexExpr {
            id: _,
            span: _,
            value,
            index,
        }: IndexExpr<'heap>,
    ) -> Option<NodeKind<'heap>> {
        let value = self.reify_expr(*value);
        let index = self.reify_expr(*index);

        let (value, index) = Option::zip(value, index)?;

        Some(NodeKind::Access(Access::Index(IndexAccess {
            expr: value,
            index,
        })))
    }

    fn as_expr(
        &mut self,
        AsExpr {
            id: _,
            span: _,
            value,
            r#type,
        }: AsExpr<'heap>,
    ) -> Option<NodeKind<'heap>> {
        let value = self.reify_expr(*value)?;

        Some(NodeKind::Operation(Operation::Type(
            TypeOperation::Assertion(TypeAssertion {
                value,
                r#type: self.types.anonymous[r#type.id],
                force: false,
            }),
        )))
    }

    pub(super) fn reify_expr(&mut self, expr: Expr<'heap>) -> Option<Node<'heap>> {
        self.expr_fold(expr, None)
    }

    pub(super) fn expr_fold(
        &mut self,
        expr: Expr<'heap>,
        bindings: Option<&mut Vec<Binding<'heap>, A>>,
    ) -> Option<Node<'heap>> {
        let hir_id = self.context.counter.hir.next();

        let (span, kind) = match expr.kind {
            ExprKind::Call(call) => (call.span, self.call_expr(call)?),
            ExprKind::Struct(r#struct) => (r#struct.span, data::reify_struct(self, r#struct)?),
            ExprKind::Dict(dict) => (dict.span, data::reify_dict(self, dict)?),
            ExprKind::Tuple(tuple) => (tuple.span, data::reify_tuple(self, tuple)?),
            ExprKind::List(list) => (list.span, data::reify_list(self, list)?),
            ExprKind::Literal(literal) => (literal.span, data::reify_literal(self, literal)),
            ExprKind::Path(path) => (path.span, reify_path(self, path)?),
            ExprKind::Let(r#let) => {
                let span = r#let.span;

                match reify_let(self, r#let, bindings)? {
                    Fold::Partial(kind) => (span, kind),
                    Fold::Promote(node) => return Some(node),
                }
            }
            ExprKind::Type(_) => {
                self.diagnostics.push(unprocessed_expression(
                    expr.span,
                    "type declaration",
                    "type extraction",
                ));

                return None;
            }
            ExprKind::NewType(_) => {
                self.diagnostics.push(unprocessed_expression(
                    expr.span,
                    "newtype declaration",
                    "type extraction",
                ));

                return None;
            }
            ExprKind::Input(input) => (input.span, reify_input(self, hir_id, input)?),
            ExprKind::Closure(closure) => (closure.span, reify_closure(self, hir_id, closure)?),
            ExprKind::If(r#if) => (r#if.span, reify_if(self, r#if)?),
            ExprKind::Field(field) => (field.span, self.field_expr(field)?),
            ExprKind::Index(index) => (index.span, self.index_expr(index)?),
            ExprKind::As(r#as) => (r#as.span, self.as_expr(r#as)?),
            ExprKind::Underscore => {
                self.diagnostics
                    .push(underscore_expression(expr.span, self.enclosing));

                return None;
            }
            ExprKind::Dummy => {
                self.diagnostics
                    .push(dummy_expression(expr.span, ReificationTarget::Expr));
                return None;
            }
        };

        Some(self.context.interner.intern_node(NodeData {
            id: hir_id,
            span,
            kind,
        }))
    }
}

impl<'heap, A> DataReifier<'heap> for ExprReifier<'_, '_, '_, 'heap, A>
where
    A: Allocator + Clone,
{
    type Alloc = A;

    fn interner(&self) -> &Interner<'heap> {
        self.context.interner
    }

    fn scratch(&self) -> Self::Alloc {
        self.scratch.clone()
    }

    fn reify_child(
        &mut self,
        site: EnclosingSite<'heap>,
        expr: Expr<'heap>,
    ) -> Option<Node<'heap>> {
        let previous = self.enclosing.replace(site);
        let result = self.reify_expr(expr);
        self.enclosing = previous;
        result
    }

    fn finish_data(
        &mut self,
        span: SpanId,
        kind: NodeKind<'heap>,
        r#type: Option<heap::Box<'heap, Type<'heap>>>,
    ) -> NodeKind<'heap> {
        let Some(r#type) = r#type else {
            return kind;
        };

        NodeKind::Operation(Operation::Type(TypeOperation::Assertion(TypeAssertion {
            value: self.context.interner.intern_node(NodeData {
                id: self.context.counter.hir.next(),
                span,
                kind,
            }),
            r#type: self.types.anonymous[r#type.id],
            force: false,
        })))
    }
}
