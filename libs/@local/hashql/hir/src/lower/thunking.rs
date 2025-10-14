//! Top-level binding thunking transformation within HIR(ANF).
//!
//! This module implements a transformation that wraps top-level bindings in thunks
//! to enable lazy evaluation and proper handling of recursive definitions. The
//! transformation operates on HIR(ANF) but **breaks ANF properties**, requiring
//! re-normalization afterward.
//!
//! # Scope and Limitations
//!
//! **Important**: This transformation only affects **top-level bindings** in a module.
//! Nested expressions, local bindings, and function bodies remain unchanged. The
//! transformation is specifically designed for module-level definitions where lazy
//! evaluation semantics are required.
//!
//! # ANF Violation
//!
//! After thunking, the HIR is no longer in Administrative Normal Form because:
//! - Thunk calls are inserted at variable reference sites
//! - These calls are not bound to intermediate variables
//! - The distinction between atoms and computations is temporarily broken
//!
//! **Re-normalization is required** after thunking to restore ANF properties.
//!
//! # Transformation Process
//!
//! ## Top-Level Binding Identification
//!
//! The transformation identifies top-level `let` bindings and marks non-thunk
//! bindings for thunking. Only bindings at the module's root level are affected.
//!
//! ## Thunk Wrapping
//!
//! Selected bindings are wrapped in thunks:
//! ```text
//! let friday_night_thunkin = computation;
//!
//! // becomes:
//! let friday_night_thunkin = thunk(() -> computation);
//! ```
//!
//! ## Call Insertion
//!
//! References to thunked variables are converted to calls:
//! ```text
//! x
//!
//! // becomes:
//! x()
//! ```
//!
//! This happens for both local and qualified variables that reference thunked bindings.
//!
//! # Examples
//!
//! ```text
//! // Before thunking (HIR-ANF):
//! let factorial = fn(n) -> if n <= 1 then 1 else n * factorial(n - 1)
//!     result = factorial(5) in
//! result
//!
//! // After thunking (breaks ANF):
//! let factorial = thunk(() -> fn(n) -> if n <= 1 then 1 else n * factorial()(n - 1))
//!     result = thunk(() -> factorial()(5)) in
//! result
//!
//! // After re-normalization (restores ANF):
//! let factorial = thunk(() -> fn(n) -> if n <= 1 then 1 else n * factorial()(n - 1))
//!     result = thunk(() ->
//!         let %1 = factorial() in
//!         %1(5)
//!     ) in
//! result
//! ```

use core::convert::Infallible;

use crate::{
    context::HirContext,
    fold::{self, Fold, nested::Deep},
    intern::Interner,
    lower::normalization::{ensure_local_variable, is_anf_atom},
    node::{
        Node, PartialNode,
        call::{Call, PointerKind},
        data::Data,
        kind::NodeKind,
        r#let::{Let, VarIdSet},
        thunk::Thunk,
        variable::{LocalVariable, QualifiedVariable, Variable},
    },
};

/// Top-level binding thunking transformer.
///
/// This transformer operates exclusively on top-level module bindings, wrapping
/// them in thunks and inserting calls at reference sites. It does not recurse
/// into nested expressions or function bodies.
pub struct Thunking<'ctx, 'env, 'heap> {
    /// Mutable reference to the HIR context for interning and variable generation
    context: &'ctx mut HirContext<'env, 'heap>,
    /// Set of top-level variable IDs that have been wrapped in thunks
    thunked: VarIdSet,
    /// The currently processing node during folding operations
    current_node: Option<Node<'heap>>,
    /// Optional node replacement mechanism for call insertion
    trampoline: Option<Node<'heap>>,
}

impl<'ctx, 'env, 'heap> Thunking<'ctx, 'env, 'heap> {
    /// Creates a new top-level thunking transformer.
    pub fn new(context: &'ctx mut HirContext<'env, 'heap>) -> Self {
        Self {
            context,
            thunked: VarIdSet::default(),
            current_node: None,
            trampoline: None,
        }
    }

    /// Wraps a node in a thunk if it isn't already thunked.
    ///
    /// If the node is already a thunk, it returns the node unchanged to avoid
    /// incorrect double-thunking, which would break the calling semantics.
    fn thunkify(&self, node: Node<'heap>) -> Node<'heap> {
        if matches!(node.kind, NodeKind::Thunk(_)) {
            return node;
        }

        self.context.interner.intern_node(PartialNode {
            span: node.span,
            kind: NodeKind::Thunk(Thunk { body: node }),
        })
    }

    /// Executes the top-level thunking transformation.
    ///
    /// This method processes only the top-level `let` bindings of a module,
    /// wrapping non-thunk bindings in thunks and inserting calls at reference
    /// sites. The transformation breaks ANF properties and requires subsequent
    /// re-normalization.
    ///
    /// # Panics
    ///
    /// This method includes debug assertions that will panic in debug builds if the input is not in
    /// proper ANF form
    ///
    /// # Returns
    ///
    /// A transformed HIR node where top-level bindings are thunked and variable
    /// references include call insertion. The result is **not** in ANF and requires
    /// re-normalization.
    #[must_use]
    pub fn run(mut self, node: Node<'heap>) -> Node<'heap> {
        // First collect all the variables that need to be thunked, these are simply the top level
        // let-bindings, we know that the top level are let bindings, because we expect everything
        // to be in HIR(ANF).
        let NodeKind::Let(Let { bindings, body }) = node.kind else {
            // Ensure that the underlying node is an atom, if it isn't -> we're not being called
            // from HIR(ANF)
            debug_assert!(is_anf_atom(&node), "The HIR is not in ANF");

            // Otherwise, we simply have no bindings to thunk
            return node;
        };

        // Ensure that the underlying node is an atom, if it isn't -> we're not being called
        // from HIR(ANF)
        debug_assert!(is_anf_atom(body), "The HIR is not in ANF");

        // When thunking, do not double thunk
        self.thunked.extend(
            bindings
                .iter()
                .filter(|binding| !matches!(binding.value.kind, NodeKind::Thunk(_)))
                .map(|binding| binding.binder.id),
        );

        // Transform the bindings to insert thunk calls at variable reference sites
        let Ok(bindings) = self.fold_bindings(*bindings);
        let mut bindings = bindings.to_vec();

        // Handle the body based on its type. Variables already reference thunks, while
        // primitives and access expressions need to be bound to local variables for
        // consistent handling in the module output.
        let body = match body.kind {
            NodeKind::Variable(_) => {
                // Variable already references a thunk, no additional binding needed
                *body
            }
            NodeKind::Data(Data::Primitive(_)) | NodeKind::Access(_) => {
                ensure_local_variable(self.context, &mut bindings, *body)
            }
            NodeKind::Data(_)
            | NodeKind::Let(_)
            | NodeKind::Input(_)
            | NodeKind::Operation(_)
            | NodeKind::Call(_)
            | NodeKind::Branch(_)
            | NodeKind::Closure(_)
            | NodeKind::Thunk(_)
            | NodeKind::Graph(_) => unreachable!("HIR should be in ANF"),
        };

        for binding in &mut bindings {
            binding.value = self.thunkify(node);
        }

        let bindings = self.context.interner.bindings.intern_slice(&bindings);

        self.context.interner.intern_node(PartialNode {
            span: node.span,
            kind: NodeKind::Let(Let { bindings, body }),
        })
    }

    /// Returns the currently processing node.
    ///
    /// This is used during folding operations to access the node being transformed.
    /// Should only be called within fold methods where `current_node` is guaranteed
    /// to be set.
    ///
    /// # Panics
    ///
    /// Panics if called when no current node is set, which indicates a bug in the
    /// folding logic.
    #[inline]
    fn current_node(&self) -> Node<'heap> {
        self.current_node.unwrap_or_else(|| {
            unreachable!("current_node is only called in `fold_node` and should be always set")
        })
    }

    /// Schedules a node replacement via the trampoline mechanism.
    ///
    /// The trampoline allows the folder to replace the current node with a different
    /// one during traversal. This is used to insert thunk calls when thunked variables
    /// are referenced.
    ///
    /// # Panics
    ///
    /// Panics if the trampoline is already set, which would indicate multiple
    /// replacement attempts for the same node.
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
}

impl<'heap> Fold<'heap> for Thunking<'_, '_, 'heap> {
    type NestedFilter = Deep;
    type Output<T>
        = Result<T, !>
    where
        T: 'heap;
    type Residual = Result<Infallible, !>;

    fn interner(&self) -> &Interner<'heap> {
        self.context.interner
    }

    /// Folds a node while managing trampoline state for call insertions.
    ///
    /// This method handles the core folding logic while maintaining proper
    /// trampoline state isolation between nested node processing.
    fn fold_node(&mut self, node: Node<'heap>) -> Self::Output<Node<'heap>> {
        let backup_trampoline = self.trampoline.take();
        let backup_current_node = self.current_node.take();

        let Ok(mut node) = fold::walk_node(self, node);

        let trampoline = core::mem::replace(&mut self.trampoline, backup_trampoline);
        if let Some(trampoline) = trampoline {
            node = trampoline;
        }

        self.current_node = backup_current_node;

        Ok(node)
    }

    /// Processes local variable references, inserting thunk calls when needed.
    ///
    /// If the local variable references a top-level binding that has been thunked,
    /// this method schedules a call to be inserted via the trampoline mechanism,
    /// effectively transforming `%var` into `%var()`.
    fn fold_local_variable(
        &mut self,
        variable: LocalVariable<'heap>,
    ) -> Self::Output<LocalVariable<'heap>> {
        let Ok(variable) = fold::walk_local_variable(self, variable);

        if !self.thunked.contains(&variable.id.value) {
            return Ok(variable);
        }

        self.trampoline(self.context.interner.intern_node(PartialNode {
            span: self.current_node().span,
            kind: NodeKind::Call(Call {
                kind: PointerKind::Thin,
                function: self.current_node(),
                arguments: self.context.interner.intern_call_arguments(&[]),
            }),
        }));

        // Return the same variable, so that the caller interning does not do extra work
        Ok(variable)
    }

    /// Processes qualified variable references, inserting thunk calls.
    ///
    /// All top-level items exported from modules are thunks, so qualified variables
    /// always reference thunked bindings. Calls are inserted automatically to ensure
    /// proper lazy evaluation across module boundaries.
    fn fold_qualified_variable(
        &mut self,
        variable: QualifiedVariable<'heap>,
    ) -> Self::Output<QualifiedVariable<'heap>> {
        let Ok(variable) = fold::walk_qualified_variable(self, variable);

        // Insert a call to force the thunk. The `fold_call` method ensures this
        // doesn't lead to wrong calling conventions for already-thunked qualified variables.
        self.trampoline(self.context.interner.intern_node(PartialNode {
            span: self.current_node().span,
            kind: NodeKind::Call(Call {
                kind: PointerKind::Thin,
                function: self.current_node(),
                arguments: self.context.interner.intern_call_arguments(&[]),
            }),
        }));

        // Return the same variable, so that the caller interning does not do extra work
        Ok(variable)
    }

    /// Processes function calls, avoiding double-thunking of qualified variables.
    ///
    /// For correctness, this method ensures that we don't double-thunk qualified variables, doing
    /// so would result in incorrect calling conventions.
    fn fold_call(&mut self, call: Call<'heap>) -> Self::Output<Call<'heap>> {
        // Check if we already call a thunked function when it is a qualified variable, if that is
        // the case this is just a no-op
        if let NodeKind::Variable(Variable::Qualified(_)) = call.function.kind
            && call.kind == PointerKind::Thin
        {
            return Ok(call);
        }

        fold::walk_call(self, call)
    }
}
