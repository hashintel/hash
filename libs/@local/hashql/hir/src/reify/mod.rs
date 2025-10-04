pub mod error;

use core::mem;

use hashql_ast::{
    lowering::ExtractedTypes,
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
    collection::{FastHashMap, HashMapExt as _, SmallVec},
    heap,
    id::Id as _,
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
        Node, PartialNode,
        access::{Access, AccessKind, field::FieldAccess, index::IndexAccess},
        branch::{Branch, BranchKind, r#if::If},
        call::{Call, CallArgument},
        closure::{Closure, ClosureParam, ClosureSignature},
        data::{
            Data, DataKind, Dict, List, Literal, Struct, Tuple, dict::DictField,
            r#struct::StructField,
        },
        input::Input,
        kind::NodeKind,
        r#let::{Binder, Let, VarId},
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
struct ReificationContext<'ctx, 'env, 'heap> {
    context: &'ctx mut HirContext<'env, 'heap>,
    types: &'env ExtractedTypes<'heap>,
    diagnostics: ReificationDiagnosticIssues,
    binder_scope: FastHashMap<Symbol<'heap>, VarId>,

    scratch_ident: Vec<Ident<'heap>>,
}

impl<'heap> ReificationContext<'_, '_, 'heap> {
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
                    value: self
                        .context
                        .interner
                        .intern_node(PartialNode { span, kind }),
                    r#type: self.types.anonymous[r#type.id],
                    force: false,
                }),
            }),
        })
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
            let Some(field) = self.expr(*element.value) else {
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

        let kind = NodeKind::Data(Data {
            span,
            kind: DataKind::Tuple(Tuple {
                span,
                fields: self.context.interner.intern_nodes(&fields),
            }),
        });

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
            let Some(element) = self.expr(*element.value) else {
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

        let kind = NodeKind::Data(Data {
            span,
            kind: DataKind::List(List {
                span,
                elements: self.context.interner.intern_nodes(&elements),
            }),
        });

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
            let Some(value) = self.expr(*entry.value) else {
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

        let kind = NodeKind::Data(Data {
            span,
            kind: DataKind::Struct(Struct {
                span,
                fields: self.context.interner.intern_struct_fields(&mut fields),
            }),
        });

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
            let key = self.expr(*key);
            let value = self.expr(*value);

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

        let kind = NodeKind::Data(Data {
            span,
            kind: DataKind::Dict(Dict {
                span,
                fields: self.context.interner.intern_dict_fields(&fields),
            }),
        });

        Some(self.wrap_type_assertion(span, kind, r#type))
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
            Some(self.context.interner.intern_type_ids(&types))
        }
    }

    fn path(&mut self, path: Path<'heap>) -> Option<NodeKind<'heap>> {
        let span = path.span;
        let kind = match path.into_generic_ident() {
            Ok((ident, args)) => {
                // undeclared variables should have been resolved in the AST (import resolution)
                let binder = self.binder_scope[&ident.value];

                VariableKind::Local(LocalVariable {
                    span,
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
                    self.context.heap.vec(Some(0)), // capacity of 0 does not allocate
                );

                let mut segments = SmallVec::with_capacity(path.segments.len());
                for segment in path.segments {
                    segments.push(segment.name);
                }

                VariableKind::Qualified(QualifiedVariable {
                    span,
                    path: QualifiedPath::new_unchecked(
                        self.context.interner.intern_idents(&segments),
                    ),
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
        let binder = Binder {
            id: self.context.counter.var,
            name: Some(name),
        };
        self.context.counter.var.increment_by(1);

        // The name manager guarantees that the name is unique within the program
        self.binder_scope.insert_unique(name.value, binder.id);
        self.context.symbols.binder.insert(binder.id, name.value);

        let value = self.expr(*value);
        let body = self.expr(*body);

        self.binder_scope.remove(&name.value);

        let (value, body) = Option::zip(value, body)?;

        let kind = NodeKind::Let(Let {
            span,
            name: binder,
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

    fn closure_expr(
        &mut self,
        ClosureExpr {
            id: _,
            span,
            signature,
            body,
        }: ClosureExpr<'heap>,
    ) -> Option<NodeKind<'heap>> {
        let signature_def = self.types.signatures[signature.id];

        let mut params = SmallVec::with_capacity(signature.inputs.len());
        for &hashql_ast::node::expr::closure::ClosureParam {
            id: _,
            span,
            name,
            bound: _,
        } in &signature.inputs
        {
            let id = self.context.counter.var;
            self.binder_scope.insert_unique(name.value, id);
            self.context.symbols.binder.insert(id, name.value);

            params.push(ClosureParam {
                span,
                name: Binder {
                    id,
                    name: Some(name),
                },
            });

            self.context.counter.var.increment_by(1);
        }

        let body = self.expr(*body)?;

        for param in &signature.inputs {
            self.binder_scope.remove(&param.name.value);
        }

        Some(NodeKind::Closure(Closure {
            span,
            signature: ClosureSignature {
                span: signature.span,
                def: signature_def,
                params: self.context.interner.intern_closure_params(&params),
            },
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

    fn make_qualified_path(&mut self, span: SpanId, path: &[Symbol<'heap>]) -> Node<'heap> {
        self.scratch_ident.clear();
        self.scratch_ident.extend(path.iter().map(|&value| Ident {
            span,
            value,
            kind: IdentKind::Lexical,
        }));

        let partial = PartialNode {
            span,
            kind: NodeKind::Variable(Variable {
                span,
                kind: VariableKind::Qualified(QualifiedVariable {
                    span,
                    path: QualifiedPath::new_unchecked(
                        self.context.interner.intern_idents(&self.scratch_ident),
                    ),
                    arguments: self.context.interner.intern_type_ids(&[]),
                }),
            }),
        };

        self.context.interner.intern_node(partial)
    }

    fn if_expr_if_else(
        &mut self,
        span: SpanId,
        test: Expr<'heap>,
        then: Expr<'heap>,
        r#else: Expr<'heap>,
    ) -> Option<NodeKind<'heap>> {
        let test = self.expr(test);
        let then = self.expr(then);
        let r#else = self.expr(r#else);

        Some(NodeKind::Branch(Branch {
            span,
            kind: BranchKind::If(If {
                span,
                test: test?,
                then: then?,
                r#else: r#else?,
            }),
        }))
    }

    fn if_expr_then_some(&mut self, node: Node<'heap>) -> Node<'heap> {
        let some = self.make_qualified_path(
            node.span,
            &[sym::lexical::core, sym::lexical::option, sym::lexical::Some],
        );

        let partial = PartialNode {
            span: node.span,
            kind: NodeKind::Call(Call {
                span: node.span,
                function: some,
                arguments: self.context.interner.intern_call_arguments(&[CallArgument {
                    span: node.span,
                    value: node,
                }]),
            }),
        };

        self.context.interner.intern_node(partial)
    }

    fn if_expr_else_none(&mut self, span: SpanId) -> Node<'heap> {
        let none = self.make_qualified_path(
            span,
            &[sym::lexical::core, sym::lexical::option, sym::lexical::None],
        );

        let partial = PartialNode {
            span,
            kind: NodeKind::Call(Call {
                span,
                function: none,
                arguments: self.context.interner.intern_call_arguments(&[]),
            }),
        };

        self.context.interner.intern_node(partial)
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
            return self.if_expr_if_else(span, *test, *then, *r#else);
        }

        // `r#else` is `None`, so we desugar to `Option<T>`
        let (test, then) = Option::zip(self.expr(*test), self.expr(*then))?;

        // Then must be wrapped in an `Option` call
        Some(NodeKind::Branch(Branch {
            span,
            kind: BranchKind::If(If {
                span,
                test,
                then: self.if_expr_then_some(then),
                r#else: self.if_expr_else_none(span),
            }),
        }))
    }

    fn expr(&mut self, expr: Expr<'heap>) -> Option<Node<'heap>> {
        let kind = match expr.kind {
            ExprKind::Call(call) => self.call_expr(call)?,
            ExprKind::Struct(r#struct) => self.struct_expr(r#struct)?,
            ExprKind::Dict(dict) => self.dict_expr(dict)?,
            ExprKind::Tuple(tuple) => self.tuple_expr(tuple)?,
            ExprKind::List(list) => self.list_expr(list)?,
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
            ExprKind::If(r#if) => self.if_expr(r#if)?,
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

        Some(self.context.interner.intern_node(PartialNode {
            span: expr.span,
            kind,
        }))
    }
}

impl<'heap> Node<'heap> {
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
    pub fn from_ast<'env>(
        expr: Expr<'heap>,
        context: &mut HirContext<'env, 'heap>,
        types: &'env ExtractedTypes<'heap>,
    ) -> ReificationStatus<Self> {
        // pre-populate the binder_scope and symbol table with types, as ctor might reference them
        // once `ConvertTypeConstructor` is run, these variables are no longer referenced inside the
        // tree
        let mut binder_scope = FastHashMap::default();
        for local in types.locals.iter() {
            let id = context.counter.var;
            binder_scope.insert_unique(local.name, id);
            context.symbols.binder.insert(id, local.name);
            context.counter.var.increment_by(1);
        }

        let expr_span = expr.span;
        let mut context = ReificationContext {
            context,
            types,
            diagnostics: DiagnosticIssues::new(),
            binder_scope,

            // we're likely to only ever create qualified paths of length 3 or less
            scratch_ident: Vec::with_capacity(3),
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
