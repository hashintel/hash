use alloc::borrow::Cow;
use core::fmt::Debug;

use hash_graph_store::filter::{FilterExpression, QueryRecord};
use hashql_core::{
    literal::LiteralKind,
    span::SpanId,
    value::{self, Opaque, Value},
};
use hashql_hir::node::{
    Node,
    access::{Access, AccessKind, field::FieldAccess, index::IndexAccess},
    call::Call,
    data::{Data, DataKind, dict::DictField},
    graph::GraphKind,
    input::Input,
    kind::NodeKind,
    r#let::Let,
    operation::{
        BinaryOperation, Operation, OperationKind, TypeOperation,
        binary::BinOpKind,
        r#type::{TypeAssertion, TypeConstructor, TypeOperationKind},
    },
    variable::{LocalVariable, Variable, VariableKind},
};

use super::{
    CompilationError, FilterCompilerContext, GraphReadCompiler,
    convert::convert_value_to_parameter,
    error::{
        BranchContext, GraphReadCompilerIssues, branch_unsupported, call_unsupported,
        closure_unsupported, field_access_internal_error, nested_graph_read_unsupported,
        path_conversion_error, path_in_data_construct_unsupported, path_indexing_unsupported,
        path_traversal_internal_error, qualified_variable_unsupported,
        value_parameter_conversion_error,
    },
    path::{CompleteQueryPath, PartialQueryPath, traverse_into_field, traverse_into_index},
};
use crate::graph::read::error::{
    binary_operation_unsupported, index_access_internal_error, type_constructor_unsupported,
};

pub(crate) enum IntermediateExpression<'env, 'heap, P> {
    Value {
        value: Cow<'env, Value<'heap>>,
        span: SpanId,
    },
    Path {
        path: Option<P>,
        span: SpanId,
    },
}

impl<'heap, P> IntermediateExpression<'_, 'heap, P> {
    pub(crate) fn finish<R>(
        self,
        context: FilterCompilerContext<'heap>,
        diagnostics: &mut GraphReadCompilerIssues,
    ) -> Result<FilterExpression<'heap, R>, CompilationError>
    where
        R: QueryRecord<QueryPath<'heap>: CompleteQueryPath<'heap, PartialQueryPath = P>>,
        P: PartialQueryPath<'heap, QueryPath = R::QueryPath<'heap>>,
    {
        match self {
            Self::Value { value, span } => {
                let parameter = match convert_value_to_parameter(&value) {
                    Ok(value) => value,
                    Err(error) => {
                        diagnostics.push(value_parameter_conversion_error(context, span, error));
                        return Err(CompilationError);
                    }
                };

                Ok(FilterExpression::Parameter {
                    parameter,
                    convert: None,
                })
            }
            Self::Path { path: None, span } => {
                diagnostics.push(path_conversion_error(context, span));
                Err(CompilationError)
            }
            Self::Path {
                path: Some(path),
                span,
            } => {
                let Some(path) = path.finish() else {
                    diagnostics.push(path_conversion_error(context, span));
                    return Err(CompilationError);
                };

                Ok(FilterExpression::Path { path })
            }
        }
    }
}

impl<'env, 'heap: 'env> GraphReadCompiler<'env, 'heap> {
    fn compile_filter_expr_data<P>(
        &mut self,
        context: FilterCompilerContext<'heap>,
        Data { span, kind }: &'heap Data<'heap>,
    ) -> Result<IntermediateExpression<'env, 'heap, P>, CompilationError>
    where
        P: PartialQueryPath<'heap> + Debug,
    {
        match kind {
            DataKind::Literal(literal) => Ok(IntermediateExpression::Value {
                value: Cow::Owned(Value::Primitive(literal.kind)),
                span: *span,
            }),
            DataKind::Tuple(tuple) => {
                let mut values = Vec::with_capacity(tuple.fields.len());
                for (index, field) in tuple.fields.iter().enumerate() {
                    let Ok(IntermediateExpression::Value { value, span: _ }) =
                        self.compile_filter_expr::<!>(context.with_current_span(*span), field)
                    else {
                        // `!` ensures that no `IntermediateExpression::Path` will be returned
                        continue;
                    };

                    if values.len() != index {
                        // Previous iteration failed, so pushing (and thereby potentially
                        // re-allocating) is pointless.
                        continue;
                    }

                    values.push(value.into_owned());
                }

                if values.len() != tuple.fields.len() {
                    return Err(CompilationError);
                }

                Ok(IntermediateExpression::Value {
                    value: Cow::Owned(Value::Tuple(value::Tuple::from_values(values))),
                    span: *span,
                })
            }
            DataKind::Struct(r#struct) => {
                let mut fields = Vec::with_capacity(r#struct.fields.len());
                for (index, field) in r#struct.fields.iter().enumerate() {
                    let Ok(IntermediateExpression::Value { value, span: _ }) = self
                        .compile_filter_expr::<!>(context.with_current_span(*span), &field.value)
                    else {
                        // `!` ensures that no `IntermediateExpression::Path` will be returned
                        continue;
                    };

                    if fields.len() != index {
                        // Previous iteration failed, so pushing (and thereby potentially
                        // re-allocating) is pointless.
                        continue;
                    }

                    fields.push((field.name.value, value.into_owned()));
                }

                if fields.len() != r#struct.fields.len() {
                    return Err(CompilationError);
                }

                Ok(IntermediateExpression::Value {
                    value: Cow::Owned(Value::Struct(value::Struct::from_fields(self.heap, fields))),
                    span: *span,
                })
            }
            DataKind::List(list) => {
                let mut values = Vec::with_capacity(list.elements.len());
                for (index, element) in list.elements.iter().enumerate() {
                    let Ok(IntermediateExpression::Value { value, span: _ }) =
                        self.compile_filter_expr::<!>(context.with_current_span(*span), element)
                    else {
                        // `!` ensures that no `IntermediateExpression::Path` will be returned
                        continue;
                    };

                    if values.len() != index {
                        // Previous iteration failed, so pushing (and thereby potentially
                        // re-allocating) is pointless.
                        continue;
                    }

                    values.push(value.into_owned());
                }

                if values.len() != list.elements.len() {
                    return Err(CompilationError);
                }

                Ok(IntermediateExpression::Value {
                    value: Cow::Owned(Value::List(value::List::from_values(values))),
                    span: *span,
                })
            }
            DataKind::Dict(dict) => {
                let mut entries = Vec::with_capacity(dict.fields.len());

                for (index, DictField { key, value }) in dict.fields.iter().enumerate() {
                    let key = self.compile_filter_expr::<!>(context.with_current_span(*span), key);
                    let value =
                        self.compile_filter_expr::<!>(context.with_current_span(*span), value);

                    // We delay destructing here, so that we can gather errors for both keys and
                    // values
                    let (
                        Ok(IntermediateExpression::Value {
                            value: key,
                            span: _,
                        }),
                        Ok(IntermediateExpression::Value { value, span: _ }),
                    ) = (key, value)
                    else {
                        continue;
                    };

                    if entries.len() != index {
                        // Previous iteration failed, so pushing (and thereby potentially
                        // re-allocating) is pointless.
                        continue;
                    }

                    entries.push((key.into_owned(), value.into_owned()));
                }

                if entries.len() != dict.fields.len() {
                    return Err(CompilationError);
                }

                Ok(IntermediateExpression::Value {
                    value: Cow::Owned(Value::Dict(value::Dict::from_entries(entries))),
                    span: *span,
                })
            }
        }
    }

    fn compile_filter_expr_variable<P>(
        &mut self,
        context: FilterCompilerContext<'heap>,
        Variable { span: _, kind }: &'heap Variable<'heap>,
    ) -> Result<IntermediateExpression<'env, 'heap, P>, CompilationError>
    where
        P: PartialQueryPath<'heap> + Debug,
    {
        match kind {
            &VariableKind::Local(LocalVariable {
                span,
                name,
                arguments: _,
            }) if name.value == context.param_name => {
                if P::UNSUPPORTED {
                    self.diagnostics
                        .push(path_in_data_construct_unsupported(span));

                    return Err(CompilationError);
                }

                Ok(IntermediateExpression::Path { path: None, span })
            }
            VariableKind::Local(LocalVariable {
                span,
                name,
                arguments: _,
            }) => {
                let value = self.locals[&name.value];
                self.compile_filter_expr(context.with_current_span(*span), value)
            }
            VariableKind::Qualified(qualified_variable) => {
                self.diagnostics
                    .push(qualified_variable_unsupported(context, qualified_variable));

                Err(CompilationError)
            }
        }
    }

    fn compile_filter_expr_let<P>(
        &mut self,
        context: FilterCompilerContext<'heap>,
        Let {
            span: _,
            name,
            value,
            body,
        }: &'heap Let<'heap>,
    ) -> Result<IntermediateExpression<'env, 'heap, P>, CompilationError>
    where
        P: PartialQueryPath<'heap> + Debug,
    {
        self.locals.insert(name.value, value);
        let result = self.compile_filter_expr(context, body);
        self.locals.remove(&name.value);

        result
    }

    fn compile_filter_expr_input<P>(
        &self,
        Input {
            span,
            name,
            r#type: _,
            default: _,
        }: &'heap Input<'heap>,
    ) -> IntermediateExpression<'env, 'heap, P>
    where
        P: PartialQueryPath<'heap>,
    {
        let value = &self.inputs[&name.value];

        IntermediateExpression::Value {
            value: Cow::Borrowed(value),
            span: *span,
        }
    }

    fn compile_filter_expr_operation_type<P>(
        &mut self,
        context: FilterCompilerContext<'heap>,
        TypeOperation { span: _, kind }: &'heap TypeOperation<'heap>,
    ) -> Result<IntermediateExpression<'env, 'heap, P>, CompilationError>
    where
        P: PartialQueryPath<'heap> + Debug,
    {
        match kind {
            TypeOperationKind::Assertion(TypeAssertion {
                span: _,
                value,
                r#type: _,
                force: _,
            }) => self.compile_filter_expr(context, value),
            &TypeOperationKind::Constructor(TypeConstructor {
                span,
                name: _,
                closure: _,
                arguments: _,
            }) => {
                self.diagnostics
                    .push(type_constructor_unsupported(context, span));

                Err(CompilationError)
            }
        }
    }

    fn compile_filter_expr_operation_binary<P>(
        &mut self,
        context: FilterCompilerContext<'heap>,
        &BinaryOperation {
            span: _,
            op,
            left: _,
            right: _,
        }: &'heap BinaryOperation<'heap>,
    ) -> Result<IntermediateExpression<'env, 'heap, P>, CompilationError>
    where
        P: PartialQueryPath<'heap>,
    {
        match op.kind {
            BinOpKind::And
            | BinOpKind::Or
            | BinOpKind::Eq
            | BinOpKind::Ne
            | BinOpKind::Lt
            | BinOpKind::Lte
            | BinOpKind::Gt
            | BinOpKind::Gte => {
                self.diagnostics
                    .push(binary_operation_unsupported(context, op));

                Err(CompilationError)
            }
        }
    }

    fn compile_filter_expr_operation<P>(
        &mut self,
        context: FilterCompilerContext<'heap>,
        Operation { span: _, kind }: &'heap Operation<'heap>,
    ) -> Result<IntermediateExpression<'env, 'heap, P>, CompilationError>
    where
        P: PartialQueryPath<'heap> + Debug,
    {
        match kind {
            OperationKind::Type(r#type) => self.compile_filter_expr_operation_type(context, r#type),
            OperationKind::Binary(binary) => {
                self.compile_filter_expr_operation_binary(context, binary)
            }
        }
    }

    fn compile_filter_expr_access_field<P>(
        &mut self,
        context: FilterCompilerContext<'heap>,
        FieldAccess {
            span,
            expr: expr_node,
            field,
        }: &'heap FieldAccess<'heap>,
    ) -> Result<IntermediateExpression<'env, 'heap, P>, CompilationError>
    where
        P: PartialQueryPath<'heap> + Debug,
    {
        let expr = self.compile_filter_expr::<P>(context, expr_node)?;

        let output = match expr {
            IntermediateExpression::Value { value, span: _ } => {
                let value = match value {
                    Cow::Borrowed(value) => value.access_by_field(field.value).map(Cow::Borrowed),
                    Cow::Owned(value) => {
                        value.access_by_field(field.value).cloned().map(Cow::Owned)
                    }
                };

                let value = match value {
                    Ok(value) => value,
                    Err(error) => {
                        self.diagnostics.push(field_access_internal_error(
                            expr_node.span,
                            field,
                            &error,
                        ));
                        return Err(CompilationError);
                    }
                };

                IntermediateExpression::Value { value, span: *span }
            }

            IntermediateExpression::Path { path, span: _ } => {
                let path = match traverse_into_field(path, self.heap, field.value) {
                    Ok(path) => path,
                    Err(path) => {
                        if path.is_none() && P::UNSUPPORTED {
                            self.diagnostics
                                .push(path_in_data_construct_unsupported(*span));

                            return Err(CompilationError);
                        }

                        self.diagnostics.push(path_traversal_internal_error(
                            expr_node.span,
                            field.span,
                            path.as_ref(),
                        ));

                        return Err(CompilationError);
                    }
                };

                IntermediateExpression::Path {
                    path: Some(path),
                    span: *span,
                }
            }
        };

        Ok(output)
    }

    fn compile_filter_expr_access_index<P>(
        &mut self,
        context: FilterCompilerContext<'heap>,
        IndexAccess {
            span,
            expr: expr_node,
            index: index_node,
        }: &'heap IndexAccess<'heap>,
    ) -> Result<IntermediateExpression<'env, 'heap, P>, CompilationError>
    where
        P: PartialQueryPath<'heap> + Debug,
    {
        let expr = self.compile_filter_expr::<P>(context, expr_node);
        let index = self.compile_filter_expr::<P>(context, index_node);

        let (expr, index) = (expr?, index?);

        let index = match index {
            IntermediateExpression::Value { value, span: _ } => value,
            IntermediateExpression::Path { path: _, span: _ } => {
                self.diagnostics.push(path_indexing_unsupported(
                    context,
                    expr_node.span,
                    index_node.span,
                ));

                return Err(CompilationError);
            }
        };

        let output = match expr {
            IntermediateExpression::Value { value, span: _ } => {
                let value = match value {
                    Cow::Borrowed(value) => value
                        .access_by_index(&index)
                        .map(|value| value.map(Cow::Borrowed)),
                    Cow::Owned(value) => value
                        .access_by_index(&index)
                        .map(|value| value.cloned().map(Cow::Owned)),
                };

                let value = match value {
                    Ok(value) => value,
                    Err(error) => {
                        self.diagnostics.push(index_access_internal_error(
                            expr_node.span,
                            index_node.span,
                            &error,
                        ));
                        return Err(CompilationError);
                    }
                };

                let value =
                    value.unwrap_or_else(|| Cow::Owned(Value::Primitive(LiteralKind::Null)));

                IntermediateExpression::Value { value, span: *span }
            }
            IntermediateExpression::Path { path, span: _ } => {
                let path = match traverse_into_index(path, self.heap, index) {
                    Ok(path) => path,
                    Err(path) => {
                        if path.is_none() && P::UNSUPPORTED {
                            self.diagnostics
                                .push(path_in_data_construct_unsupported(*span));

                            return Err(CompilationError);
                        }

                        self.diagnostics.push(path_traversal_internal_error(
                            expr_node.span,
                            index_node.span,
                            path.as_ref(),
                        ));

                        return Err(CompilationError);
                    }
                };

                IntermediateExpression::Path {
                    path: Some(path),
                    span: *span,
                }
            }
        };

        Ok(output)
    }

    fn compile_filter_expr_access<P>(
        &mut self,
        context: FilterCompilerContext<'heap>,
        Access { span: _, kind }: &'heap Access<'heap>,
    ) -> Result<IntermediateExpression<'env, 'heap, P>, CompilationError>
    where
        P: PartialQueryPath<'heap> + Debug,
    {
        match kind {
            AccessKind::Field(field) => self.compile_filter_expr_access_field(context, field),
            AccessKind::Index(index) => self.compile_filter_expr_access_index(context, index),
        }
    }

    fn compile_filter_expr_call_ctor(
        &mut self,
        context: FilterCompilerContext<'heap>,
        span: SpanId,
        node: &'heap Node<'heap>,
    ) -> Result<&'heap TypeConstructor<'heap>, CompilationError> {
        match node.kind {
            NodeKind::Operation(Operation {
                span: _,
                kind:
                    OperationKind::Type(TypeOperation {
                        span: _,
                        kind: TypeOperationKind::Constructor(ctor),
                    }),
            }) => Ok(ctor),
            NodeKind::Variable(Variable {
                span: _,
                kind: VariableKind::Local(local),
            }) => self.compile_filter_expr_call_ctor(context, span, self.locals[&local.name.value]),
            NodeKind::Data(_)
            | NodeKind::Variable(_)
            | NodeKind::Let(_)
            | NodeKind::Input(_)
            | NodeKind::Operation(_)
            | NodeKind::Access(_)
            | NodeKind::Call(_)
            | NodeKind::Branch(_)
            | NodeKind::Closure(_)
            | NodeKind::Graph(_) => {
                self.diagnostics.push(call_unsupported(context, span));
                Err(CompilationError)
            }
        }
    }

    // in theory they could be in the narrow context that they take a *single* argument,
    // and that argument happens to be the entity being filtered, because then we can
    // statically analyze them real easy.
    fn compile_filter_expr_call<P>(
        &mut self,
        context: FilterCompilerContext<'heap>,
        Call {
            span,
            function,
            arguments,
        }: &'heap Call<'heap>,
    ) -> Result<IntermediateExpression<'env, 'heap, P>, CompilationError>
    where
        P: PartialQueryPath<'heap> + Debug,
    {
        let ctor = self.compile_filter_expr_call_ctor(context, *span, function)?;

        match &**arguments {
            [] => Ok(IntermediateExpression::Value {
                value: Cow::Owned(Value::Opaque(Opaque::new(
                    ctor.name,
                    Value::Primitive(LiteralKind::Null),
                ))),
                span: *span,
            }),
            [argument] => {
                let argument =
                    self.compile_filter_expr(context.without_current_span(), &argument.value)?;

                match argument {
                    IntermediateExpression::Value { value, span } => {
                        Ok(IntermediateExpression::Value {
                            value: Cow::Owned(Value::Opaque(Opaque::new(
                                ctor.name,
                                value.into_owned(),
                            ))),
                            span,
                        })
                    }
                    // paths simply "pass through"
                    path @ IntermediateExpression::Path { .. } => Ok(path),
                }
            }
            _ => unreachable!(),
        }
    }

    // We can't return a `FilterExpression` instead we require to return our own `Expression` that
    // can then be converted to a `FilterExpression`. That allows us to carry the values using
    // `&'heap` lifetimes.
    pub(super) fn compile_filter_expr<P>(
        &mut self,
        context: FilterCompilerContext<'heap>,
        node: &'heap Node<'heap>,
    ) -> Result<IntermediateExpression<'env, 'heap, P>, CompilationError>
    where
        P: PartialQueryPath<'heap> + Debug,
    {
        match node.kind {
            NodeKind::Data(data) => self.compile_filter_expr_data(context, data),
            NodeKind::Variable(variable) => self.compile_filter_expr_variable(context, variable),
            NodeKind::Let(r#let) => self.compile_filter_expr_let(context, r#let),
            NodeKind::Input(input) => Ok(self.compile_filter_expr_input(input)),
            NodeKind::Operation(operation) => {
                self.compile_filter_expr_operation(context, operation)
            }
            NodeKind::Access(access) => self.compile_filter_expr_access(context, access),
            NodeKind::Call(call) => self.compile_filter_expr_call(context, call),
            NodeKind::Closure(_) => {
                self.diagnostics.push(closure_unsupported(
                    context,
                    context.current_span.unwrap_or(node.span),
                ));
                Err(CompilationError)
            }
            NodeKind::Graph(graph) => match graph.kind {
                GraphKind::Read(_) => {
                    self.diagnostics.push(nested_graph_read_unsupported(
                        context,
                        context.current_span.unwrap_or(node.span),
                    ));
                    Err(CompilationError)
                }
            },
            NodeKind::Branch(branch) => {
                self.diagnostics
                    .push(branch_unsupported(branch, BranchContext::FilterExpression));

                Err(CompilationError)
            }
        }
    }
}
