use core::ops::{Deref, DerefMut};
use std::collections::HashMap;

use super::{
    Type, TypeId, TypeKind,
    error::{TypeCheckDiagnostic, circular_type_reference},
    kind::generic_argument::GenericArgumentId,
    recursion::RecursionBoundary,
    unify_type_impl,
};
use crate::{
    arena::transaction::{Checkpoint, TransactionalArena},
    span::SpanId,
};

/// Represents the type relationship variance used in generic type checking.
///
/// Variance defines how subtyping relationships between generic parameter types
/// affect subtyping relationships between the resulting parameterized types.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash, Default)]
pub enum Variance {
    /// Covariance
    ///
    /// Covariance preserves the ordering of types, suppose `A` and `B` are types, and `I` is a type
    /// constructor. If `I` is covariant, and `A <: B` (A is a subtype of B), then `I<A> <: I<B>`.
    ///
    /// Example: If `Cat <: Animal`, then `List<Cat> <: List<Animal>` in a covariant position.
    #[default]
    Covariant,
    /// Contravariance
    ///
    /// Contravariance reverses the ordering of types, suppose `A` and `B` are types, and `I` is a
    /// type constructor. If `I` is contravariant, and `A <: B` (A is a subtype of B), then
    /// `I<B> <: I<A>`.
    ///
    /// Example: If `Cat <: Animal`, then `fn(Animal) -> Null <: fn(Cat) -> Void`
    /// for parameter types in a contravariant position.
    Contravariant,
    /// Invariance
    ///
    /// Invariance requires exact match of types, suppose `A` and `B` are types, and `I` is a type
    /// constructor. If `I` is invariant, then `I<A> <: I<B>` if and only if `A = B`.
    ///
    /// Example: `Dict<Integer, String> <: Dict<Number, String>` is not a subtype
    /// of the other, even though `Integer <: Number`.
    Invariant,
}

pub struct Environment {
    pub source: SpanId,
    pub arena: TransactionalArena<Type>,

    diagnostics: Vec<TypeCheckDiagnostic>,
    fatal_diagnostics: usize,

    // The arguments currently in scope
    arguments: HashMap<GenericArgumentId, TypeId, foldhash::fast::RandomState>,
}

impl Environment {
    #[must_use]
    pub fn new(source: SpanId, arena: TransactionalArena<Type>) -> Self {
        Self {
            source,
            arena,
            diagnostics: Vec::new(),
            fatal_diagnostics: 0,
            arguments: HashMap::default(),
        }
    }

    pub fn take_diagnostics(&mut self) -> Vec<TypeCheckDiagnostic> {
        core::mem::take(&mut self.diagnostics)
    }

    pub(crate) fn replace_diagnostics(&mut self, diagnostics: Vec<TypeCheckDiagnostic>) {
        self.diagnostics = diagnostics;
    }

    pub(crate) fn record_diagnostic(&mut self, diagnostic: TypeCheckDiagnostic) {
        if diagnostic.severity.is_fatal() {
            self.fatal_diagnostics += 1;
        }
        self.diagnostics.push(diagnostic);
    }

    pub(crate) const fn fatal_diagnostics(&self) -> usize {
        self.fatal_diagnostics
    }

    #[track_caller]
    pub(crate) fn update_kind(&mut self, id: TypeId, kind: TypeKind) {
        self.arena.update_with(id, |r#type| r#type.kind = kind);
    }

    pub(crate) fn enter_generic_argument_scope(&mut self, id: GenericArgumentId, r#type: TypeId) {
        self.arguments.insert(id, r#type);
    }

    pub(crate) fn exit_generic_argument_scope(&mut self, id: GenericArgumentId) {
        self.arguments.remove(&id);
    }

    pub(crate) fn generic_argument(&self, id: GenericArgumentId) -> Option<TypeId> {
        self.arguments.get(&id).copied()
    }

    fn begin_transaction(&self) -> (Checkpoint<Type>, usize, usize) {
        let checkpoint = self.arena.checkpoint();
        let length = self.diagnostics.len();
        let fatal = self.fatal_diagnostics;

        (checkpoint, length, fatal)
    }

    fn end_transaction(
        &mut self,
        success: bool,
        checkpoint: Checkpoint<Type>,
        length: usize,
        fatal: usize,
    ) {
        if !success {
            self.arena.restore(checkpoint);
            self.diagnostics.truncate(length);
            self.fatal_diagnostics = fatal;
        }
    }
}

pub struct UnificationEnvironment<'env> {
    environment: &'env mut Environment,
    boundary: RecursionBoundary,

    pub variance: Variance,
}

impl<'env> UnificationEnvironment<'env> {
    pub fn new(environment: &'env mut Environment) -> Self {
        Self {
            environment,
            boundary: RecursionBoundary::new(),
            variance: Variance::default(),
        }
    }

    pub fn unify_type(&mut self, lhs: TypeId, rhs: TypeId) {
        if !self.boundary.enter(lhs, rhs) {
            // We've detected a circular reference in the type graph
            let lhs_type = &self.environment.arena[lhs];
            let rhs_type = &self.environment.arena[rhs];

            let diagnostic = circular_type_reference(self.environment.source, lhs_type, rhs_type);

            self.environment.record_diagnostic(diagnostic);
            return;
        }

        unify_type_impl(self, lhs, rhs);

        self.boundary.exit(lhs, rhs);
    }

    pub(crate) fn structurally_equivalent(&self, lhs: TypeId, rhs: TypeId) -> bool {
        let mut environment = EquivalenceEnvironment::new(self.environment);

        environment.structurally_equivalent(lhs, rhs)
    }

    pub(crate) fn with_variance<T>(
        &mut self,
        variance: Variance,
        closure: impl FnOnce(&mut Self) -> T,
    ) -> T {
        let old_variance = self.variance;

        // Apply variance composition rules
        self.variance = match (old_variance, variance) {
            // When going from covariant to contravariant context or vice versa, flip to
            // contravariant
            (Variance::Covariant, Variance::Contravariant)
            | (Variance::Contravariant, Variance::Covariant) => Variance::Contravariant,

            // When either context is invariant, the result is invariant
            (Variance::Invariant, _) | (_, Variance::Invariant) => Variance::Invariant,

            // Otherwise preserve the context
            _ => variance,
        };

        let result = closure(self);
        self.variance = old_variance;
        result
    }

    pub(crate) fn in_contravariant<T>(&mut self, closure: impl FnOnce(&mut Self) -> T) -> T {
        self.with_variance(Variance::Contravariant, closure)
    }

    pub(crate) fn in_covariant<T>(&mut self, closure: impl FnOnce(&mut Self) -> T) -> T {
        self.with_variance(Variance::Covariant, closure)
    }

    pub(crate) fn in_invariant<T>(&mut self, closure: impl FnOnce(&mut Self) -> T) -> T {
        self.with_variance(Variance::Invariant, closure)
    }

    pub(crate) fn in_transaction(&mut self, closure: impl FnOnce(&mut Self) -> bool) {
        let (checkpoint, length, fatal) = self.begin_transaction();

        let result = closure(self);

        self.end_transaction(result, checkpoint, length, fatal);
    }
}

// We usually try to avoid `Deref` and `DerefMut`, but it makes sense in this case.
// As the unification environment is just a wrapper around the environment with an additional guard.
impl Deref for UnificationEnvironment<'_> {
    type Target = Environment;

    fn deref(&self) -> &Self::Target {
        self.environment
    }
}

impl DerefMut for UnificationEnvironment<'_> {
    fn deref_mut(&mut self) -> &mut Self::Target {
        self.environment
    }
}

pub struct EquivalenceEnvironment<'env> {
    environment: &'env Environment,
    boundary: RecursionBoundary,
}

impl<'env> EquivalenceEnvironment<'env> {
    #[must_use]
    pub fn new(environment: &'env Environment) -> Self {
        Self {
            environment,
            boundary: RecursionBoundary::new(),
        }
    }

    /// Determines if two types are structurally equivalent - meaning they have the same shape and
    /// matching internal types.
    ///
    /// For example:
    /// - Two structs with the same field names and types are structurally equivalent
    /// - Two closures with the same parameter types and return type are structurally equivalent
    /// - Two generic types are structurally equivalent if their parameters and constraints match
    ///
    /// This function handles recursive types by using a recursion guard to prevent infinite
    /// recursion.
    ///
    /// # Panics
    ///
    /// If lhs and rhs do not exist in the environment.
    pub fn structurally_equivalent(&mut self, lhs: TypeId, rhs: TypeId) -> bool {
        let lhs_type = &self.environment.arena[lhs];
        let rhs_type = &self.environment.arena[rhs];

        if !self.boundary.enter(lhs, rhs) {
            // In case of recursion the result is true
            return true;
        }

        let result = lhs_type.structurally_equivalent_impl(rhs_type, self);

        self.boundary.exit(lhs, rhs);

        result
    }
}

// We usually try to avoid `Deref` and `DerefMut`, but it makes sense in this case.
// As the unification environment is just a wrapper around the environment with an additional guard.
impl Deref for EquivalenceEnvironment<'_> {
    type Target = Environment;

    fn deref(&self) -> &Self::Target {
        self.environment
    }
}

#[cfg(test)]
mod test {
    use crate::{
        arena::transaction::TransactionalArena,
        span::SpanId,
        r#type::{
            Type, TypeId, TypeKind,
            environment::{Environment, UnificationEnvironment, Variance},
            error::type_mismatch,
            kind::{generic_argument::GenericArgumentId, primitive::PrimitiveType},
        },
    };

    fn create_test_type(arena: &mut TransactionalArena<Type>, kind: TypeKind) -> TypeId {
        arena.push_with(|id| Type {
            id,
            kind,
            span: SpanId::SYNTHETIC,
        })
    }

    fn setup_arena() -> (TransactionalArena<Type>, TypeId, TypeId) {
        let mut arena = TransactionalArena::new();

        // Create a few test types
        let type1 = create_test_type(&mut arena, TypeKind::Primitive(PrimitiveType::Null));
        let type2 = create_test_type(&mut arena, TypeKind::Primitive(PrimitiveType::Boolean));

        (arena, type1, type2)
    }

    #[test]
    fn variance_context() {
        let (arena, _, _) = setup_arena();
        let mut environment = Environment::new(SpanId::SYNTHETIC, arena);
        let mut env = UnificationEnvironment::new(&mut environment);

        // Default should be covariant
        assert_eq!(env.variance, Variance::Covariant);

        // Test contravariant scope
        env.in_contravariant(|ctx| {
            assert_eq!(ctx.variance, Variance::Contravariant);

            // Test nested covariant in contravariant (should flip to contravariant)
            ctx.in_covariant(|inner_ctx| {
                assert_eq!(inner_ctx.variance, Variance::Contravariant);
            });
        });

        // Test invariant scope
        env.in_invariant(|ctx| {
            assert_eq!(ctx.variance, Variance::Invariant);

            // Test nested covariant in invariant (should remain invariant)
            ctx.in_covariant(|inner_ctx| {
                assert_eq!(inner_ctx.variance, Variance::Invariant);
            });
        });

        // Test variance after all scopes (should restore to default)
        assert_eq!(env.variance, Variance::Covariant);
    }

    #[test]
    fn generic_argument_scope() {
        let (arena, id1, _) = setup_arena();
        let mut context = Environment::new(SpanId::SYNTHETIC, arena);

        let arg_id = GenericArgumentId::new(42);

        // Initially no argument is in scope
        assert_eq!(context.generic_argument(arg_id), None);

        // Enter scope
        context.enter_generic_argument_scope(arg_id, id1);

        // Check argument is now in scope
        assert_eq!(context.generic_argument(arg_id), Some(id1));

        // Exit scope
        context.exit_generic_argument_scope(arg_id);

        // Check argument is no longer in scope
        assert_eq!(context.generic_argument(arg_id), None);
    }

    #[test]
    fn diagnostics() {
        let (arena, id1, id2) = setup_arena();
        let mut context = Environment::new(SpanId::SYNTHETIC, arena);

        // Initially no diagnostics
        assert!(context.take_diagnostics().is_empty());

        // Add a diagnostic
        let diagnostic = type_mismatch(&context, &context.arena[id1], &context.arena[id2], None);
        context.record_diagnostic(diagnostic);

        // Take diagnostics should return the recorded diagnostic and clear
        let diagnostics = context.take_diagnostics();
        assert_eq!(diagnostics.len(), 1);

        // Should be empty after taking
        assert!(context.take_diagnostics().is_empty());
    }
}
