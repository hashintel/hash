// convert the HIR into HIR(ANF), HIR(ANF) is a reduced form of the HIR, which differentiates
// between values: (places (variables with projections), constants) and everything else. Function
// application can only be done with values as arguments. We extend this, even though at this point
// we have already specialized the HIR nodes, any node that was previously a function is treated as
// such. We define boundaries, where we accumulate `let` bindings, these are:
// - closure definitions
// - branching (control flow)

// We deviate from the original ANF quite a bit here to allow for more flexibility down the line, in
// particular traditional ANF supports closures as values, which for us makes little sense.
// Closures are just pointers to a BB, so it doesn't make sense to treat them as values. It would
// essentially double our implementation complexity, because we would need to handle closures as
// values and as pointers separately.
// We use projections instead of variables to allow for mutable assignments in the MIR down the
// line and to reduce the number of `let` bindings.
// This removes some easy potential for deduplication, but that is deemed to not really be a concern
// here.

use core::{convert::Infallible, mem};

use hashql_core::span::Spanned;

use crate::{
    context::HirContext,
    fold::{self, Fold, beef::Beef},
    intern::Interner,
    node::{
        Node, PartialNode,
        access::{FieldAccess, IndexAccess},
        branch::If,
        call::{Call, CallArgument},
        closure::Closure,
        data::{Data, DictField, List, StructField, Tuple},
        graph::read::GraphReadHead,
        input::Input,
        kind::NodeKind,
        r#let::{Binder, Binding, Let},
        operation::{BinOp, BinaryOperation, TypeAssertion, UnaryOperation},
        variable::{LocalVariable, Variable},
    },
};

// How do we do this transformation? in theory it should be relatively straightforward, we have two
// operating modes (all handled by the same fold operation).
//
// We ANF normalize *everything* according to the rules of the ANF transformation. After that
// transformation the body may still be a non-atom when an atom is expected -> if that is the case,
// we will need to introduce a new atom.
//
// The question is: can we do this in a way that is more...
// elegant? The problem is the following: we cannot indiscriminately just say: this just needs to be
// an atom at the end, because that means that the value of a let binding couldn't be normalized.
//
// There are two ways to solve this problem:
// 1. Have two fold operations, one for atoms and one for non-atoms
// 2. Have a single fold operation that can handle both atoms and non-atoms, by introducing a new
//    atom when necessary, something like: `ensure_atom`, this *might* introduce additional
//    interning.
//
// Actually it doesn't because either way we need to introduce a new binding, so where we put it
// doesn't matter.
//
// So we would just normally fold, and then ensure that the result is an atom where we need an atom.
// What aren't atoms? control flow expressions, let bindings, closure definitions, call expressions.
//
// An important thing to note is that we need to ensure that we need to call this on the fold node
// level, why? because that is only where we can switch out the node type, which is necessary.
//
// Yea, we can just use the same fold operation!

const fn is_atom(node: &Node<'_>) -> bool {
    match node.kind {
        NodeKind::Data(_) | NodeKind::Variable(Variable::Local(_)) | NodeKind::Access(_) => true,
        // Qualified variables are *not* atoms, because of module thunking in the future
        // see: https://linear.app/hash/issue/BE-67/hashql-implement-modules
        NodeKind::Variable(Variable::Qualified(_))
        | NodeKind::Let(_)
        | NodeKind::Input(_)
        | NodeKind::Operation(_)
        | NodeKind::Call(_)
        | NodeKind::Branch(_)
        | NodeKind::Closure(_)
        | NodeKind::Graph(_) => false,
    }
}

pub struct Normalization<'ctx, 'env, 'heap> {
    context: &'ctx mut HirContext<'env, 'heap>,
    bindings: Vec<Binding<'heap>>,
    trampoline: Option<Node<'heap>>,
    recycler: Vec<Vec<Binding<'heap>>>,
    max_recycle: usize,
}

impl<'ctx, 'env, 'heap> Normalization<'ctx, 'env, 'heap> {
    pub const fn new(context: &'ctx mut HirContext<'env, 'heap>, max_recycle: usize) -> Self {
        Self {
            context,
            bindings: Vec::new(),
            trampoline: None,
            recycler: Vec::new(),
            max_recycle,
        }
    }

    pub fn run(mut self, node: Node<'heap>) -> Node<'heap> {
        // `boundary` uses nested node, but this is fine here, because we use the `Deep` filter
        // anyway, so depth doesn't matter.
        let node = self.boundary(node);

        assert!(
            self.trampoline.is_none(),
            "The trampoline should be None after normalization"
        );

        node
    }

    fn ensure_local_variable(&mut self, node: Node<'heap>) -> Node<'heap> {
        if matches!(node.kind, NodeKind::Variable(Variable::Local(_))) {
            return node;
        }

        let binder_id = self.context.counter.var.next();
        let binding = Binding {
            span: node.span,
            binder: Binder {
                id: binder_id,
                span: node.span,
                name: None,
            },
            value: node,
        };
        self.bindings.push(binding);

        self.context.interner.intern_node(PartialNode {
            span: node.span,
            kind: NodeKind::Variable(Variable::Local(LocalVariable {
                id: Spanned {
                    span: node.span,
                    value: binder_id,
                },
                arguments: self.context.interner.intern_type_ids(&[]),
            })),
        })
    }

    fn ensure_atom(&mut self, node: Node<'heap>) -> Node<'heap> {
        if is_atom(&node) {
            return node;
        }

        self.ensure_local_variable(node)
    }

    fn trampoline(&mut self, node: Node<'heap>) {
        match &mut self.trampoline {
            None => {
                self.trampoline = Some(node);
            }
            Some(_) => {
                panic!("trampoline has been inserted to multiple times");
            }
        }
    }

    fn boundary(&mut self, node: Node<'heap>) -> Node<'heap> {
        // Check if we have a recycled bindings vector that we can reuse, otherwise use a new one
        let bindings = self.recycler.pop().unwrap_or_else(|| {
            // The current amount of bindings is a good indicator for the size of vector we're
            // expecting
            Vec::with_capacity(self.bindings.len())
        });

        // Save the current bindings vector, to be restored once we've exited the boundary
        let outer = mem::replace(&mut self.bindings, bindings);

        let Ok(mut node) = fold::walk_nested_node(self, node);

        // Restore the outer vector and retrieve the collected bindings
        let mut bindings = core::mem::replace(&mut self.bindings, outer);

        if !bindings.is_empty() {
            // We need to wrap the collected bindings into a new let node
            node = self.context.interner.intern_node(PartialNode {
                span: node.span,
                kind: NodeKind::Let(Let {
                    bindings: self.context.interner.bindings.intern_slice(&bindings),
                    body: node,
                }),
            });

            bindings.clear();
        }

        // If we haven't reached the limit, add the vector to the recycler
        if self.recycler.len() < self.max_recycle {
            self.recycler.push(bindings);
        }

        node
    }
}

impl<'heap> Fold<'heap> for Normalization<'_, '_, 'heap> {
    type NestedFilter = fold::nested::Deep;
    type Output<T>
        = Result<T, !>
    where
        T: 'heap;
    type Residual = Result<Infallible, !>;

    fn interner(&self) -> &Interner<'heap> {
        self.context.interner
    }

    fn fold_node(&mut self, node: Node<'heap>) -> Self::Output<Node<'heap>> {
        let backup = self.trampoline.take();

        let Ok(mut node) = fold::walk_node(self, node);

        let trampoline = core::mem::replace(&mut self.trampoline, backup);
        if let Some(trampoline) = trampoline {
            node = trampoline;
        }

        Ok(node)
    }

    fn fold_data(&mut self, data: Data<'heap>) -> Self::Output<Data<'heap>> {
        fold::walk_data(self, data)
    }

    fn fold_struct_field(&mut self, field: StructField<'heap>) -> Self::Output<StructField<'heap>> {
        let Ok(StructField { name, value }) = fold::walk_struct_field(self, field);

        let value = self.ensure_atom(value);

        Ok(StructField { name, value })
    }

    fn fold_tuple(&mut self, Tuple { fields }: Tuple<'heap>) -> Self::Output<Tuple<'heap>> {
        let mut fields = Beef::new(fields);
        let Ok(()) = fields.try_map::<_, Self::Output<()>>(|field| {
            self.fold_nested_node(field)
                .map(|node| self.ensure_atom(node))
        });

        let fields = fields.finish(&self.context.interner.nodes);

        Ok(Tuple { fields })
    }

    fn fold_list(&mut self, List { elements }: List<'heap>) -> Self::Output<List<'heap>> {
        let mut elements = Beef::new(elements);
        let Ok(()) = elements.try_map::<_, Self::Output<()>>(|element| {
            self.fold_nested_node(element)
                .map(|node| self.ensure_atom(node))
        });
        let elements = elements.finish(&self.context.interner.nodes);

        Ok(List { elements })
    }

    fn fold_dict_field(&mut self, field: DictField<'heap>) -> Self::Output<DictField<'heap>> {
        let Ok(DictField { mut key, mut value }) = fold::walk_dict_field(self, field);
        key = self.ensure_atom(key);
        value = self.ensure_atom(value);

        Ok(DictField { key, value })
    }

    fn fold_binding(&mut self, binding: Binding<'heap>) -> Self::Output<Binding<'heap>> {
        // We put the bindings into the current stack *after* they have been evaluated, this makes
        // sure that evaluation order is preserved.
        let Ok(modified) = fold::walk_binding(self, binding);
        self.bindings.push(modified);

        // We return the old binding, so that underlying beef implementation does not double intern
        Ok(binding)
    }

    fn fold_let(&mut self, r#let: Let<'heap>) -> Self::Output<Let<'heap>> {
        let Ok(Let { bindings: _, body }) = fold::walk_let(self, r#let);

        // Replace with the body as we have up-streamed any bindings and therefore is superfluous
        self.trampoline(body);

        // Return the same value, so that the interner does not double intern
        Ok(r#let)
    }

    fn fold_type_assertion(
        &mut self,
        assertion: TypeAssertion<'heap>,
    ) -> Self::Output<TypeAssertion<'heap>> {
        let Ok(TypeAssertion {
            value,
            r#type: _,
            force: _,
        }) = fold::walk_type_assertion(self, assertion);

        // At this point type assertions are superfluous and can be safely removed
        self.trampoline(value);

        // Return the same value, so that the interner does not double intern
        Ok(assertion)
    }

    // A type constructor is just an opaque closure definition and can therefore be skipped

    fn fold_binary_operation(
        &mut self,
        operation: BinaryOperation<'heap>,
    ) -> Self::Output<BinaryOperation<'heap>> {
        if operation.op.value == BinOp::And || operation.op.value == BinOp::Or {
            // These have special properties from the other operations, because they are
            // short-circuiting, and therefore are actually boundaries, given: `A && B`,
            // `B` should only be evaluated if `A` is true `A || B`, `B` should only be
            // evaluated if `A` is false (if they are complex operations)
            //
            // To encode this we can say that `A && B` is equivalent to `if A then B else false`
            // and `A || B` is equivalent to `if A then true else B`
            // Therefore `&&` and `||` are naturally classified as boundaries, but(!) only for the
            // right side, as `A` is always evaluated
            let BinaryOperation { op, left, right } = operation;

            // inlined version of `fold::walk_binary_operation`
            let op = Spanned {
                span: self.fold_span(op.span)?,
                value: op.value,
            };

            // Proceed as normal, as `left` is equivalent to the `test` expression
            let Ok(left) = self.fold_nested_node(left);

            // The right side is a boundary
            let right = self.boundary(right);

            return Ok(BinaryOperation { op, left, right });
        }

        let Ok(BinaryOperation { op, left, right }) = fold::walk_binary_operation(self, operation);

        // Arguments to a function call must be atoms
        Ok(BinaryOperation {
            op,
            left: self.ensure_atom(left),
            right: self.ensure_atom(right),
        })
    }

    fn fold_unary_operation(
        &mut self,
        operation: UnaryOperation<'heap>,
    ) -> Self::Output<UnaryOperation<'heap>> {
        let Ok(UnaryOperation { op, expr }) = fold::walk_unary_operation(self, operation);

        // Arguments to a function call must be atoms
        Ok(UnaryOperation {
            op,
            expr: self.ensure_atom(expr),
        })
    }

    fn fold_input(&mut self, input: Input<'heap>) -> Self::Output<Input<'heap>> {
        let Ok(Input {
            name,
            r#type,
            default,
        }) = fold::walk_input(self, input);

        // Ensure that the default is an atom
        Ok(Input {
            name,
            r#type,
            default: default.map(|default| self.ensure_atom(default)),
        })
    }

    fn fold_field_access(
        &mut self,
        access: FieldAccess<'heap>,
    ) -> Self::Output<FieldAccess<'heap>> {
        let Ok(FieldAccess { expr, field }) = fold::walk_field_access(self, access);
        // To be a valid projection the inner body must be an atom
        Ok(FieldAccess {
            expr: self.ensure_atom(expr),
            field,
        })
    }

    fn fold_index_access(
        &mut self,
        access: IndexAccess<'heap>,
    ) -> Self::Output<IndexAccess<'heap>> {
        let Ok(IndexAccess { expr, index }) = fold::walk_index_access(self, access);

        // To be a valid projection, the inner body must be an atom, and the index must be a local
        // variable
        Ok(IndexAccess {
            expr: self.ensure_atom(expr),
            index: self.ensure_local_variable(index),
        })
    }

    fn fold_call(&mut self, call: Call<'heap>) -> Self::Output<Call<'heap>> {
        let Ok(Call {
            function,
            arguments,
        }) = fold::walk_call(self, call);

        Ok(Call {
            function: self.ensure_atom(function),
            arguments,
        })
    }

    fn fold_call_argument(
        &mut self,
        argument: CallArgument<'heap>,
    ) -> Self::Output<CallArgument<'heap>> {
        let Ok(CallArgument { span, value }) = fold::walk_call_argument(self, argument);

        // call arguments must be atoms
        Ok(CallArgument {
            span,
            value: self.ensure_atom(value),
        })
    }

    fn fold_if(&mut self, If { test, then, r#else }: If<'heap>) -> Self::Output<If<'heap>> {
        // If is a bit more complex, it is considered a "boundary", `test` is evaluated in the outer
        // boundary, whereas `then` and `else` are both their own boundaries.
        let Ok(test) = fold::walk_nested_node(self, test);

        let then = self.boundary(then);
        let r#else = self.boundary(r#else);

        Ok(If { test, then, r#else })
    }

    fn fold_closure(
        &mut self,
        Closure { signature, body }: Closure<'heap>,
    ) -> Self::Output<Closure<'heap>> {
        let Ok(signature) = self.fold_closure_signature(signature);

        // The `body` is natural boundary
        let body = self.boundary(body);

        Ok(Closure { signature, body })
    }

    // Graph operations are already normalized and handled by the other fold operations
    // We do *not* ensure atoms on the `GraphRead` body (or tail) as these closures are handled
    // separately in the MIR step.
    fn fold_graph_read_head(
        &mut self,
        head: GraphReadHead<'heap>,
    ) -> Self::Output<GraphReadHead<'heap>> {
        let Ok(head) = fold::walk_graph_read_head(self, head);

        Ok(match head {
            GraphReadHead::Entity { axis } => GraphReadHead::Entity {
                // Ensure that the axis is evaluated *before* the pipeline is initiated
                axis: self.ensure_atom(axis),
            },
        })
    }
}
