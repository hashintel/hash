use alloc::borrow::Cow;
use core::fmt::Debug;

use hash_graph_store::filter::{FilterExpression, QueryRecord};
use hashql_core::{
    span::SpanId,
    value::{self, Opaque, Primitive, Value},
};
use hashql_hir::node::{
    Node,
    access::{Access, FieldAccess, IndexAccess},
    call::{Call, PointerKind},
    data::{Data, DictField},
    graph::Graph,
    input::Input,
    kind::NodeKind,
    r#let::{Binding, Let},
    operation::{BinOp, BinaryOperation, Operation, TypeAssertion, TypeConstructor, TypeOperation},
    thunk::Thunk,
    variable::{LocalVariable, Variable},
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
        context: FilterCompilerContext,
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
        context: FilterCompilerContext,
        span: SpanId,
        data: &'heap Data<'heap>,
    ) -> Result<IntermediateExpression<'env, 'heap, P>, CompilationError>
    where
        P: PartialQueryPath<'heap> + Debug,
    {
        match data {
            Data::Primitive(literal) => Ok(IntermediateExpression::Value {
                value: Cow::Owned(Value::Primitive(*literal)),
                span,
            }),
            Data::Tuple(tuple) => {
                let mut values = Vec::with_capacity(tuple.fields.len());
                for (index, field) in tuple.fields.iter().enumerate() {
                    let Ok(IntermediateExpression::Value { value, span: _ }) =
                        self.compile_filter_expr::<!>(context.with_current_span(span), field)
                    else {
                        // `!` ensures that no `IntermediateExpression::Path` will be returned
                        continue;
                    };

                    if values.len() != index {
                        // Previous iteration failed, so pushing (and thereby potentially
                        // reallocating) is pointless.
                        continue;
                    }

                    values.push(value.into_owned());
                }

                if values.len() != tuple.fields.len() {
                    return Err(CompilationError);
                }

                Ok(IntermediateExpression::Value {
                    value: Cow::Owned(Value::Tuple(value::Tuple::from_values(values))),
                    span,
                })
            }
            Data::Struct(r#struct) => {
                let mut fields = Vec::with_capacity(r#struct.fields.len());
                for (index, field) in r#struct.fields.iter().enumerate() {
                    let Ok(IntermediateExpression::Value { value, span: _ }) = self
                        .compile_filter_expr::<!>(context.with_current_span(span), &field.value)
                    else {
                        // `!` ensures that no `IntermediateExpression::Path` will be returned
                        continue;
                    };

                    if fields.len() != index {
                        // Previous iteration failed, so pushing (and thereby potentially
                        // reallocating) is pointless.
                        continue;
                    }

                    fields.push((field.name.value, value.into_owned()));
                }

                if fields.len() != r#struct.fields.len() {
                    return Err(CompilationError);
                }

                Ok(IntermediateExpression::Value {
                    value: Cow::Owned(Value::Struct(value::Struct::from_fields(self.heap, fields))),
                    span,
                })
            }
            Data::List(list) => {
                let mut values = Vec::with_capacity(list.elements.len());
                for (index, element) in list.elements.iter().enumerate() {
                    let Ok(IntermediateExpression::Value { value, span: _ }) =
                        self.compile_filter_expr::<!>(context.with_current_span(span), element)
                    else {
                        // `!` ensures that no `IntermediateExpression::Path` will be returned
                        continue;
                    };

                    if values.len() != index {
                        // Previous iteration failed, so pushing (and thereby potentially
                        // reallocating) is pointless.
                        continue;
                    }

                    values.push(value.into_owned());
                }

                if values.len() != list.elements.len() {
                    return Err(CompilationError);
                }

                Ok(IntermediateExpression::Value {
                    value: Cow::Owned(Value::List(value::List::from_values(values))),
                    span,
                })
            }
            Data::Dict(dict) => {
                let mut entries = Vec::with_capacity(dict.fields.len());

                for (index, DictField { key, value }) in dict.fields.iter().enumerate() {
                    let key = self.compile_filter_expr::<!>(context.with_current_span(span), key);
                    let value =
                        self.compile_filter_expr::<!>(context.with_current_span(span), value);

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
                        // reallocating) is pointless.
                        continue;
                    }

                    entries.push((key.into_owned(), value.into_owned()));
                }

                if entries.len() != dict.fields.len() {
                    return Err(CompilationError);
                }

                Ok(IntermediateExpression::Value {
                    value: Cow::Owned(Value::Dict(value::Dict::from_entries(entries))),
                    span,
                })
            }
        }
    }

    fn compile_filter_expr_variable<P>(
        &mut self,
        context: FilterCompilerContext,
        span: SpanId,
        variable: &'heap Variable<'heap>,
    ) -> Result<IntermediateExpression<'env, 'heap, P>, CompilationError>
    where
        P: PartialQueryPath<'heap> + Debug,
    {
        match variable {
            &Variable::Local(LocalVariable { id, arguments: _ })
                if id.value == context.param_id =>
            {
                if P::UNSUPPORTED {
                    self.diagnostics
                        .push(path_in_data_construct_unsupported(span));

                    return Err(CompilationError);
                }

                Ok(IntermediateExpression::Path { path: None, span })
            }
            Variable::Local(LocalVariable { id, arguments: _ }) => {
                let value = self.locals[&id.value];
                self.compile_filter_expr(context.with_current_span(span), value)
            }
            Variable::Qualified(qualified_variable) => {
                self.diagnostics.push(qualified_variable_unsupported(
                    context,
                    qualified_variable,
                    span,
                ));

                Err(CompilationError)
            }
        }
    }

    fn compile_filter_expr_let<P>(
        &mut self,
        context: FilterCompilerContext,
        Let { bindings, body }: &'heap Let<'heap>,
    ) -> Result<IntermediateExpression<'env, 'heap, P>, CompilationError>
    where
        P: PartialQueryPath<'heap> + Debug,
    {
        for Binding {
            span: _,
            binder,
            value,
        } in bindings
        {
            self.locals.insert(binder.id, value);
        }

        let result = self.compile_filter_expr(context, body);

        for Binding {
            span: _,
            binder,
            value: _,
        } in bindings
        {
            self.locals.remove(&binder.id);
        }

        result
    }

    fn compile_filter_expr_input<P>(
        &self,
        span: SpanId,
        Input {
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
            span,
        }
    }

    fn compile_filter_expr_operation_type<P>(
        &mut self,
        context: FilterCompilerContext,
        span: SpanId,
        operation: &'heap TypeOperation<'heap>,
    ) -> Result<IntermediateExpression<'env, 'heap, P>, CompilationError>
    where
        P: PartialQueryPath<'heap> + Debug,
    {
        match operation {
            TypeOperation::Assertion(TypeAssertion {
                value,
                r#type: _,
                force: _,
            }) => self.compile_filter_expr(context, value),
            &TypeOperation::Constructor(TypeConstructor {
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
        context: FilterCompilerContext,
        &BinaryOperation {
            op,
            left: _,
            right: _,
        }: &'heap BinaryOperation<'heap>,
    ) -> Result<IntermediateExpression<'env, 'heap, P>, CompilationError>
    where
        P: PartialQueryPath<'heap>,
    {
        match op.value {
            BinOp::And
            | BinOp::Or
            | BinOp::Eq
            | BinOp::Ne
            | BinOp::Lt
            | BinOp::Lte
            | BinOp::Gt
            | BinOp::Gte => {
                self.diagnostics
                    .push(binary_operation_unsupported(context, op));

                Err(CompilationError)
            }
        }
    }

    fn compile_filter_expr_operation<P>(
        &mut self,
        context: FilterCompilerContext,
        span: SpanId,
        operation: &'heap Operation<'heap>,
    ) -> Result<IntermediateExpression<'env, 'heap, P>, CompilationError>
    where
        P: PartialQueryPath<'heap> + Debug,
    {
        match operation {
            Operation::Type(r#type) => {
                self.compile_filter_expr_operation_type(context, span, r#type)
            }
            Operation::Binary(binary) => self.compile_filter_expr_operation_binary(context, binary),
        }
    }

    fn compile_filter_expr_access_field<P>(
        &mut self,
        context: FilterCompilerContext,
        span: SpanId,
        FieldAccess {
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

                IntermediateExpression::Value { value, span }
            }

            IntermediateExpression::Path { path, span: _ } => {
                let path = match traverse_into_field(path, self.heap, field.value) {
                    Ok(path) => path,
                    Err(path) => {
                        if path.is_none() && P::UNSUPPORTED {
                            self.diagnostics
                                .push(path_in_data_construct_unsupported(span));

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
                    span,
                }
            }
        };

        Ok(output)
    }

    fn compile_filter_expr_access_index<P>(
        &mut self,
        context: FilterCompilerContext,
        span: SpanId,
        IndexAccess {
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

                let value = value.unwrap_or_else(|| Cow::Owned(Value::Primitive(Primitive::Null)));

                IntermediateExpression::Value { value, span }
            }
            IntermediateExpression::Path { path, span: _ } => {
                let path = match traverse_into_index(path, self.heap, index) {
                    Ok(path) => path,
                    Err(path) => {
                        if path.is_none() && P::UNSUPPORTED {
                            self.diagnostics
                                .push(path_in_data_construct_unsupported(span));

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
                    span,
                }
            }
        };

        Ok(output)
    }

    fn compile_filter_expr_access<P>(
        &mut self,
        context: FilterCompilerContext,
        span: SpanId,
        access: &'heap Access<'heap>,
    ) -> Result<IntermediateExpression<'env, 'heap, P>, CompilationError>
    where
        P: PartialQueryPath<'heap> + Debug,
    {
        match access {
            Access::Field(field) => self.compile_filter_expr_access_field(context, span, field),
            Access::Index(index) => self.compile_filter_expr_access_index(context, span, index),
        }
    }

    fn compile_filter_expr_call_ctor(
        &mut self,
        context: FilterCompilerContext,
        span: SpanId,
        node: &'heap Node<'heap>,
    ) -> Result<&'heap TypeConstructor<'heap>, CompilationError> {
        match node.kind {
            NodeKind::Operation(Operation::Type(TypeOperation::Constructor(ctor))) => Ok(ctor),
            NodeKind::Variable(Variable::Local(local)) => {
                self.compile_filter_expr_call_ctor(context, span, self.locals[&local.id.value])
            }
            NodeKind::Data(_)
            | NodeKind::Variable(_)
            | NodeKind::Let(_)
            | NodeKind::Input(_)
            | NodeKind::Operation(_)
            | NodeKind::Access(_)
            | NodeKind::Call(_)
            | NodeKind::Branch(_)
            | NodeKind::Closure(_)
            | NodeKind::Thunk(_)
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
        context: FilterCompilerContext,
        span: SpanId,
        Call {
            kind,
            function,
            arguments,
        }: &'heap Call<'heap>,
    ) -> Result<IntermediateExpression<'env, 'heap, P>, CompilationError>
    where
        P: PartialQueryPath<'heap> + Debug,
    {
        if *kind == PointerKind::Thin
            && let NodeKind::Variable(Variable::Local(local)) = function.kind
        {
            // Thin pointer to a local variable = calling a thunk
            let node = self.locals[&local.id.value];
            return self.compile_filter_expr(context, node);
        }

        let ctor = self.compile_filter_expr_call_ctor(context, span, function)?;

        match &**arguments {
            [] => Ok(IntermediateExpression::Value {
                value: Cow::Owned(Value::Opaque(Opaque::new(
                    ctor.name,
                    Value::Primitive(Primitive::Null),
                ))),
                span,
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
        context: FilterCompilerContext,
        node: &'heap Node<'heap>,
    ) -> Result<IntermediateExpression<'env, 'heap, P>, CompilationError>
    where
        P: PartialQueryPath<'heap> + Debug,
    {
        match node.kind {
            NodeKind::Data(data) => self.compile_filter_expr_data(context, node.span, data),
            NodeKind::Variable(variable) => {
                self.compile_filter_expr_variable(context, node.span, variable)
            }
            NodeKind::Let(r#let) => self.compile_filter_expr_let(context, r#let),
            NodeKind::Input(input) => Ok(self.compile_filter_expr_input(node.span, input)),
            NodeKind::Operation(operation) => {
                self.compile_filter_expr_operation(context, node.span, operation)
            }
            NodeKind::Access(access) => self.compile_filter_expr_access(context, node.span, access),
            NodeKind::Call(call) => self.compile_filter_expr_call(context, node.span, call),
            NodeKind::Closure(_) => {
                self.diagnostics.push(closure_unsupported(
                    context,
                    context.current_span.unwrap_or(node.span),
                ));
                Err(CompilationError)
            }
            NodeKind::Thunk(Thunk { body }) => self.compile_filter_expr(context, body),
            NodeKind::Graph(graph) => match graph {
                Graph::Read(_) => {
                    self.diagnostics.push(nested_graph_read_unsupported(
                        context,
                        context.current_span.unwrap_or(node.span),
                    ));
                    Err(CompilationError)
                }
            },
            NodeKind::Branch(branch) => {
                self.diagnostics.push(branch_unsupported(
                    branch,
                    node.span,
                    BranchContext::FilterExpression,
                ));

                Err(CompilationError)
            }
        }
    }
}
