pub mod error;

use core::mem;

use hashql_ast::{
    lowering::ExtractedTypes,
    node::{
        expr::{
            AsExpr, CallExpr, ClosureExpr, Expr, ExprKind, FieldExpr, IndexExpr, InputExpr,
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
    span::{SpanId, Spanned},
    r#type::{TypeId, environment::Environment},
};
use hashql_diagnostics::{DiagnosticIssues, Status, StatusExt as _};

use self::error::{
    ReificationDiagnosticIssues, ReificationStatus, dummy_expression, internal_error,
    underscore_expression, unprocessed_expression, unsupported_construct,
};
use crate::{
    intern::Interner,
    node::{
        Node, PartialNode,
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

// TODO: we might want to contemplate moving this into a separate crate, to completely separate
// HashQL's AST and HIR. (like done in rustc)
#[derive(Debug)]
struct ReificationContext<'env, 'heap> {
    env: &'env Environment<'heap>,
    interner: &'env Interner<'heap>,
    types: &'env ExtractedTypes<'heap>,
    diagnostics: ReificationDiagnosticIssues,
}

impl<'heap> ReificationContext<'_, 'heap> {
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
            self.diagnostics.push(internal_error(
                span,
                "labeled arguments in call expressions should have been processed earlier",
            ));
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
                    r#type: self.types.anonymous[r#type.id],
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
            Some(self.interner.intern_type_ids(&types))
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
            r#type: self.types.anonymous[r#type.id],
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
        let def = self.types.signatures[id];
        let params: SmallVec<_> = inputs
            .iter()
            .map(|param| ClosureParam {
                span: param.span,
                name: param.name,
            })
            .collect();

        ClosureSignature {
            span,
            def,
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

    fn as_expr(
        &mut self,
        AsExpr {
            id: _,
            span,
            value,
            r#type,
        }: AsExpr<'heap>,
    ) -> Option<NodeKind<'heap>> {
        let value = self.expr(*value)?;

        Some(NodeKind::Operation(Operation {
            span,
            kind: OperationKind::Type(TypeOperation {
                span,
                kind: TypeOperationKind::Assertion(TypeAssertion {
                    span,
                    value,
                    r#type: self.types.anonymous[r#type.id],
                    force: false,
                }),
            }),
        }))
    }

    fn expr(&mut self, expr: Expr<'heap>) -> Option<Node<'heap>> {
        let kind = match expr.kind {
            ExprKind::Call(call) => self.call_expr(call)?,
            ExprKind::Struct(_) => {
                self.diagnostics.push(unsupported_construct(
                    expr.span,
                    "struct literal",
                    "https://linear.app/hash/issue/H-4602/enable-struct-literal-construct",
                ));

                return None;
            }
            ExprKind::Dict(_) => {
                self.diagnostics.push(unsupported_construct(
                    expr.span,
                    "dict literal",
                    "https://linear.app/hash/issue/H-4603/enable-dict-literal-construct",
                ));

                return None;
            }
            ExprKind::Tuple(_) => {
                self.diagnostics.push(unsupported_construct(
                    expr.span,
                    "tuple literal",
                    "https://linear.app/hash/issue/H-4604/enable-tuple-literal-construct",
                ));

                return None;
            }
            ExprKind::List(_) => {
                self.diagnostics.push(unsupported_construct(
                    expr.span,
                    "list literal",
                    "https://linear.app/hash/issue/H-4605/enable-list-literal-construct",
                ));

                return None;
            }
            ExprKind::Literal(literal) => self.literal_expr(literal),
            ExprKind::Path(path) => self.path(path)?,
            ExprKind::Let(r#let) => self.let_expr(r#let)?,
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
            ExprKind::Use(_) => {
                self.diagnostics.push(unprocessed_expression(
                    expr.span,
                    "use declaration",
                    "import resolution",
                ));
                return None;
            }
            ExprKind::Input(input) => self.input_expr(input)?,
            ExprKind::Closure(closure) => self.closure_expr(closure)?,
            ExprKind::If(_) => {
                self.diagnostics.push(unsupported_construct(
                    expr.span,
                    "if expression",
                    "https://linear.app/hash/issue/H-4606/implement-if-expressions",
                ));
                return None;
            }
            ExprKind::Field(field) => self.field_expr(field)?,
            ExprKind::Index(index) => self.index_expr(index)?,
            ExprKind::As(r#as) => self.as_expr(r#as)?,
            ExprKind::Underscore => {
                self.diagnostics.push(underscore_expression(expr.span));

                return None;
            }
            ExprKind::Dummy => {
                self.diagnostics.push(dummy_expression(expr.span));
                return None;
            }
        };

        Some(self.interner.intern_node(PartialNode {
            span: expr.span,
            kind,
        }))
    }
}

impl<'heap> Node<'heap> {
    pub fn from_ast(
        expr: Expr<'heap>,
        env: &Environment<'heap>,
        interner: &Interner<'heap>,
        types: &ExtractedTypes<'heap>,
    ) -> ReificationStatus<Self> {
        let expr_span = expr.span;
        let mut context = ReificationContext {
            env,
            interner,
            types,
            diagnostics: DiagnosticIssues::new(),
        };

        let node = context.expr(expr);

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
}
