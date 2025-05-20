use core::mem;

use hashql_ast::{
    lowering::type_extractor::{AnonymousTypes, ClosureSignatures},
    node::{
        expr::{
            CallExpr, ClosureExpr, Expr, ExprKind, FieldExpr, IndexExpr, InputExpr, IsExpr,
            LetExpr, LiteralExpr, call::Argument, closure,
        },
        path::{Path, PathSegmentArgument},
        r#type::Type,
    },
};
use hashql_core::{
    collection::SmallVec,
    heap,
    intern::Interned,
    module::locals::TypeLocals,
    span::SpanId,
    r#type::{TypeId, environment::Environment},
};

use crate::{
    intern::Interner,
    node::{
        HirIdProducer, Node, PartialNode,
        access::{Access, AccessKind, field::FieldAccess, index::IndexAccess},
        call::{Call, CallArgument},
        closure::{Closure, ClosureParam, ClosureSignature},
        data::{Data, DataKind, Literal},
        input::Input,
        kind::NodeKind,
        r#let::Let,
        operation::{
            Operation, OperationKind, TypeOperation,
            r#type::{TypeAssertion, TypeOperationKind},
        },
        variable::{LocalVariable, QualifiedVariable, Variable, VariableKind},
    },
    path::QualifiedPath,
};

#[derive(Debug, Copy, Clone)]
struct ConversionContext<'env, 'heap> {
    producer: &'env HirIdProducer,
    env: &'env Environment<'heap>,
    interner: &'env Interner<'heap>,
    anon_types: &'env AnonymousTypes,
    closure_signatures: &'env ClosureSignatures<'heap>,
    local_types: &'env TypeLocals<'heap>,
}

impl<'heap> ConversionContext<'_, 'heap> {
    fn call_arguments(
        &mut self,
        args: heap::Vec<'heap, Argument<'heap>>,
    ) -> Option<Interned<'heap, [CallArgument<'heap>]>> {
        let mut incomplete = false;
        let mut arguments = SmallVec::with_capacity(args.len());

        for argument in args {
            let Some(value) = self.expr(*argument.value) else {
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

        Some(self.interner.intern_call_arguments(&arguments))
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
            todo!("issue diagnostic (compiler bug)");
            return None;
        }

        let function = self.expr(*function);
        let arguments = self.call_arguments(arguments);

        let (function, arguments) = Option::zip(function, arguments)?;

        Some(NodeKind::Call(Call {
            span,
            function,
            arguments,
        }))
    }

    fn wrap_type_assertion(
        &self,
        span: SpanId,
        kind: NodeKind<'heap>,
        r#type: Option<heap::Box<'heap, Type<'heap>>>,
    ) -> NodeKind<'heap> {
        let Some(r#type) = r#type else {
            return kind;
        };

        NodeKind::Operation(Operation {
            span,
            kind: OperationKind::Type(TypeOperation {
                span,
                kind: TypeOperationKind::Assertion(TypeAssertion {
                    span,
                    value: self.interner.intern_node(PartialNode { span, kind }),
                    r#type: self.anon_types[r#type.id],
                    force: false,
                }),
            }),
        })
    }

    fn literal_expr(
        &self,
        LiteralExpr {
            id: _,
            span,
            kind,
            r#type,
        }: LiteralExpr<'heap>,
    ) -> NodeKind<'heap> {
        let kind = NodeKind::Data(Data {
            span,
            kind: DataKind::Literal(Literal { span, kind }),
        });

        self.wrap_type_assertion(span, kind, r#type)
    }

    fn path_segment_arguments(
        &mut self,
        arguments: heap::Vec<'heap, PathSegmentArgument<'heap>>,
    ) -> Option<Interned<'heap, [TypeId]>> {
        let mut incomplete = false;
        let mut types = SmallVec::new();

        for argument in arguments {
            let node = match argument {
                PathSegmentArgument::Argument(generic_argument) => {
                    self.anon_types[generic_argument.r#type.id]
                }
                PathSegmentArgument::Constraint(generic_constraint) => {
                    let def = &self.local_types[generic_constraint.name.value];
                    if !def.value.arguments.is_empty() {
                        todo!("report issue (compiler bug)");
                        incomplete = true;
                        continue;
                    }

                    def.value.id
                }
            };

            types.push(node);
        }

        if incomplete {
            None
        } else {
            Some(self.env.intern_type_ids(&types))
        }
    }

    fn path(&mut self, path: Path<'heap>) -> Option<NodeKind<'heap>> {
        let span = path.span;
        let kind = match path.into_generic_ident() {
            Ok((ident, args)) => VariableKind::Local(LocalVariable {
                span,
                name: ident,
                arguments: self.path_segment_arguments(args)?,
            }),
            Err(mut path) => {
                if !path.rooted {
                    todo!("issue diagnostic (compiler bug)")
                }

                let arguments = mem::replace(
                    &mut path
                        .segments
                        .last_mut()
                        .unwrap_or_else(|| unreachable!())
                        .arguments,
                    self.env.heap.vec(Some(0)), // capacity of 0 does not allocate
                );

                let mut segments = SmallVec::with_capacity(path.segments.len());
                for segment in path.segments {
                    segments.push(segment.name);
                }

                VariableKind::Qualified(QualifiedVariable {
                    span,
                    path: QualifiedPath::new_unchecked(self.interner.intern_idents(&segments)),
                    arguments: self.path_segment_arguments(arguments)?,
                })
            }
        };

        Some(NodeKind::Variable(Variable { span, kind }))
    }

    fn let_expr(
        &mut self,
        LetExpr {
            id: _,
            span,
            name,
            value,
            r#type,
            body,
        }: LetExpr<'heap>,
    ) -> Option<NodeKind<'heap>> {
        let value = self.expr(*value);
        let body = self.expr(*body);

        let (value, body) = Option::zip(value, body)?;

        let kind = NodeKind::Let(Let {
            span,
            name,
            value,
            body,
        });

        Some(self.wrap_type_assertion(span, kind, r#type))
    }

    fn input_expr(
        &mut self,
        InputExpr {
            id: _,
            span,
            name,
            r#type,
            default,
        }: InputExpr<'heap>,
    ) -> Option<NodeKind<'heap>> {
        let kind = NodeKind::Input(Input {
            span,
            name,
            r#type: self.anon_types[r#type.id],
            default: if let Some(default) = default {
                Some(self.expr(*default)?)
            } else {
                None
            },
        });

        Some(kind)
    }

    fn closure_signature(
        &self,
        closure::ClosureSignature {
            id,
            span,
            generics: _,
            inputs,
            output: _,
        }: closure::ClosureSignature<'heap>,
    ) -> ClosureSignature<'heap> {
        let r#type = &self.closure_signatures[id];
        let params: SmallVec<_> = inputs
            .iter()
            .map(|param| ClosureParam {
                span: param.span,
                name: param.name,
            })
            .collect();

        ClosureSignature {
            span,
            r#type: r#type.id,
            generics: self.interner.intern_closure_generics(&r#type.arguments),
            params: self.interner.intern_closure_params(&params),
        }
    }

    fn closure_expr(
        &mut self,
        ClosureExpr {
            id: _,
            span,
            signature,
            body,
        }: ClosureExpr<'heap>,
    ) -> Option<NodeKind<'heap>> {
        let body = self.expr(*body)?;

        Some(NodeKind::Closure(Closure {
            span,
            signature: self.closure_signature(*signature),
            body,
        }))
    }

    fn field_expr(
        &mut self,
        FieldExpr {
            id: _,
            span,
            value,
            field,
        }: FieldExpr<'heap>,
    ) -> Option<NodeKind<'heap>> {
        let value = self.expr(*value)?;

        Some(NodeKind::Access(Access {
            span,
            kind: AccessKind::Field(FieldAccess {
                span,
                expr: value,
                field,
            }),
        }))
    }

    fn index_expr(
        &mut self,
        IndexExpr {
            id: _,
            span,
            value,
            index,
        }: IndexExpr<'heap>,
    ) -> Option<NodeKind<'heap>> {
        let value = self.expr(*value);
        let index = self.expr(*index);

        let (value, index) = Option::zip(value, index)?;

        Some(NodeKind::Access(Access {
            span,
            kind: AccessKind::Index(IndexAccess {
                span,
                expr: value,
                index,
            }),
        }))
    }

    fn is_expr(
        &mut self,
        IsExpr {
            id: _,
            span,
            value,
            r#type,
        }: IsExpr<'heap>,
    ) -> Option<NodeKind<'heap>> {
        let value = self.expr(*value)?;

        Some(NodeKind::Operation(Operation {
            span,
            kind: OperationKind::Type(TypeOperation {
                span,
                kind: TypeOperationKind::Assertion(TypeAssertion {
                    span,
                    value,
                    r#type: self.anon_types[r#type.id],
                    force: false,
                }),
            }),
        }))
    }

    fn expr(&mut self, expr: Expr<'heap>) -> Option<Node<'heap>> {
        let kind = match expr.kind {
            ExprKind::Call(call) => self.call_expr(call)?,
            ExprKind::Struct(_) => panic!("unsupported construct (for now)"),
            ExprKind::Dict(_) => panic!("unsupported construct (for now)"),
            ExprKind::Tuple(_) => panic!("unsupported construct (for now)"),
            ExprKind::List(_) => panic!("unsupported construct (for now)"),
            ExprKind::Literal(literal) => self.literal_expr(literal),
            ExprKind::Path(path) => self.path(path)?,
            ExprKind::Let(r#let) => self.let_expr(r#let)?,
            ExprKind::Type(_) => panic!("I should've been removed"),
            ExprKind::NewType(_) => panic!("I should've been removed"),
            ExprKind::Use(_) => panic!("I should've been removed"),
            ExprKind::Input(input) => self.input_expr(input)?,
            ExprKind::Closure(closure) => self.closure_expr(closure)?,
            ExprKind::If(_) => panic!("unsupported construct (for now)"),
            ExprKind::Field(field) => self.field_expr(field)?,
            ExprKind::Index(index) => self.index_expr(index)?,
            ExprKind::Is(is) => self.is_expr(is)?,
            ExprKind::Underscore => todo!("is no longer allowed here!"),
            ExprKind::Dummy => panic!("I shouldn't even exist D:"),
        };

        Some(self.interner.intern_node(PartialNode {
            span: expr.span,
            kind,
        }))
    }
}

impl<'heap> Node<'heap> {
    pub fn from_ast(node: Expr<'heap>) -> Self {
        // let producer = HirIdProducer::new();
        // Self::from_ast_inner(&producer, node)
        todo!()
    }
}
