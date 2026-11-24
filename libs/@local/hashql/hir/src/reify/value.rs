use core::alloc::Allocator;

use hashql_ast::node::{
    expr::{Expr, ExprKind},
    r#type::Type,
};
use hashql_core::{heap, span::SpanId};
use hashql_diagnostics::DiagnosticIssues;

use super::{
    data::{self, DataReifier},
    error::{
        EnclosingSite, ReificationDiagnosticIssues, ReificationStatus, ReificationTarget,
        dummy_expression, invalid_value_expression,
    },
    finish_reify,
};
use crate::{
    context::HirContext,
    intern::Interner,
    node::{Node, NodeData, kind::NodeKind},
};

#[derive(Debug)]
pub(super) struct ValueReifier<'ctx, 'env, 'heap, A: Allocator> {
    context: &'ctx mut HirContext<'env, 'heap>,
    diagnostics: ReificationDiagnosticIssues,
    enclosing: Option<EnclosingSite<'heap>>,
    scratch: A,
}

impl<'ctx, 'env, 'heap, A> ValueReifier<'ctx, 'env, 'heap, A>
where
    A: Allocator + Clone,
{
    pub(super) const fn new(context: &'ctx mut HirContext<'env, 'heap>, scratch: A) -> Self {
        Self {
            context,
            diagnostics: DiagnosticIssues::new(),
            enclosing: None,
            scratch,
        }
    }

    pub(super) fn reify(mut self, expr: Expr<'heap>) -> ReificationStatus<Node<'heap>> {
        let expr_span = expr.span;
        let node = self.value(expr);
        finish_reify(
            self.context,
            self.diagnostics,
            node,
            expr_span,
            ReificationTarget::Value,
        )
    }

    fn value(&mut self, expr: Expr<'heap>) -> Option<Node<'heap>> {
        let hir_id = self.context.counter.hir.next();

        let (span, kind) = match expr.kind {
            ExprKind::Struct(r#struct) => (r#struct.span, data::reify_struct(self, r#struct)?),
            ExprKind::Dict(dict) => (dict.span, data::reify_dict(self, dict)?),
            ExprKind::Tuple(tuple) => (tuple.span, data::reify_tuple(self, tuple)?),
            ExprKind::List(list) => (list.span, data::reify_list(self, list)?),
            ExprKind::Literal(literal) => (literal.span, data::reify_literal(self, literal)),
            ExprKind::Dummy => {
                self.diagnostics
                    .push(dummy_expression(expr.span, ReificationTarget::Value));
                return None;
            }
            ref disallowed @ (ExprKind::Call(_)
            | ExprKind::Path(_)
            | ExprKind::Let(_)
            | ExprKind::Type(_)
            | ExprKind::NewType(_)
            | ExprKind::Input(_)
            | ExprKind::Closure(_)
            | ExprKind::If(_)
            | ExprKind::Field(_)
            | ExprKind::Index(_)
            | ExprKind::As(_)
            | ExprKind::Underscore) => {
                self.diagnostics.push(invalid_value_expression(
                    expr.span,
                    disallowed,
                    self.enclosing,
                ));
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

impl<'heap, A> DataReifier<'heap> for ValueReifier<'_, '_, 'heap, A>
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
        let result = self.value(expr);
        self.enclosing = previous;
        result
    }

    fn finish_data(
        &mut self,
        _span: SpanId,
        kind: NodeKind<'heap>,
        r#type: Option<heap::Box<'heap, Type<'heap>>>,
    ) -> NodeKind<'heap> {
        debug_assert!(
            r#type.is_none(),
            "AST value nodes carry no type annotations"
        );
        kind
    }
}
