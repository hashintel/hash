use core::{any::TypeId, convert::Infallible};

use hashql_core::collection::FastHashMap;

use crate::{
    fold::{self, Fold, nested::Deep},
    intern::Interner,
    node::{
        HirId, Node, PartialNode,
        call::Call,
        kind::NodeKind,
        operation::{
            BinaryOperation, Operation, OperationKind,
            binary::{BinOp, BinOpKind},
        },
    },
};

pub struct Specialize<'env, 'heap> {
    visited: FastHashMap<HirId, Node<'heap>>,
    interner: &'env Interner<'heap>,

    types: &'env mut FastHashMap<HirId, TypeId>,
    intrinsics: FastHashMap<HirId, &'static str>,
    // todo: diagnostics
}

impl<'env, 'heap> Specialize<'env, 'heap> {
    fn fold_intrinsic(&mut self, call: Call<'heap>, intrinsic: &'static str) -> Node<'heap> {
        #[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
        enum OpKind {
            Bin(BinOpKind),
        }

        let op = match intrinsic {
            "::core::math::add" => todo!("issue diagnostic unsupported (for now)"),
            "::core::math::sub" => todo!("issue diagnostic unsupported (for now)"),
            "::core::math::mul" => todo!("issue diagnostic unsupported (for now)"),
            "::core::math::div" => todo!("issue diagnostic unsupported (for now)"),
            "::core::math::rem" => todo!("issue diagnostic unsupported (for now)"),
            "::core::math::mod" => todo!("issue diagnostic unsupported (for now)"),
            "::core::math::pow" => todo!("issue diagnostic unsupported (for now)"),
            "::core::math::sqrt" => todo!("issue diagnostic unsupported (for now)"),
            "::core::math::cbrt" => todo!("issue diagnostic unsupported (for now)"),
            "::core::math::root" => todo!("issue diagnostic unsupported (for now)"),
            "::core::bits::and" => todo!("issue diagnostic unsupported (for now)"),
            "::core::bits::or" => todo!("issue diagnostic unsupported (for now)"),
            "::core::bits::xor" => todo!("issue diagnostic unsupported (for now)"),
            "::core::bits::not" => todo!("issue diagnostic unsupported (for now)"),
            "::core::bits::shl" => todo!("issue diagnostic unsupported (for now)"),
            "::core::bits::shr" => todo!("issue diagnostic unsupported (for now)"),
            "::core::cmp::gt" => OpKind::Bin(BinOpKind::Gt),
            "::core::cmp::lt" => OpKind::Bin(BinOpKind::Lt),
            "::core::cmp::gte" => OpKind::Bin(BinOpKind::Gte),
            "::core::cmp::lte" => OpKind::Bin(BinOpKind::Lte),
            "::core::cmp::eq" => OpKind::Bin(BinOpKind::Eq),
            "::core::cmp::ne" => OpKind::Bin(BinOpKind::Ne),
            "::core::bool::not" => todo!("issue diagnostic unsupported (for now)"),
            "::core::bool::and" => OpKind::Bin(BinOpKind::And),
            "::core::bool::or" => OpKind::Bin(BinOpKind::Or),
            _ => todo!("issue diagnostic, unknown intrinsic (compiler bug)"),
        };

        let kind = match op {
            OpKind::Bin(kind) => {
                let op = BinOp {
                    span: call.function.span,
                    kind,
                };

                assert_eq!(
                    call.arguments.len(),
                    2,
                    "Expected 2 arguments for binary operation"
                );

                OperationKind::Binary(BinaryOperation {
                    span: call.span,
                    op,
                    left: call.arguments[0].value,
                    right: call.arguments[1].value,
                })
            }
        };

        let operation = Operation {
            span: call.span,
            kind,
        };

        let Ok(operation) = fold::walk_operation(self, operation);

        self.interner.intern_node(PartialNode {
            span: call.span,
            kind: NodeKind::Operation(operation),
        })
    }
}

impl<'heap> Fold<'heap> for Specialize<'_, 'heap> {
    type NestedFilter = Deep;
    type Output<T>
        = Result<T, !>
    where
        T: 'heap;
    type Residual = Result<Infallible, !>;

    fn interner(&self) -> &Interner<'heap> {
        self.interner
    }

    fn fold_node(&mut self, node: Node<'heap>) -> Self::Output<Node<'heap>> {
        // We do not have a dedupe step for inside the tree, the reason for that is that there's no
        // possibility of the HIR having cycles, therefore deduping can only happen at adjacent
        // nodes.
        let node_id = node.id;
        if let Some(&existing) = self.visited.get(&node_id) {
            return Ok(existing);
        }

        // We need to check **before** folding the call, if the function is an intrinsic, otherwise
        // the underlying HirId might've been changed
        let node = if let NodeKind::Call(call) = node.kind
            && let Some(intrinsic) = self.intrinsics.get(&call.function.id)
        {
            self.fold_intrinsic(*call, intrinsic)
        } else {
            fold::walk_node(self, node)?
        };

        // We might want to consider if we need to guard this behind some sort of check if the node
        // hasn't been visited before (that has been output). Considering that we're already doing a
        // dedupe step it shouldn't be needed, as it's always a unique to unique transformation.
        if node.id != node_id {
            let r#type = self
                .types
                .remove(&node_id)
                .expect("node should only be traversed once");

            self.types
                .insert(node.id, r#type)
                .expect("node id should be unique in types");
        }

        self.visited.insert(node_id, node);

        Ok(node)
    }
}
