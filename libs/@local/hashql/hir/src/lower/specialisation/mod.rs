pub mod error;

use core::{convert::Infallible, mem};

use hashql_core::{collection::FastHashMap, r#type::TypeId};

use self::error::{SpecialisationDiagnostic, unknown_intrinsic, unsupported_intrinsic};
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

pub struct Specialisation<'env, 'heap> {
    interner: &'env Interner<'heap>,

    types: &'env mut FastHashMap<HirId, TypeId>,
    intrinsics: FastHashMap<HirId, &'static str>,

    nested: bool,
    visited: FastHashMap<HirId, Node<'heap>>,
    diagnostics: Vec<SpecialisationDiagnostic>,
}

impl<'env, 'heap> Specialisation<'env, 'heap> {
    pub fn new(
        interner: &'env Interner<'heap>,
        types: &'env mut FastHashMap<HirId, TypeId>,
        intrinsics: FastHashMap<HirId, &'static str>,
    ) -> Self {
        Self {
            interner,

            types,
            intrinsics,

            nested: false,
            visited: FastHashMap::default(),
            diagnostics: Vec::new(),
        }
    }

    fn fold_intrinsic(
        &mut self,
        call: Call<'heap>,
        intrinsic: &'static str,
    ) -> <Self as Fold<'heap>>::Output<Option<Node<'heap>>> {
        #[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
        enum OpKind {
            Bin(BinOpKind),
        }

        let op = match intrinsic {
            "::core::math::add" | "::core::math::sub" | "::core::math::mul"
            | "::core::math::div" | "::core::math::rem" | "::core::math::mod"
            | "::core::math::pow" | "::core::math::sqrt" | "::core::math::cbrt"
            | "::core::math::root" => {
                self.diagnostics.push(unsupported_intrinsic(
                    call.function.span,
                    intrinsic,
                    "https://linear.app/hash/issue/H-4728/hashql-enable-math-intrinsics",
                ));

                return Ok(None);
            }
            "::core::bits::and" | "::core::bits::or" | "::core::bits::xor"
            | "::core::bits::not" | "::core::bits::shl" | "::core::bits::shr" => {
                self.diagnostics.push(unsupported_intrinsic(
                    call.function.span,
                    intrinsic,
                    "https://linear.app/hash/issue/H-4730/hashql-enable-bitwise-intrinsics",
                ));

                return Ok(None);
            }
            "::core::cmp::gt" => OpKind::Bin(BinOpKind::Gt),
            "::core::cmp::lt" => OpKind::Bin(BinOpKind::Lt),
            "::core::cmp::gte" => OpKind::Bin(BinOpKind::Gte),
            "::core::cmp::lte" => OpKind::Bin(BinOpKind::Lte),
            "::core::cmp::eq" => OpKind::Bin(BinOpKind::Eq),
            "::core::cmp::ne" => OpKind::Bin(BinOpKind::Ne),
            "::core::bool::not" => {
                self.diagnostics.push(unsupported_intrinsic(
                    call.function.span,
                    intrinsic,
                    "https://linear.app/hash/issue/H-4729/hashql-enable-unary-operations",
                ));

                return Ok(None);
            }
            "::core::bool::and" => OpKind::Bin(BinOpKind::And),
            "::core::bool::or" => OpKind::Bin(BinOpKind::Or),
            _ => {
                self.diagnostics
                    .push(unknown_intrinsic(call.function.span, intrinsic));

                return Ok(None);
            }
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

        let operation = fold::walk_operation(self, operation)?;

        Ok(Some(self.interner.intern_node(PartialNode {
            span: call.span,
            kind: NodeKind::Operation(operation),
        })))
    }
}

impl<'heap> Fold<'heap> for Specialisation<'_, 'heap> {
    type NestedFilter = Deep;
    type Output<T>
        = Result<T, Vec<SpecialisationDiagnostic>>
    where
        T: 'heap;
    type Residual = Result<Infallible, Vec<SpecialisationDiagnostic>>;

    fn interner(&self) -> &Interner<'heap> {
        self.interner
    }

    fn fold_nested_node(&mut self, node: Node<'heap>) -> Self::Output<Node<'heap>> {
        let previous = self.nested;
        self.nested = true;

        let result = fold::walk_nested_node(self, node);

        self.nested = previous;

        result
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
        let intrinsic_node = if let NodeKind::Call(call) = node.kind
            && let Some(intrinsic) = self.intrinsics.get(&call.function.id)
        {
            self.fold_intrinsic(*call, intrinsic)?
        } else {
            None
        };

        let node = if let Some(node) = intrinsic_node {
            node
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

        if !self.nested && !self.diagnostics.is_empty() {
            let diagnostics = mem::take(&mut self.diagnostics);

            return Err(diagnostics);
        }

        Ok(node)
    }
}
