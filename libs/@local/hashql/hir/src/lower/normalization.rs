//! HIR to HIR(ANF) normalization transformation.
//!
//! This module implements the conversion from HIR (High-level Intermediate Representation) to
//! HIR(ANF) (Administrative Normal Form), a reduced form of the HIR that differentiates between
//! values and computations for optimization and code generation purposes.
//!
//! # Administrative Normal Form (ANF)
//!
//! ANF is a program representation where:
//! - **Values** are atomic expressions: places (variables with projections) and constants
//! - **Computations** are everything else that requires evaluation
//! - Function applications can only be performed with values as arguments
//!
//! # Design Decisions
//!
//! This implementation deviates from traditional ANF in several ways:
//!
//! ## Closure Handling
//!
//! Traditional ANF supports closures as values, but this would double our implementation
//! complexity. Since closures are essentially pointers to basic blocks, we handle them
//! as control flow constructs rather than values.
//!
//! ## Projection-Based Variables
//!
//! We use projections instead of simple variables to:
//! - Enable mutable assignments in the MIR lowering phase
//! - Reduce the number of `let` bindings required
//! - Provide better optimization opportunities
//!
//! This trades some deduplication opportunities for simpler implementation and better
//! downstream optimization potential.
//!
//! # Boundaries
//!
//! We define boundaries where `let` bindings are accumulated:
//! - Closure definitions
//! - Branching constructs (control flow)
//! - Short-circuiting operations (`&&`, `||`)
//!
//! # Examples
//!
//! ```text
//! // Before normalization:
//! foo(bar(x), baz(y))
//!
//! // After normalization:
//! let %1 = bar(x);
//! let %2 = baz(y);
//! foo(%1, %2)
//! ```

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

/// Determines if a node is an atom (atomic value).
///
/// Atoms are the fundamental values in ANF that can be used directly without
/// requiring further evaluation. This includes:
/// - Data literals and constants
/// - Local variable references
/// - Access expressions (field/index access)
///
/// Non-atoms include control flow, operations, calls, and qualified variables
/// (which require module thunking in the future).
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

/// Determines if a node is a projection (place expression).
///
/// Projections are memory locations that can be read from or written to.
/// They include:
/// - Local variable references
/// - Access expressions (field/index access on other projections)
///
/// Projections are a subset of atoms that represent addressable locations.
const fn is_projection(node: &Node<'_>) -> bool {
    match node.kind {
        NodeKind::Variable(Variable::Local(_)) | NodeKind::Access(_) => true,
        NodeKind::Data(_)
        | NodeKind::Variable(Variable::Qualified(_))
        | NodeKind::Let(_)
        | NodeKind::Input(_)
        | NodeKind::Operation(_)
        | NodeKind::Call(_)
        | NodeKind::Branch(_)
        | NodeKind::Closure(_)
        | NodeKind::Graph(_) => false,
    }
}

/// HIR to HIR(ANF) normalization transformer.
///
/// This struct implements the [`Fold`] trait to transform HIR nodes into Administrative
/// Normal Form (ANF). The transformation ensures that all complex expressions are
/// broken down into sequences of simple bindings.
pub struct Normalization<'ctx, 'env, 'heap> {
    /// Mutable reference to the HIR context for interning and variable generation
    context: &'ctx mut HirContext<'env, 'heap>,
    /// Stack of accumulated `let` bindings within the current boundary
    bindings: Vec<Binding<'heap>>,
    /// Optional node replacement mechanism for structural transformations
    trampoline: Option<Node<'heap>>,
    /// Pool of reusable binding vectors to reduce allocations
    recycler: Vec<Vec<Binding<'heap>>>,
    /// Maximum number of vectors to keep in the recycler pool
    max_recycle: usize,
}

impl<'ctx, 'env, 'heap> Normalization<'ctx, 'env, 'heap> {
    /// Creates a new normalization transformer.
    pub const fn new(context: &'ctx mut HirContext<'env, 'heap>, max_recycle: usize) -> Self {
        Self {
            context,
            bindings: Vec::new(),
            trampoline: None,
            recycler: Vec::new(),
            max_recycle,
        }
    }

    /// Executes the normalization transformation on the given HIR node.
    ///
    /// This is the main entry point for the normalization process. It wraps the
    /// input node in a boundary to ensure proper binding accumulation and returns
    /// the normalized result.
    ///
    /// # Panics
    ///
    /// Panics if the trampoline mechanism is left in an inconsistent state after
    /// normalization, which indicates a bug in the transformation logic.
    #[must_use]
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

    /// Ensures that a node is represented as a local variable.
    ///
    /// If the node is already a local variable, returns it unchanged. Otherwise,
    /// creates a new binding with a fresh variable and adds it to the current
    /// binding stack.
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

    /// Ensures that a node is a valid projection (place expression).
    ///
    /// If the node is already a projection, returns it unchanged. Otherwise,
    /// converts it to a local variable binding.
    fn ensure_projection(&mut self, node: Node<'heap>) -> Node<'heap> {
        if is_projection(&node) {
            return node;
        }

        self.ensure_local_variable(node)
    }

    /// Ensures that a node is an atomic value.
    ///
    /// If the node is already an atom, returns it unchanged. Otherwise,
    /// converts it to a local variable binding.
    fn ensure_atom(&mut self, node: Node<'heap>) -> Node<'heap> {
        if is_atom(&node) {
            return node;
        }

        self.ensure_local_variable(node)
    }

    /// Sets a replacement node via the trampoline mechanism.
    ///
    /// The trampoline allows structural transformations where a node needs to
    /// be completely replaced rather than just modified. This is used for
    /// operations like removing type assertions or flattening let bindings.
    ///
    /// # Panics
    ///
    /// Panics if the trampoline is already occupied, indicating multiple
    /// replacements attempted for the same node.
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

    /// Processes a node within a normalization boundary.
    ///
    /// Boundaries are points where `let` bindings are accumulated and then
    /// wrapped around the final result. This implements the core ANF transformation
    /// by ensuring that complex expressions are broken down into sequences of
    /// simple bindings.
    ///
    /// The method uses vector recycling to minimize allocations during the
    /// transformation process.
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
        node = self.ensure_atom(node);

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

    /// Folds a HIR node with trampoline support for structural replacements.
    ///
    /// This method handles the trampoline mechanism that allows complete node
    /// replacement during the folding process. It's used for transformations
    /// like removing type assertions or flattening let bindings.
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

    /// Folds a struct field, ensuring the value is atomic.
    ///
    /// Struct field values must be atoms to maintain ANF invariants.
    fn fold_struct_field(&mut self, field: StructField<'heap>) -> Self::Output<StructField<'heap>> {
        let Ok(StructField { name, value }) = fold::walk_struct_field(self, field);

        let value = self.ensure_atom(value);

        Ok(StructField { name, value })
    }

    /// Folds a tuple, ensuring all field values are atomic.
    ///
    /// Tuple elements must be atoms to maintain ANF invariants.
    fn fold_tuple(&mut self, Tuple { fields }: Tuple<'heap>) -> Self::Output<Tuple<'heap>> {
        let mut fields = Beef::new(fields);
        let Ok(()) = fields.try_map::<_, Self::Output<()>>(|field| {
            self.fold_nested_node(field)
                .map(|node| self.ensure_atom(node))
        });

        let fields = fields.finish(&self.context.interner.nodes);

        Ok(Tuple { fields })
    }

    /// Folds a list, ensuring all elements are atomic.
    ///
    /// List elements must be atoms to maintain ANF invariants.
    fn fold_list(&mut self, List { elements }: List<'heap>) -> Self::Output<List<'heap>> {
        let mut elements = Beef::new(elements);
        let Ok(()) = elements.try_map::<_, Self::Output<()>>(|element| {
            self.fold_nested_node(element)
                .map(|node| self.ensure_atom(node))
        });
        let elements = elements.finish(&self.context.interner.nodes);

        Ok(List { elements })
    }

    /// Folds a dictionary field, ensuring both key and value are atomic.
    ///
    /// Dictionary keys and values must be atoms to maintain ANF invariants.
    fn fold_dict_field(&mut self, field: DictField<'heap>) -> Self::Output<DictField<'heap>> {
        let Ok(DictField { mut key, mut value }) = fold::walk_dict_field(self, field);
        key = self.ensure_atom(key);
        value = self.ensure_atom(value);

        Ok(DictField { key, value })
    }

    /// Folds a variable binding and adds it to the current binding stack.
    ///
    /// Bindings are accumulated during the folding process and later wrapped
    /// in `let` expressions at boundary points. The evaluation order is preserved
    /// by adding bindings to the stack after they have been evaluated.
    fn fold_binding(&mut self, binding: Binding<'heap>) -> Self::Output<Binding<'heap>> {
        // We put the bindings into the current stack *after* they have been evaluated, this makes
        // sure that evaluation order is preserved.
        let Ok(modified) = fold::walk_binding(self, binding);
        self.bindings.push(modified);

        // We return the old binding, so that underlying beef implementation does not double intern
        Ok(binding)
    }

    /// Folds a let expression by flattening it into the binding stack.
    ///
    /// Let expressions are dissolved during ANF transformation. Their bindings
    /// are moved to the current boundary's binding stack, and the body replaces
    /// the entire let expression via the trampoline mechanism.
    fn fold_let(&mut self, r#let: Let<'heap>) -> Self::Output<Let<'heap>> {
        let Ok(Let { bindings: _, body }) = fold::walk_let(self, r#let);

        // Replace with the body as we have up-streamed any bindings and therefore is superfluous
        self.trampoline(body);

        // Return the same value, so that the interner does not double intern
        Ok(r#let)
    }

    /// Folds a type assertion by removing it from the expression tree.
    ///
    /// Type assertions are superfluous after type checking and are removed
    /// during ANF transformation. The underlying value replaces the assertion
    /// via the trampoline mechanism.
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

    /// Folds binary operations with special handling for short-circuiting operators.
    ///
    /// Short-circuiting operators (`&&`, `||`) receive special treatment because
    /// they introduce control flow:
    /// - `A && B` ≡ `if A then B else false`
    /// - `A || B` ≡ `if A then true else B`
    ///
    /// The left operand is always evaluated, but the right operand is treated
    /// as a boundary since it may not be evaluated.
    ///
    /// For other binary operations, both operands must be atoms.
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

            return Ok(BinaryOperation {
                op,
                left: self.ensure_atom(left),
                right,
            });
        }

        let Ok(BinaryOperation { op, left, right }) = fold::walk_binary_operation(self, operation);

        // Arguments to a function call must be atoms
        Ok(BinaryOperation {
            op,
            left: self.ensure_atom(left),
            right: self.ensure_atom(right),
        })
    }

    /// Folds unary operations, ensuring the operand is atomic.
    ///
    /// Unary operations are treated as function calls, so their operand must
    /// be an atom to maintain ANF invariants.
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

    /// Folds input declarations, ensuring default values are atomic.
    ///
    /// Input default values, when present, must be atoms to maintain ANF invariants.
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

    /// Folds field access expressions, ensuring the base expression is a projection.
    ///
    /// Field access creates a projection, so the base expression must itself be
    /// a valid projection (place expression) to maintain proper memory access semantics.
    fn fold_field_access(
        &mut self,
        access: FieldAccess<'heap>,
    ) -> Self::Output<FieldAccess<'heap>> {
        let Ok(FieldAccess { expr, field }) = fold::walk_field_access(self, access);
        // To be a valid projection the inner body must be an atom
        Ok(FieldAccess {
            expr: self.ensure_projection(expr),
            field,
        })
    }

    /// Folds index access expressions with projection and variable constraints.
    ///
    /// Index access creates a projection, so:
    /// - The base expression must be a valid projection
    /// - The index expression must be a local variable (not just any atom)
    ///
    /// This ensures proper memory access patterns for later optimization phases.
    fn fold_index_access(
        &mut self,
        access: IndexAccess<'heap>,
    ) -> Self::Output<IndexAccess<'heap>> {
        let Ok(IndexAccess { expr, index }) = fold::walk_index_access(self, access);

        // To be a valid projection, the inner body must be an atom, and the index must be a local
        // variable
        Ok(IndexAccess {
            expr: self.ensure_projection(expr),
            index: self.ensure_local_variable(index),
        })
    }

    /// Folds function calls, ensuring the function expression is atomic.
    ///
    /// Function calls require the function expression to be an atom, while
    /// arguments are handled separately by `fold_call_argument`.
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

    /// Folds call arguments, ensuring each argument value is atomic.
    ///
    /// Function call arguments must be atoms to maintain ANF invariants.
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

    /// Folds conditional expressions with boundary handling.
    ///
    /// Conditional expressions introduce control flow boundaries:
    /// - The test expression is evaluated in the current boundary
    /// - The then and else branches each form their own boundaries
    ///
    /// The test expression must be an atom for the conditional jump.
    fn fold_if(&mut self, If { test, then, r#else }: If<'heap>) -> Self::Output<If<'heap>> {
        // If is a bit more complex, it is considered a "boundary", `test` is evaluated in the outer
        // boundary, whereas `then` and `else` are both their own boundaries.
        let Ok(test) = fold::walk_nested_node(self, test);

        let then = self.boundary(then);
        let r#else = self.boundary(r#else);

        Ok(If {
            test: self.ensure_atom(test),
            then,
            r#else,
        })
    }

    /// Folds closure definitions with boundary handling.
    ///
    /// Closure bodies form natural boundaries since they represent separate
    /// execution contexts. The signature is processed normally, but the body
    /// is wrapped in its own normalization boundary.
    fn fold_closure(
        &mut self,
        Closure { signature, body }: Closure<'heap>,
    ) -> Self::Output<Closure<'heap>> {
        let Ok(signature) = self.fold_closure_signature(signature);

        // The `body` is natural boundary
        let body = self.boundary(body);

        Ok(Closure { signature, body })
    }

    /// Folds graph read head operations with axis atomicity requirements.
    ///
    /// Graph operations are already normalized and handled by other fold operations.
    /// We ensure that the axis expression is evaluated before the pipeline is initiated,
    /// but we do not require atoms for the body or tail closures as these are handled
    /// separately in the MIR compilation phase.
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
