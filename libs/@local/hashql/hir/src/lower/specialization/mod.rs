pub mod error;

use core::convert::Infallible;

use hashql_core::{
    collections::{FastHashMap, HashMapExt as _, SmallVec},
    span::Spanned,
    r#type::environment::Environment,
};

use self::error::{
    SpecializationDiagnostic, invalid_graph_chain, non_graph_intrinsic,
    non_intrinsic_graph_operation, unknown_intrinsic, unsupported_intrinsic,
};
use super::error::{LoweringDiagnosticCategory, LoweringDiagnosticIssues};
use crate::{
    context::HirContext,
    fold::{self, Fold, nested::Deep},
    intern::Interner,
    node::{
        HirIdMap, HirPtr, Node, NodeData,
        call::Call,
        graph::{
            Graph,
            read::{GraphRead, GraphReadBody, GraphReadHead, GraphReadTail},
        },
        kind::NodeKind,
        r#let::{Binding, VarIdMap},
        operation::{BinOp, BinaryOperation, Operation},
        variable::Variable,
    },
};

pub struct Specialization<'ctx, 'env, 'hir, 'heap, 'diag> {
    env: &'env Environment<'heap>,
    context: &'ctx mut HirContext<'hir, 'heap>,

    intrinsics: HirIdMap<&'static str>,

    current: HirPtr,
    visited: HirIdMap<Node<'heap>>,
    locals: VarIdMap<Node<'heap>>,
    diagnostics: &'diag mut LoweringDiagnosticIssues,
}

impl<'ctx, 'env, 'hir, 'heap, 'diag> Specialization<'ctx, 'env, 'hir, 'heap, 'diag> {
    pub fn new(
        env: &'env Environment<'heap>,
        context: &'ctx mut HirContext<'hir, 'heap>,
        intrinsics: HirIdMap<&'static str>,
        diagnostics: &'diag mut LoweringDiagnosticIssues,
    ) -> Self {
        Self {
            env,
            context,

            intrinsics,

            current: HirPtr::PLACEHOLDER,
            visited: FastHashMap::default(),
            locals: FastHashMap::default(),
            diagnostics,
        }
    }

    fn push_diagnostic(&mut self, diagnostic: SpecializationDiagnostic) {
        self.diagnostics
            .push(diagnostic.map_category(LoweringDiagnosticCategory::Specialization));
    }

    fn fold_call_into_graph_read(
        &mut self,
        call: Call<'heap>,
        intrinsic: &'static str,
    ) -> Option<GraphRead<'heap>> {
        // The first argument is always the graph we're referring to.
        let tail = match intrinsic {
            "::graph::tail::collect" => GraphReadTail::Collect,
            _ => unreachable!(),
        };

        let mut body = SmallVec::new();

        let mut next = call.arguments[0].value;
        loop {
            // Follow any local variables
            while let NodeKind::Variable(Variable::Local(local)) = next.kind {
                next = self.locals[&local.id.value];
            }

            let NodeKind::Call(call) = next.kind else {
                self.push_diagnostic(invalid_graph_chain(self.env, self.context, next.span, next));

                return None;
            };

            let Some(&intrinsic) = self.intrinsics.get(&call.function.id) else {
                self.push_diagnostic(non_intrinsic_graph_operation(
                    self.env,
                    self.context,
                    call.function.span,
                    call.function,
                ));

                return None;
            };

            match intrinsic {
                "::graph::body::filter" => {
                    let &[follow, closure] = &*call.arguments else {
                        unreachable!()
                    };

                    body.push(GraphReadBody::Filter(closure.value));
                    next = follow.value;
                }
                "::graph::head::entities" => {
                    let head = GraphReadHead::Entity {
                        axis: call.arguments[0].value,
                    };

                    // Reverse the body, as we "climb" the chain up.
                    body.reverse();

                    return Some(GraphRead {
                        head,
                        body: self.context.interner.graph_read_body.intern_slice(&body),
                        tail,
                    });
                }
                _ => {
                    self.push_diagnostic(non_graph_intrinsic(call.function.span, intrinsic));

                    return None;
                }
            }
        }
    }

    fn fold_intrinsic(
        &mut self,
        call: Call<'heap>,
        intrinsic: &'static str,
    ) -> <Self as Fold<'heap>>::Output<Option<Node<'heap>>> {
        #[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
        enum OpKind {
            Bin(BinOp),
        }

        #[expect(clippy::match_same_arms)]
        let op = match intrinsic {
            "::core::math::add" | "::core::math::sub" | "::core::math::mul"
            | "::core::math::div" | "::core::math::rem" | "::core::math::mod"
            | "::core::math::pow" | "::core::math::sqrt" | "::core::math::cbrt"
            | "::core::math::root" => {
                self.push_diagnostic(unsupported_intrinsic(
                    call.function.span,
                    intrinsic,
                    "https://linear.app/hash/issue/H-4728/hashql-enable-math-intrinsics",
                ));

                return Ok(None);
            }
            "::core::bits::and" | "::core::bits::or" | "::core::bits::xor"
            | "::core::bits::not" | "::core::bits::shl" | "::core::bits::shr" => {
                self.push_diagnostic(unsupported_intrinsic(
                    call.function.span,
                    intrinsic,
                    "https://linear.app/hash/issue/H-4730/hashql-enable-bitwise-intrinsics",
                ));

                return Ok(None);
            }
            "::core::cmp::gt" => OpKind::Bin(BinOp::Gt),
            "::core::cmp::lt" => OpKind::Bin(BinOp::Lt),
            "::core::cmp::gte" => OpKind::Bin(BinOp::Gte),
            "::core::cmp::lte" => OpKind::Bin(BinOp::Lte),
            "::core::cmp::eq" => OpKind::Bin(BinOp::Eq),
            "::core::cmp::ne" => OpKind::Bin(BinOp::Ne),
            "::core::bool::not" => {
                self.push_diagnostic(unsupported_intrinsic(
                    call.function.span,
                    intrinsic,
                    "https://linear.app/hash/issue/H-4729/hashql-enable-unary-operations",
                ));

                return Ok(None);
            }
            "::core::bool::and" => OpKind::Bin(BinOp::And),
            "::core::bool::or" => OpKind::Bin(BinOp::Or),
            "::graph::head::entities" | "::graph::body::filter" => {
                // We ignore this on purpose, as `graph::tail::collect` will process these
                return Ok(None);
            }
            "::graph::tmp::decision_time_now" => {
                // currently a stand-in and not specialized in any way
                return Ok(None);
            }
            "::graph::tail::collect" => {
                let Some(read) = self.fold_call_into_graph_read(call, intrinsic) else {
                    return Ok(None);
                };

                let read = fold::walk_graph_read(self, read)?;

                return Ok(Some(self.context.interner.intern_node(NodeData {
                    id: self.current.id,
                    span: self.current.span,
                    kind: NodeKind::Graph(Graph::Read(read)),
                })));
            }
            _ => {
                self.push_diagnostic(unknown_intrinsic(call.function.span, intrinsic));

                return Ok(None);
            }
        };

        let operation = match op {
            OpKind::Bin(value) => {
                let op = Spanned {
                    span: call.function.span,
                    value,
                };

                assert_eq!(
                    call.arguments.len(),
                    2,
                    "Expected 2 arguments for binary operation"
                );

                Operation::Binary(BinaryOperation {
                    op,
                    left: call.arguments[0].value,
                    right: call.arguments[1].value,
                })
            }
        };

        let operation = fold::walk_operation(self, operation)?;

        Ok(Some(self.context.interner.intern_node(NodeData {
            id: self.current.id,
            span: self.current.span,
            kind: NodeKind::Operation(operation),
        })))
    }
}

impl<'heap> Fold<'heap> for Specialization<'_, '_, '_, 'heap, '_> {
    type NestedFilter = Deep;
    type Output<T>
        = Result<T, !>
    where
        T: 'heap;
    type Residual = Result<Infallible, !>;

    fn interner(&self) -> &Interner<'heap> {
        self.context.interner
    }

    fn fold_binding(&mut self, binding: Binding<'heap>) -> Self::Output<Binding<'heap>> {
        let Binding {
            span,
            binder,
            value,
        } = fold::walk_binding(self, binding)?;

        self.locals.insert_unique(binder.id, value);

        Ok(Binding {
            span,
            binder,
            value,
        })
    }

    fn fold_node(&mut self, node: Node<'heap>) -> Self::Output<Node<'heap>> {
        // We do not have a dedupe step for inside the tree, the reason for that is that there's no
        // possibility of the HIR having cycles, therefore deduping can only happen at adjacent
        // nodes.
        let node_id = node.id;
        if let Some(&existing) = self.visited.get(&node_id) {
            return Ok(existing);
        }

        let previous = self.current;
        self.current = node.ptr();

        // We need to check **before** folding the call, if the function is an intrinsic, otherwise
        // the underlying HirId might've been changed
        let intrinsic_node = if let NodeKind::Call(call) = node.kind
            && let Some(intrinsic) = self.intrinsics.get(&call.function.id)
        {
            self.fold_intrinsic(call, intrinsic)?
        } else {
            None
        };

        let node = if let Some(node) = intrinsic_node {
            node
        } else {
            fold::walk_node(self, node)?
        };

        self.visited.insert(node_id, node);

        self.current = previous;

        Ok(node)
    }
}
