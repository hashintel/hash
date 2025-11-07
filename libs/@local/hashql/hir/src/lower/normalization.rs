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

use hashql_core::{
    collections::pool::VecPool,
    intern::Beef,
    span::Spanned,
    r#type::{TypeBuilder, environment::Environment},
    value::Primitive,
};

use crate::{
    context::HirContext,
    fold::{self, Fold},
    intern::Interner,
    map::HirInfo,
    node::{
        HirPtr, Node, NodeData,
        access::{FieldAccess, IndexAccess},
        branch::{Branch, If},
        call::{Call, CallArgument},
        closure::Closure,
        data::{Data, DictField, List, StructField, Tuple},
        graph::read::GraphReadHead,
        kind::NodeKind,
        r#let::{Binder, Binding, Let},
        operation::{BinOp, BinaryOperation, TypeAssertion, UnaryOperation},
        thunk::Thunk,
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
pub(crate) const fn is_anf_atom(node: &NodeData<'_>) -> bool {
    match node.kind {
        NodeKind::Data(Data::Primitive(_)) | NodeKind::Variable(_) | NodeKind::Access(_) => true,
        NodeKind::Data(_)
        | NodeKind::Let(_)
        | NodeKind::Operation(_)
        | NodeKind::Call(_)
        | NodeKind::Branch(_)
        | NodeKind::Closure(_)
        | NodeKind::Thunk(_)
        | NodeKind::Graph(_) => false,
    }
}

/// Ensures that a node is represented as a local variable reference.
///
/// This function is a core part of ANF transformation that guarantees a node
/// can be referenced as a simple variable. If the node is already a local
/// variable, it returns the node unchanged. Otherwise, it creates a fresh
/// binding with a generated variable name and adds it to the binding stack.
///
/// The newly created variable inherits the type information from the original
/// node.
///
/// # Returns
///
/// A [`Node`] containing either the original local variable or a new local
/// variable reference to the bound expression.
pub(crate) fn ensure_local_variable<'heap>(
    context: &mut HirContext<'_, 'heap>,
    bindings: &mut Vec<Binding<'heap>>,
    node: Node<'heap>,
) -> Node<'heap> {
    if matches!(node.kind, NodeKind::Variable(Variable::Local(_))) {
        return node;
    }

    let binder_id = context.counter.var.next();
    let binding = Binding {
        span: node.span,
        binder: Binder {
            id: binder_id,
            span: node.span,
            name: None,
        },
        value: node,
    };
    bindings.push(binding);

    // The type of that variable is that of the node itself
    let id = context.counter.hir.next();
    context.map.copy_to(node.id, id);

    context.interner.intern_node(NodeData {
        id,
        span: node.span,
        kind: NodeKind::Variable(Variable::Local(LocalVariable {
            id: Spanned {
                span: node.span,
                value: binder_id,
            },
            arguments: context.interner.intern_type_ids(&[]),
        })),
    })
}

/// Determines if a node represents a projection (place expression).
///
/// Projections are memory locations that can be read from or written to.
/// They form a subset of atoms and include:
/// - Local variable references ([`Variable::Local`])
/// - Access expressions ([`FieldAccess`], [`IndexAccess`]) applied to other projections
///
/// This is more restrictive than [`is_anf_atom`] because projections must be
/// addressable locations, not just any atomic value.
///
/// [`Variable::Local`]: crate::node::variable::Variable::Local
/// [`FieldAccess`]: crate::node::access::FieldAccess
/// [`IndexAccess`]: crate::node::access::IndexAccess
const fn is_projection(node: &NodeData<'_>) -> bool {
    match node.kind {
        NodeKind::Variable(_) | NodeKind::Access(_) => true,
        NodeKind::Data(_)
        | NodeKind::Let(_)
        | NodeKind::Operation(_)
        | NodeKind::Call(_)
        | NodeKind::Branch(_)
        | NodeKind::Closure(_)
        | NodeKind::Thunk(_)
        | NodeKind::Graph(_) => false,
    }
}

/// State and configuration for HIR(ANF) normalization.
///
/// This struct contains performance optimizations and reusable resources for
/// the normalization process, primarily focused on reducing allocations.
///
/// This struct can be reused across multiple normalization runs to avoid
/// unnecessary reallocations.
#[derive(Debug)]
pub struct NormalizationState<'heap> {
    /// Pool of reusable binding vectors to reduce allocations
    ///
    /// The normalization process frequently creates temporary vectors to accumulate
    /// `let` bindings at boundary points. To reduce allocation overhead, completed
    /// vectors are cached in a recycler pool for reuse.
    ///
    /// A higher capacity value reduces allocations at the cost of increased memory usage.
    /// A value of 0 disables recycling entirely.
    ///
    /// # Default Value
    ///
    /// The default is 4, which provides a good balance between memory usage and
    /// allocation reduction for typical workloads.
    pub recycler: VecPool<Binding<'heap>>,
}

impl Default for NormalizationState<'_> {
    fn default() -> Self {
        Self {
            recycler: VecPool::new(4),
        }
    }
}

/// HIR to HIR(ANF) normalization transformer.
///
/// This struct implements the [`Fold`] trait to transform HIR nodes into Administrative
/// Normal Form (ANF). The transformation ensures that all complex expressions are
/// broken down into sequences of simple bindings.
pub struct Normalization<'ctx, 'env, 'hir, 'heap> {
    /// Mutable reference to the HIR context for interning and variable generation
    context: &'ctx mut HirContext<'hir, 'heap>,
    /// Type environment for type inference and resolution
    env: &'env Environment<'heap>,
    /// Stack of accumulated `let` bindings within the current boundary
    bindings: Vec<Binding<'heap>>,
    /// Optional node replacement mechanism for structural transformations
    trampoline: Option<Node<'heap>>,
    /// State that is shared during multiple normalization passes
    state: &'ctx mut NormalizationState<'heap>,
    // The current node being processed
    current: HirPtr,
}

impl<'ctx, 'env, 'hir, 'heap> Normalization<'ctx, 'env, 'hir, 'heap> {
    /// Creates a new normalization transformer.
    ///
    /// # Arguments
    ///
    /// - `context`: Mutable reference to the HIR context for interning and variable generation
    /// - `env`: Type environment for type inference and resolution
    /// - `state`: Shared state containing configuration and reusable resources
    pub const fn new(
        context: &'ctx mut HirContext<'hir, 'heap>,
        env: &'env Environment<'heap>,
        state: &'ctx mut NormalizationState<'heap>,
    ) -> Self {
        Self {
            context,
            env,
            bindings: Vec::new(),
            trampoline: None,
            state,
            current: HirPtr::PLACEHOLDER,
        }
    }

    /// Executes the normalization transformation on the given HIR node.
    ///
    /// This is the main entry point for the normalization process. It transforms the input HIR node
    /// into Administrative Normal Form (ANF) by wrapping it in a boundary to ensure proper
    /// binding accumulation and returns the normalized result.
    ///
    /// The transformation guarantees that:
    /// - All complex expressions are bound to variables
    /// - Function arguments are atomic values
    /// - Control flow is explicitly represented
    /// - Short-circuiting operations are converted to conditionals
    ///
    /// # Examples
    ///
    /// ```text
    /// foo(bar(x), baz(y))
    /// ```
    ///
    /// turns into:
    ///
    /// ```text
    /// let %1 = bar(x) in
    /// let %2 = baz(y) in
    /// let %3 = foo(%1, %2) in
    /// %3
    /// ```
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

    fn ensure_local_variable(&mut self, node: Node<'heap>) -> Node<'heap> {
        ensure_local_variable(self.context, &mut self.bindings, node)
    }

    /// Ensures that a node is a valid projection (place expression).
    ///
    /// Projections represent memory locations that can be read from or assigned to,
    /// such as variables and field/index access expressions. This function is used
    /// when the ANF transformation requires a place expression rather than just any
    /// atomic value.
    ///
    /// If the node is already a valid projection ([`Variable`] or [`Access`]), it
    /// returns the node unchanged. Otherwise, it converts the node to a local
    /// variable binding, making it addressable.
    ///
    /// [`Variable`]: crate::node::variable::Variable
    /// [`Access`]: crate::node::access
    fn ensure_projection(&mut self, node: Node<'heap>) -> Node<'heap> {
        if is_projection(&node) {
            return node;
        }

        self.ensure_local_variable(node)
    }

    /// Ensures that a node is an atomic value suitable for ANF.
    ///
    /// Atoms are the fundamental values in Administrative Normal Form that can be
    /// used directly without requiring further evaluation. This includes data literals,
    /// variable references, and access expressions.
    ///
    /// If the node is already atomic (determined by [`is_anf_atom`]), it returns
    /// the node unchanged. Otherwise, it creates a binding for the complex expression
    /// and returns a reference to the bound variable.
    ///
    /// This is the most commonly used normalization function, as most contexts in
    /// ANF require atomic operands.
    fn ensure_atom(&mut self, node: Node<'heap>) -> Node<'heap> {
        if is_anf_atom(&node) {
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
        assert!(
            self.trampoline.is_none(),
            "trampoline has been inserted to multiple times"
        );

        self.trampoline = Some(node);
    }

    /// Processes a node within a normalization boundary.
    ///
    /// Boundaries define scopes where [`Binding`] accumulation occurs before being
    /// wrapped into a [`Let`] expression. This is the core mechanism for ANF
    /// transformation, ensuring that complex expressions are decomposed into
    /// sequences of simple bindings followed by an atomic result.
    ///
    /// The function manages a separate binding stack for the boundary, processes
    /// the node through the fold mechanism, ensures the result is atomic, and
    /// finally wraps any accumulated bindings in a [`Let`] expression.
    ///
    /// # Boundary Examples
    ///
    /// Boundaries typically occur at:
    /// - Closure and thunk bodies
    /// - Conditional expression branches
    /// - Short-circuiting operation operands
    fn boundary(&mut self, node: Node<'heap>) -> Node<'heap> {
        // Check if we have a recycled bindings vector that we can reuse, otherwise use a new one
        // The current amount of bindings is a good indicator for the size of vector we're expecting
        let bindings = self.state.recycler.acquire_with(self.bindings.len());

        // Save the current bindings vector, to be restored once we've exited the boundary
        let outer = mem::replace(&mut self.bindings, bindings);

        // Check if the id from the new node is the same as the one from the source node
        // if they aren't then we can reuse the same id. Why?
        // Only `let` expressions "erase" themselves, therefore we just no-op.
        let prev_hir_id = node.id;
        let Ok(mut node) = fold::walk_nested_node(self, node);
        node = self.ensure_atom(node);

        // Restore the outer vector and retrieve the collected bindings
        let bindings = core::mem::replace(&mut self.bindings, outer);

        if !bindings.is_empty() {
            let id = if node.id == prev_hir_id {
                // The item was already an atom, therefore nothing to reuse
                let id = self.context.counter.hir.next();

                // Copy any information from the underlying node as this is a simple let, and
                // therefore takes the type of the body.
                self.context.map.copy_to(prev_hir_id, node.id);
                id
            } else {
                // We've "taken over" the id of the previous node
                prev_hir_id
            };

            // We need to wrap the collected bindings into a new let node
            node = self.context.interner.intern_node(NodeData {
                id,
                span: node.span,
                kind: NodeKind::Let(Let {
                    bindings: self.context.interner.bindings.intern_slice(&bindings),
                    body: node,
                }),
            });
        }

        self.state.recycler.release(bindings);
        node
    }

    /// Handles short-circuiting boolean operations (`&&`, `||`) with special boundary semantics.
    ///
    /// Short-circuiting boolean operations have different evaluation properties than other
    /// binary operations because they conditionally evaluate their right operand:
    ///
    /// - For `A && B`: `B` is only evaluated if `A` is true
    /// - For `A || B`: `B` is only evaluated if `A` is false
    ///
    /// To properly handle this conditional evaluation in ANF, these operations are transformed
    /// into equivalent conditional expressions, but only if the right operand isn't atomic:
    ///
    /// - `A && B` ≡ `if A then B else false`
    /// - `A || B` ≡ `if A then true else B`
    ///
    /// This transformation treats the right operand as a boundary (its own evaluation context)
    /// while the left operand is evaluated in the current boundary. When the right operand
    /// contains complex expressions that require normalization, the transformation uses
    /// the trampoline mechanism to replace the binary operation with an [`If`] expression.
    fn fold_binary_bool(&mut self, operation: BinaryOperation<'heap>) -> BinaryOperation<'heap> {
        let BinaryOperation { op, left, right } = operation;

        // inlined version of `fold::walk_binary_operation`
        let op = Spanned {
            span: self.fold_span(op.span).into_ok(),
            value: op.value,
        };

        // Proceed as normal, as `left` is equivalent to the `test` expression
        let Ok(left) = self.fold_nested_node(left);

        let left = self.ensure_atom(left);
        // The right side is a boundary
        let right = self.boundary(right);

        // Check if the right side has been used as a boundary, if that is the case, we
        // transform it into an `if/else` expression
        let is_right_atom = is_anf_atom(&right);

        // There is no short circuiting behaviour here required, meaning that we can just issue a
        // normal binary operation
        if is_right_atom {
            return BinaryOperation { op, left, right };
        }

        let mut make_bool = |value: bool| {
            let id = self.context.counter.hir.next();

            self.context.map.insert(
                id,
                HirInfo {
                    type_id: TypeBuilder::spanned(self.current.span, self.env).boolean(),
                    monomorphized_type_id: None,
                    type_arguments: None,
                },
            );

            self.context.interner.intern_node(NodeData {
                id,
                span: self.current.span,
                kind: NodeKind::Data(Data::Primitive(Primitive::Boolean(value))),
            })
        };

        // We reuse the same HIR id here, because we're transforming everything.
        // The `If` is depending on what the binary operation is
        let r#if = match op.value {
            // A && B => if A then B else false
            BinOp::And => If {
                test: left,
                then: right,
                r#else: make_bool(false),
            },
            // A || B => if A then true else B
            BinOp::Or => If {
                test: left,
                then: make_bool(true),
                r#else: right,
            },
            BinOp::Eq | BinOp::Ne | BinOp::Lt | BinOp::Lte | BinOp::Gt | BinOp::Gte => {
                unreachable!("fold_binary_bool is only called on `BinOp::And` or `BinOp::Or`")
            }
        };

        self.trampoline(self.context.interner.intern_node(NodeData {
            id: self.current.id,
            span: self.current.span,
            kind: NodeKind::Branch(Branch::If(r#if)),
        }));

        // Return the original node so that the interner can reuse it, as we're going to replace it
        // with a new node via the trampoline mechanism
        operation
    }
}

impl<'heap> Fold<'heap> for Normalization<'_, '_, '_, 'heap> {
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
    ///
    /// The trampoline pattern enables one-to-one node replacements that wouldn't
    /// be possible with normal folding, such as:
    /// - Removing [`TypeAssertion`] nodes completely
    /// - Flattening nested [`Let`] expressions
    /// - Converting short-circuiting operations to [`If`] expressions
    fn fold_node(&mut self, node: Node<'heap>) -> Self::Output<Node<'heap>> {
        let backup = self.trampoline.take();
        let previous = mem::replace(&mut self.current, node.ptr());

        let Ok(mut node) = fold::walk_node(self, node);

        self.current = previous;

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
    ///
    /// This flattening process eliminates nested [`Let`] structures, creating
    /// a single flat sequence of bindings at each boundary level.
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
    ///
    /// This removal simplifies the IR by eliminating redundant type information
    /// that was only needed during the type checking phase.
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
            return Ok(self.fold_binary_bool(operation));
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

    /// Folds field access expressions, ensuring the base expression is a projection.
    ///
    /// Field access creates a projection, so the base expression must itself be
    /// a valid projection (place expression) to maintain proper memory access semantics.
    /// This ensures that field access chains like `obj.field1.field2` maintain
    /// their addressability properties throughout the normalization.
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
    /// The stricter requirement for local variables as indices (rather than any atom)
    /// ensures proper memory access patterns for later optimization phases and
    /// simplifies bounds checking and memory safety analysis.
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
            kind,
            function,
            arguments,
        }) = fold::walk_call(self, call);

        Ok(Call {
            kind,
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

    /// Folds thunk definitions with boundary handling.
    ///
    /// Thunk bodies form natural boundaries since they represent module-level
    /// delayed computations. The body is wrapped in its own normalization boundary.
    fn fold_thunk(&mut self, Thunk { body }: Thunk<'heap>) -> Self::Output<Thunk<'heap>> {
        let body = self.boundary(body);

        Ok(Thunk { body })
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
