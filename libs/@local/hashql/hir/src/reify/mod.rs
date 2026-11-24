pub mod error;

use core::{alloc::Allocator, marker::PhantomData, mem};

use hashql_ast::{
    lower::ExtractedTypes,
    node::{
        expr::{
            AsExpr, CallExpr, ClosureExpr, DictExpr, Expr, ExprKind, FieldExpr, IfExpr, IndexExpr,
            InputExpr, LetExpr, ListExpr, LiteralExpr, StructExpr, TupleExpr, call::Argument,
            dict::DictEntry,
        },
        path::{Path, PathSegmentArgument},
        r#type::Type,
    },
};
use hashql_core::{
    collections::{FastHashMap, HashMapExt as _, SmallVec, fast_hash_map_in},
    heap::{self, CollectIn},
    intern::Interned,
    span::{SpanId, Spanned},
    symbol::{Ident, IdentKind, Symbol, sym},
    r#type::TypeId,
};
use hashql_diagnostics::{DiagnosticIssues, Status, StatusExt as _};

use self::error::{
    ReificationDiagnosticIssues, ReificationStatus, dummy_expression, internal_error,
    underscore_expression, unprocessed_expression,
};
use crate::{
    context::HirContext,
    node::{
        HirId, Node, NodeData, Value,
        access::{Access, FieldAccess, IndexAccess},
        branch::{Branch, If},
        call::{Call, CallArgument, PointerKind},
        closure::{Closure, ClosureParam, ClosureSignature},
        data::{Data, Dict, DictField, List, Struct, StructField, Tuple},
        kind::NodeKind,
        r#let::{Binder, Binding, Let, VarId},
        operation::{InputOp, InputOperation, Operation, TypeAssertion, TypeOperation},
        variable::{LocalVariable, QualifiedVariable, Variable},
    },
    path::QualifiedPath,
};

enum Fold<'heap> {
    Partial(NodeKind<'heap>),
    Promote(Node<'heap>),
}

trait Descent {
    fn descend<'heap, A: Allocator>(
        context: &mut ReificationContext<'_, '_, '_, 'heap, Self, A>,
        expr: Expr<'heap>,
    ) -> Option<Node<'heap>>;
}

struct ExprDescent;

impl Descent for ExprDescent {
    fn descend<'heap, A: Allocator>(
        context: &mut ReificationContext<'_, '_, '_, 'heap, Self, A>,
        expr: Expr<'heap>,
    ) -> Option<Node<'heap>> {
        context.expr(expr)
    }
}

struct ValueDescent;

impl Descent for ValueDescent {
    fn descend<'heap, A: Allocator>(
        context: &mut ReificationContext<'_, '_, '_, 'heap, Self, A>,
        expr: Expr<'heap>,
    ) -> Option<Node<'heap>> {
        context.value(expr)
    }
}

// TODO: we might want to contemplate moving this into a separate crate, to completely separate
// HashQL's AST and HIR. (like done in rustc)
#[derive(Debug)]
struct ReificationContext<'ctx, 'types, 'env, 'heap, D: ?Sized, A: Allocator> {
    context: &'ctx mut HirContext<'env, 'heap>,
    types: &'types ExtractedTypes<'heap>,
    diagnostics: ReificationDiagnosticIssues,
    binder_scope: FastHashMap<Symbol<'heap>, VarId, A>,
    scratch: A,
    _marker: PhantomData<fn() -> D>,
}

impl<'heap, D, A: Allocator> ReificationContext<'_, '_, '_, 'heap, D, A>
where
    D: Descent + ?Sized,
{
    fn call_arguments(
        &mut self,
        args: heap::Vec<'heap, Argument<'heap>>,
    ) -> Option<Interned<'heap, [CallArgument<'heap>]>> {
        let mut incomplete = false;
        let mut arguments = SmallVec::with_capacity(args.len());

        for argument in args {
            let Some(value) = D::descend(self, argument.value) else {
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

        let function = D::descend(self, *function);
        let arguments = self.call_arguments(arguments);

        let (function, arguments) = Option::zip(function, arguments)?;

        Some(NodeKind::Call(Call {
            kind: PointerKind::Fat,
            function,
            arguments,
        }))
    }

    fn wrap_type_assertion_node(
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

    fn wrap_type_assertion(
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

    fn tuple_expr(
        &mut self,
        TupleExpr {
            id: _,
            span,
            elements,
            r#type,
        }: TupleExpr<'heap>,
    ) -> Option<NodeKind<'heap>> {
        let len = elements.len();
        let mut fields = SmallVec::with_capacity(len);

        for (index, element) in elements.into_iter().enumerate() {
            let Some(field) = D::descend(self, element.value) else {
                continue;
            };

            if fields.len() != index {
                // Since a previous iteration has failed we can skip any subsequent pushes, this
                // allows the `SmallVec` to avoid reallocations if we're going to fail anyway.
                continue;
            }

            fields.push(field);
        }

        if fields.len() != len {
            return None;
        }

        let kind = NodeKind::Data(Data::Tuple(Tuple {
            fields: self.context.interner.intern_nodes(&fields),
        }));

        Some(self.wrap_type_assertion(span, kind, r#type))
    }

    fn list_expr(
        &mut self,
        ListExpr {
            id: _,
            span,
            elements: list_elements,
            r#type,
        }: ListExpr<'heap>,
    ) -> Option<NodeKind<'heap>> {
        let len = list_elements.len();
        let mut elements = SmallVec::with_capacity(len);

        for (index, element) in list_elements.into_iter().enumerate() {
            let Some(element) = D::descend(self, *element.value) else {
                continue;
            };

            if elements.len() != index {
                // Since a previous iteration has failed we can skip any subsequent pushes, this
                // allows the `SmallVec` to avoid reallocations if we're going to fail anyway.
                continue;
            }

            elements.push(element);
        }

        if elements.len() != len {
            return None;
        }

        let kind = NodeKind::Data(Data::List(List {
            elements: self.context.interner.intern_nodes(&elements),
        }));

        Some(self.wrap_type_assertion(span, kind, r#type))
    }

    fn struct_expr(
        &mut self,
        StructExpr {
            id: _,
            span,
            entries,
            r#type,
        }: StructExpr<'heap>,
    ) -> Option<NodeKind<'heap>> {
        let len = entries.len();
        let mut fields = SmallVec::with_capacity(len);

        for (index, entry) in entries.into_iter().enumerate() {
            let Some(value) = D::descend(self, entry.value) else {
                continue;
            };

            if fields.len() != index {
                // Since a previous iteration has failed we can skip any subsequent pushes, this
                // allows the `SmallVec` to avoid reallocations if we're going to fail anyway.
                continue;
            }

            fields.push(StructField {
                name: entry.key,
                value,
            });
        }

        if fields.len() != len {
            return None;
        }

        let kind = NodeKind::Data(Data::Struct(Struct {
            fields: self.context.interner.intern_struct_fields(&mut fields),
        }));

        Some(self.wrap_type_assertion(span, kind, r#type))
    }

    fn dict_expr(
        &mut self,
        DictExpr {
            id: _,
            span,
            entries,
            r#type,
        }: DictExpr<'heap>,
    ) -> Option<NodeKind<'heap>> {
        let len = entries.len();
        let mut fields = SmallVec::with_capacity(len);

        for (
            index,
            DictEntry {
                id: _,
                span: _,
                key,
                value,
            },
        ) in entries.into_iter().enumerate()
        {
            let key = D::descend(self, *key);
            let value = D::descend(self, *value);

            let Some((key, value)) = Option::zip(key, value) else {
                continue;
            };

            if fields.len() != index {
                // Since a previous iteration has failed we can skip any subsequent pushes, this
                // allows the `SmallVec` to avoid reallocations if we're going to fail anyway.
                continue;
            }

            fields.push(DictField { key, value });
        }

        if fields.len() != len {
            return None;
        }

        let kind = NodeKind::Data(Data::Dict(Dict {
            fields: self.context.interner.intern_dict_fields(&fields),
        }));

        Some(self.wrap_type_assertion(span, kind, r#type))
    }

    fn literal_expr(
        &mut self,
        LiteralExpr {
            id: _,
            span,
            kind,
            r#type,
        }: LiteralExpr<'heap>,
    ) -> NodeKind<'heap> {
        let kind = NodeKind::Data(Data::Primitive(kind));
        self.wrap_type_assertion(span, kind, r#type)
    }

    fn path_segment_arguments(
        &mut self,
        arguments: heap::Vec<'heap, PathSegmentArgument<'heap>>,
    ) -> Option<Interned<'heap, [Spanned<TypeId>]>> {
        let mut incomplete = false;
        let mut types = SmallVec::new();

        for argument in arguments {
            let span = argument.span();
            let node = match argument {
                PathSegmentArgument::Argument(generic_argument) => {
                    self.types.anonymous[generic_argument.r#type.id]
                }
                PathSegmentArgument::Constraint(generic_constraint) => {
                    let def = &self.types.locals[generic_constraint.name.value];
                    if !def.value.arguments.is_empty() {
                        self.diagnostics.push(internal_error(
                            generic_constraint.span,
                            "generic constraints with arguments should have been rejected by the \
                             sanitizer",
                        ));
                        incomplete = true;
                        continue;
                    }

                    def.value.id
                }
            };

            types.push(Spanned { span, value: node });
        }

        if incomplete {
            None
        } else {
            Some(self.context.interner.intern_type_ids(&types))
        }
    }

    fn path(&mut self, path: Path<'heap>) -> Option<NodeKind<'heap>> {
        let span = path.span;
        let variable = match path.into_generic_ident() {
            Ok((ident, args)) => {
                // undeclared variables should have been resolved in the AST (import resolution)
                let binder = self.binder_scope[&ident.value];

                Variable::Local(LocalVariable {
                    id: Spanned {
                        span: ident.span,
                        value: binder,
                    },
                    arguments: self.path_segment_arguments(args)?,
                })
            }
            Err(mut path) => {
                if !path.rooted {
                    self.diagnostics.push(internal_error(
                        span,
                        "relative paths should have been resolved during import resolution",
                    ));
                    return None;
                }

                let arguments = mem::replace(
                    &mut path
                        .segments
                        .last_mut()
                        .unwrap_or_else(|| unreachable!())
                        .arguments,
                    Vec::new_in(self.context.heap), // capacity of 0 does not allocate
                );

                let mut segments = SmallVec::with_capacity(path.segments.len());
                for segment in path.segments {
                    segments.push(segment.name);
                }

                Variable::Qualified(QualifiedVariable {
                    path: QualifiedPath::new_unchecked(
                        self.context.interner.intern_idents(&segments),
                    ),
                    arguments: self.path_segment_arguments(arguments)?,
                })
            }
        };

        Some(NodeKind::Variable(variable))
    }

    fn let_expr(
        &mut self,
        LetExpr {
            id: _,
            span: _,
            name,
            value,
            r#type,
            body,
        }: LetExpr<'heap>,
        bindings: Option<&mut Vec<Binding<'heap>>>,
    ) -> Option<Fold<'heap>> {
        let value_span = value.span;
        let binder = Binder {
            id: self.context.counter.var.next(),
            span: name.span,
            name: Some(name.value),
        };

        // The name manager guarantees that the name is unique within the program
        self.binder_scope.insert_unique(name.value, binder.id);
        self.context.symbols.binder.insert(binder.id, name.value);

        let mut value = D::descend(self, *value);

        if let Some(value) = value.as_mut()
            && let Some(r#type) = r#type.as_ref()
        {
            *value = self.wrap_type_assertion_node(r#type.span, *value, r#type);
        }

        if let Some(bindings) = bindings {
            // We're already nested, add us to the existing set of bindings
            bindings.push(Binding {
                // TODO: https://linear.app/hash/issue/BE-76/hashql-allow-spanids-to-span-multiple-spans
                span: value_span,
                binder,
                value: value?,
            });

            // Simply return the body instead of us directly
            // using `expr_fold` directly here is fine, because `let` can only be used in the
            // `ExprDescend` context
            let body = self.expr_fold(*body, Some(bindings));
            self.binder_scope.remove(&name.value);

            return body.map(Fold::Promote);
        }

        let mut bindings = Vec::new();
        let mut incomplete = true;

        // We don't immediately return, and instead just delay it so that we can collect errors in
        // the body.
        if let Some(value) = value {
            incomplete = false;
            bindings.push(Binding {
                // TODO: https://linear.app/hash/issue/BE-76/hashql-allow-spanids-to-span-multiple-spans
                span: value_span,
                binder,
                value,
            });
        }

        let body = self.expr_fold(*body, Some(&mut bindings));
        self.binder_scope.remove(&name.value);

        let body = body?;
        if incomplete {
            return None;
        }

        let kind = NodeKind::Let(Let {
            bindings: self.context.interner.bindings.intern_slice(&bindings),
            body,
        });

        Some(Fold::Partial(kind))
    }

    const fn input_node_kind(span: SpanId, name: Ident<'heap>, op: InputOp) -> NodeKind<'heap> {
        NodeKind::Operation(Operation::Input(InputOperation {
            op: Spanned { span, value: op },
            name,
        }))
    }

    fn input_node(&mut self, span: SpanId, name: Ident<'heap>, op: InputOp) -> Node<'heap> {
        self.context.interner.intern_node(NodeData {
            id: self.context.counter.hir.next(),
            span,
            kind: Self::input_node_kind(span, name, op),
        })
    }

    fn input_expr_default(
        &mut self,
        span: SpanId,
        name: Ident<'heap>,
        r#type: &Type<'heap>,
        default: Expr<'heap>,
    ) -> Option<NodeKind<'heap>> {
        // `input(name, type: type, default: expr)` is the same as
        // `if INPUT_EXISTS(name) then INPUT_LOAD(name) else (default as type)`
        let default = D::descend(self, default)?;

        let then = self.input_node(span, name, InputOp::Load { required: false });
        let type_id = self.types.anonymous[r#type.id];
        self.context.map.insert_type_id(then.id, type_id);

        Some(NodeKind::Branch(Branch::If(If {
            test: self.input_node(span, name, InputOp::Exists),
            then,
            r#else: self.wrap_type_assertion_node(span, default, r#type),
        })))
    }

    fn input_expr_required(
        &mut self,
        hir_id: HirId,
        span: SpanId,
        r#type: &Type<'heap>,
        name: Ident<'heap>,
    ) -> NodeKind<'heap> {
        let type_id = self.types.anonymous[r#type.id];
        self.context.map.insert_type_id(hir_id, type_id);

        Self::input_node_kind(span, name, InputOp::Load { required: true })
    }

    fn input_expr(
        &mut self,
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
            self.input_expr_default(span, name, &r#type, *default)
        } else {
            Some(self.input_expr_required(hir_id, span, &r#type, name))
        }
    }

    fn closure_expr(
        &mut self,
        hir_id: HirId,
        ClosureExpr {
            id: _,
            span: _,
            signature,
            body,
        }: ClosureExpr<'heap>,
    ) -> Option<NodeKind<'heap>> {
        let signature_def = self.types.signatures[signature.id];
        self.context.map.insert_type_def(hir_id, signature_def);

        let mut params = SmallVec::with_capacity(signature.inputs.len());
        for &hashql_ast::node::expr::closure::ClosureParam {
            id: _,
            span,
            name,
            bound: _,
        } in &signature.inputs
        {
            let id = self.context.counter.var.next();
            self.binder_scope.insert_unique(name.value, id);
            self.context.symbols.binder.insert(id, name.value);

            params.push(ClosureParam {
                span,
                name: Binder {
                    id,
                    span: name.span,
                    name: Some(name.value),
                },
            });
        }

        let body = D::descend(self, *body)?;

        for param in &signature.inputs {
            self.binder_scope.remove(&param.name.value);
        }

        Some(NodeKind::Closure(Closure {
            signature: ClosureSignature {
                span: signature.span,
                params: self.context.interner.intern_closure_params(&params),
            },
            body,
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
        let value = D::descend(self, *value)?;

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
        let value = D::descend(self, *value);
        let index = D::descend(self, *index);

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
        let value = D::descend(self, *value)?;

        Some(NodeKind::Operation(Operation::Type(
            TypeOperation::Assertion(TypeAssertion {
                value,
                r#type: self.types.anonymous[r#type.id],
                force: false,
            }),
        )))
    }

    fn make_qualified_path(&mut self, span: SpanId, path: &[Symbol<'heap>]) -> Node<'heap> {
        // this is fine because the bump allocator will just reclaim this memory immediately.
        let path: Vec<_, _> = path
            .iter()
            .map(|&value| Ident {
                span,
                value,
                kind: IdentKind::Lexical,
            })
            .collect_in(&self.scratch);
        let path = QualifiedPath::new_unchecked(self.context.interner.intern_idents(&path));

        let node = NodeData {
            id: self.context.counter.hir.next(),
            span,
            kind: NodeKind::Variable(Variable::Qualified(QualifiedVariable {
                path,
                arguments: self.context.interner.intern_type_ids(&[]),
            })),
        };

        self.context.interner.intern_node(node)
    }

    fn if_expr_if_else(
        &mut self,
        test: Expr<'heap>,
        then: Expr<'heap>,
        r#else: Expr<'heap>,
    ) -> Option<NodeKind<'heap>> {
        let test = D::descend(self, test);
        let then = D::descend(self, then);
        let r#else = D::descend(self, r#else);

        Some(NodeKind::Branch(Branch::If(If {
            test: test?,
            then: then?,
            r#else: r#else?,
        })))
    }

    fn if_expr_then_some(&mut self, node: Node<'heap>) -> Node<'heap> {
        let some_some = self.make_qualified_path(node.span, &[sym::core, sym::option, sym::Some]);

        let node = NodeData {
            id: self.context.counter.hir.next(),
            span: node.span,
            kind: NodeKind::Call(Call {
                kind: PointerKind::Fat,
                function: some_some,
                arguments: self.context.interner.intern_call_arguments(&[CallArgument {
                    span: node.span,
                    value: node,
                }]),
            }),
        };

        self.context.interner.intern_node(node)
    }

    fn if_expr_else_none(&mut self, span: SpanId) -> Node<'heap> {
        let none_path = self.make_qualified_path(span, &[sym::core, sym::option, sym::None]);

        let node = NodeData {
            id: self.context.counter.hir.next(),
            span,
            kind: NodeKind::Call(Call {
                kind: PointerKind::Fat,
                function: none_path,
                arguments: self.context.interner.intern_call_arguments(&[]),
            }),
        };

        self.context.interner.intern_node(node)
    }

    fn if_expr(
        &mut self,
        IfExpr {
            id: _,
            span,
            test,
            then,
            r#else,
        }: IfExpr<'heap>,
    ) -> Option<NodeKind<'heap>> {
        if let Some(r#else) = r#else {
            return self.if_expr_if_else(*test, *then, *r#else);
        }

        // `r#else` is `None`, so we desugar to `Option<T>`
        let (test, then) = Option::zip(D::descend(self, *test), D::descend(self, *then))?;

        // Then must be wrapped in an `Option` call
        Some(NodeKind::Branch(Branch::If(If {
            test,
            then: self.if_expr_then_some(then),
            r#else: self.if_expr_else_none(span),
        })))
    }

    fn expr(&mut self, expr: Expr<'heap>) -> Option<Node<'heap>> {
        self.expr_fold(expr, None)
    }

    fn expr_fold(
        &mut self,
        expr: Expr<'heap>,
        bindings: Option<&mut Vec<Binding<'heap>>>,
    ) -> Option<Node<'heap>> {
        let hir_id = self.context.counter.hir.next();

        let (span, kind) = match expr.kind {
            ExprKind::Call(call) => (call.span, self.call_expr(call)?),
            ExprKind::Struct(r#struct) => (r#struct.span, self.struct_expr(r#struct)?),
            ExprKind::Dict(dict) => (dict.span, self.dict_expr(dict)?),
            ExprKind::Tuple(tuple) => (tuple.span, self.tuple_expr(tuple)?),
            ExprKind::List(list) => (list.span, self.list_expr(list)?),
            ExprKind::Literal(literal) => (literal.span, self.literal_expr(literal)),
            ExprKind::Path(path) => (path.span, self.path(path)?),
            ExprKind::Let(r#let) => {
                let span = r#let.span;

                match self.let_expr(r#let, bindings)? {
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
            ExprKind::Input(input) => (input.span, self.input_expr(hir_id, input)?),
            ExprKind::Closure(closure) => (closure.span, self.closure_expr(hir_id, closure)?),
            ExprKind::If(r#if) => (r#if.span, self.if_expr(r#if)?),
            ExprKind::Field(field) => (field.span, self.field_expr(field)?),
            ExprKind::Index(index) => (index.span, self.index_expr(index)?),
            ExprKind::As(r#as) => (r#as.span, self.as_expr(r#as)?),
            ExprKind::Underscore => {
                self.diagnostics.push(underscore_expression(expr.span));

                return None;
            }
            ExprKind::Dummy => {
                self.diagnostics.push(dummy_expression(expr.span));
                return None;
            }
        };

        Some(self.context.interner.intern_node(NodeData {
            id: hir_id,
            span,
            kind,
        }))
    }

    fn value(&mut self, expr: Expr<'heap>) -> Option<Node<'heap>> {
        let hir_id = self.context.counter.hir.next();

        let (span, kind) = match expr.kind {
            ExprKind::Struct(r#struct) => (r#struct.span, self.struct_expr(r#struct)?),
            ExprKind::Dict(dict) => (dict.span, self.dict_expr(dict)?),
            ExprKind::Tuple(tuple) => (tuple.span, self.tuple_expr(tuple)?),
            ExprKind::List(list) => (list.span, self.list_expr(list)?),
            ExprKind::Literal(literal) => (literal.span, self.literal_expr(literal)),
            ExprKind::Dummy => {
                self.diagnostics.push(dummy_expression(expr.span));
                return None;
            }
            ExprKind::Call(_)
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
            | ExprKind::Underscore => {
                todo!("error out");
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

fn reify<'heap, D, A>(
    expr: Expr<'heap>,
    context: &mut HirContext<'_, 'heap>,
    types: &ExtractedTypes<'heap>,
    alloc: A,
) -> ReificationStatus<Node<'heap>>
where
    D: Descent + ?Sized,
    A: Allocator + Clone,
{
    // pre-populate the binder_scope and symbol table with types, as ctor might reference them
    // once `ConvertTypeConstructor` is run, these variables are no longer referenced inside the
    // tree
    let fast_hash_map_in = fast_hash_map_in(alloc.clone());
    let mut binder_scope = fast_hash_map_in;
    for local in types.locals.iter() {
        let id = context.counter.var.next();
        binder_scope.insert_unique(local.name, id);
        context.symbols.binder.insert(id, local.name);
    }

    let expr_span = expr.span;
    let mut context = ReificationContext::<D, _> {
        context,
        types,
        diagnostics: DiagnosticIssues::new(),
        binder_scope,
        scratch: alloc,
        _marker: PhantomData,
    };

    let node = D::descend(&mut context, expr);

    // After we're done pre-fill the `HirMap`
    context
        .context
        .map
        .populate(context.context.counter.hir.bound());

    let status = context.diagnostics.into_status(());
    match (node, status) {
        (Some(node), Ok(success)) => Ok(success.map(|()| node)),
        (None, Ok(success)) => {
            let Err(error) = internal_error(
                expr_span,
                "Reification hasn't produced a node, but no critical diagnostics have been \
                 reported.",
            )
            .specialize() else {
                unreachable!("internal error should be an ICE");
            };

            let mut status = Status::failure(error);

            status.append_diagnostics(&mut success.advisories.generalize());
            status
        }
        // We don't care if we have a value or not critical diagnostics take priority.
        (Some(_) | None, Err(failure)) => Err(failure),
    }
}

impl<'heap> NodeData<'heap> {
    /// Converts an AST expression into a HIR node through the reification process.
    ///
    /// This function is typically called after the AST lowering phase has completed, using the type
    /// information extracted during lowering to properly construct HIR nodes with accurate type
    /// annotations.
    ///
    /// # Errors
    ///
    /// The function returns diagnostic errors for several categories of issues:
    ///
    /// - **Unprocessed expressions** - AST nodes that should have been handled by earlier
    ///   compilation phases (type declarations, use statements)
    /// - **Internal errors** - Inconsistent state that indicates bugs in the compiler pipeline
    /// - **Underscore/dummy expressions** - Invalid placeholder expressions in the AST
    ///
    /// Critical errors prevent HIR node creation, while non-critical diagnostics are included
    /// as advisories in successful results.
    pub fn from_ast_in<'env, A>(
        expr: Expr<'heap>,
        context: &mut HirContext<'env, 'heap>,
        types: &ExtractedTypes<'heap>,
        alloc: A,
    ) -> ReificationStatus<Node<'heap>>
    where
        A: Allocator + Clone,
    {
        reify::<ExprDescent, A>(expr, context, types, alloc)
    }
}

impl<'heap> Value<'heap> {
    pub fn from_ast_in<'env, A>(
        value: hashql_ast::node::value::Value<'heap>,
        context: &mut HirContext<'env, 'heap>,
        types: &ExtractedTypes<'heap>,
        alloc: A,
    ) -> ReificationStatus<Self>
    where
        A: Allocator + Clone,
    {
        reify::<ValueDescent, A>(value.into_expr(), context, types, alloc)
            .map_value(Value::new_unchecked)
    }
}
