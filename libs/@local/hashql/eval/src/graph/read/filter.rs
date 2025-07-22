use core::fmt::Debug;

use hash_graph_store::filter::{Filter, FilterExpression, Parameter, QueryRecord};
use hashql_hir::node::{
    Node,
    kind::NodeKind,
    r#let::Let,
    operation::{
        BinaryOperation, Operation, OperationKind, TypeOperation,
        binary::BinOpKind,
        r#type::{TypeAssertion, TypeOperationKind},
    },
    variable::{LocalVariable, Variable, VariableKind},
};

use super::{
    CompilationError, FilterCompilerContext, GraphReadCompiler,
    error::qualified_variable_unsupported, path::CompleteQueryPath,
};

impl<'env, 'heap: 'env> GraphReadCompiler<'env, 'heap> {
    #[expect(clippy::too_many_lines, reason = "match statement")]
    pub(super) fn compile_filter<R>(
        &mut self,
        context: FilterCompilerContext<'heap>,
        node: &'heap Node<'heap>,
    ) -> Result<Filter<'heap, R>, CompilationError>
    where
        R: QueryRecord<QueryPath<'heap>: CompleteQueryPath<'heap, PartialQueryPath: Debug>>,
    {
        match node.kind {
            NodeKind::Variable(Variable {
                span: _,
                kind:
                    VariableKind::Local(LocalVariable {
                        span: _,
                        name,
                        arguments: _,
                    }),
            }) => {
                debug_assert_ne!(
                    name.value, context.param_name,
                    "typecheck should have caught this, cannot just return the entity itself."
                );

                let value = self.locals[&name.value];
                self.compile_filter(context, value)
            }
            NodeKind::Variable(Variable {
                span: _,
                kind: VariableKind::Qualified(qualified),
            }) => {
                self.diagnostics
                    .push(qualified_variable_unsupported(context, qualified));

                Err(CompilationError)
            }
            NodeKind::Let(Let {
                span: _,
                name,
                value,
                body,
            }) => {
                self.locals.insert(name.value, value);
                let filter = self.compile_filter(context, body);
                self.locals.remove(&name.value);

                filter
            }

            NodeKind::Operation(Operation {
                span: _,
                kind:
                    OperationKind::Binary(BinaryOperation {
                        span: _,
                        op,
                        left,
                        right,
                    }),
            }) => {
                let func = match op.kind {
                    BinOpKind::And => {
                        let (left, right) = (
                            self.compile_filter(context, left),
                            self.compile_filter(context, right),
                        );

                        return Ok(Filter::All(vec![left?, right?]));
                    }
                    BinOpKind::Or => {
                        let (left, right) = (
                            self.compile_filter(context, left),
                            self.compile_filter(context, right),
                        );

                        return Ok(Filter::Any(vec![left?, right?]));
                    }
                    BinOpKind::Eq => |left, right| Filter::Equal(Some(left), Some(right)),
                    BinOpKind::Ne => |left, right| Filter::NotEqual(Some(left), Some(right)),
                    BinOpKind::Lt => Filter::Less,
                    BinOpKind::Lte => Filter::LessOrEqual,
                    BinOpKind::Gt => Filter::Greater,
                    BinOpKind::Gte => Filter::GreaterOrEqual,
                };

                let (left, right) = (
                    self.compile_filter_expr(context, left)
                        .and_then(|expr| expr.finish(context, &mut self.diagnostics)),
                    self.compile_filter_expr(context, right)
                        .and_then(|expr| expr.finish(context, &mut self.diagnostics)),
                );

                Ok(func(left?, right?))
            }
            // Unary are currently not supported, so we can skip them
            NodeKind::Operation(Operation {
                span: _,
                kind:
                    OperationKind::Type(TypeOperation {
                        span: _,
                        kind:
                            TypeOperationKind::Assertion(TypeAssertion {
                                span: _,
                                value,
                                r#type: _,
                                force: _,
                            }),
                    }),
            }) => self.compile_filter(context, value),
            // If we came to this match arm using these nodes, then that means that the filter
            // must have evaluated to a boolean expression. Therefore we can just check if the
            // expression evaluates to true.
            NodeKind::Operation(Operation {
                span: _,
                kind:
                    OperationKind::Type(TypeOperation {
                        span: _,
                        kind: TypeOperationKind::Constructor(..),
                    }),
            })
            | NodeKind::Input(_)
            | NodeKind::Data(_)
            | NodeKind::Access(_)
            | NodeKind::Call(_)
            | NodeKind::Closure(_)
            | NodeKind::Graph(_) => Ok(Filter::Equal(
                Some(
                    self.compile_filter_expr(context, node)?
                        .finish(context, &mut self.diagnostics)?,
                ),
                Some(FilterExpression::Parameter {
                    parameter: Parameter::Boolean(true),
                    convert: None,
                }),
            )),
        }
    }
}
