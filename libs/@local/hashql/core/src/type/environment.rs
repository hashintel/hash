use core::ops::Deref;

use scc::HashSet;

use super::{
    Type, TypeId, TypeKind,
    error::{TypeCheckDiagnostic, circular_type_reference},
    kind::{intersection::IntersectionType, primitive::PrimitiveType, union::UnionType},
    lattice::Lattice as _,
    recursion::RecursionBoundary,
    unify_type_impl,
};
use crate::{arena::concurrent::ConcurrentArena, heap::Heap, span::SpanId};

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

pub struct Diagnostics {
    inner: Vec<TypeCheckDiagnostic>,
    fatal: usize,
}

impl Diagnostics {
    pub fn new() -> Self {
        Self {
            inner: Vec::new(),
            fatal: 0,
        }
    }

    pub fn take(&mut self) -> Vec<TypeCheckDiagnostic> {
        std::mem::take(&mut self.inner)
    }

    pub fn replace(&mut self, diagnostics: Vec<TypeCheckDiagnostic>) {
        self.fatal = diagnostics
            .iter()
            .filter(|diagnostic| diagnostic.severity.is_fatal())
            .count();

        self.inner = diagnostics;
    }

    pub fn fatal(&mut self) -> usize {
        self.fatal
    }

    pub fn push(&mut self, diagnostic: TypeCheckDiagnostic) {
        if diagnostic.severity.is_fatal() {
            self.fatal += 1;
        }

        self.inner.push(diagnostic);
    }
}

#[derive(Debug, Clone)]
pub struct Environment<'heap> {
    pub source: SpanId,

    pub heap: &'heap Heap,
    kinds: HashSet<&'heap TypeKind, foldhash::fast::RandomState>,
    pub types: ConcurrentArena<Type<'heap>>,
}

impl<'heap> Environment<'heap> {
    #[must_use]
    pub fn new(source: SpanId, heap: &'heap Heap) -> Self {
        let this = Self {
            source,

            heap,
            kinds: HashSet::default(),
            types: ConcurrentArena::new(),
        };

        this.prefill();

        this
    }

    fn prefill(&self) {
        self.kinds
            .insert(self.heap.alloc(TypeKind::Never))
            .expect("never should be unique");
        self.kinds
            .insert(self.heap.alloc(TypeKind::Unknown))
            .expect("unknown should be unique");
        self.kinds
            .insert(self.heap.alloc(TypeKind::Infer))
            .expect("infer should be unique");

        self.kinds
            .insert(self.heap.alloc(TypeKind::Primitive(PrimitiveType::Number)))
            .expect("number should be unique");
        self.kinds
            .insert(self.heap.alloc(TypeKind::Primitive(PrimitiveType::Integer)))
            .expect("integer should be unique");
        self.kinds
            .insert(self.heap.alloc(TypeKind::Primitive(PrimitiveType::String)))
            .expect("string should be unique");
        self.kinds
            .insert(self.heap.alloc(TypeKind::Primitive(PrimitiveType::Boolean)))
            .expect("boolean should be unique");
        self.kinds
            .insert(self.heap.alloc(TypeKind::Primitive(PrimitiveType::Null)))
            .expect("null should be unique");
    }

    pub fn intern(&self, kind: TypeKind) -> &'heap TypeKind {
        if let Some(kind) = self.kinds.read(&kind, |kind| *kind) {
            kind
        } else {
            let kind = self.heap.alloc(kind);
            self.kinds.insert(kind);
            kind
        }
    }

    pub fn alloc(&self, with: impl FnOnce(TypeId) -> Type<'heap>) -> TypeId {
        self.types.push_with(with)
    }
}

pub struct UnificationEnvironment<'env, 'heap> {
    environment: &'env Environment<'heap>,
    boundary: RecursionBoundary,

    pub variance: Variance,
    pub diagnostics: Diagnostics,
}

impl<'env, 'heap> UnificationEnvironment<'env, 'heap> {
    pub fn new(environment: &'env Environment<'heap>) -> Self {
        Self {
            environment,
            boundary: RecursionBoundary::new(),
            variance: Variance::default(),
            diagnostics: Diagnostics::new(),
        }
    }

    pub fn unify_type(&mut self, lhs: TypeId, rhs: TypeId) {
        if !self.boundary.enter(lhs, rhs) {
            // We've detected a circular reference in the type graph
            let lhs_type = self.environment.types[lhs].copied();
            let rhs_type = self.environment.types[rhs].copied();

            let diagnostic = circular_type_reference(self.environment.source, lhs_type, rhs_type);

            self.diagnostics.push(diagnostic);
            return;
        }

        unify_type_impl(self, lhs, rhs);

        self.boundary.exit(lhs, rhs);
    }

    pub(crate) fn structurally_equivalent(&self, lhs: TypeId, rhs: TypeId) -> bool {
        let mut environment = EquivalenceEnvironment::new(self.environment);

        environment.semantically_equivalent(lhs, rhs)
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
}

// We usually try to avoid `Deref` and `DerefMut`, but it makes sense in this case.
// As the unification environment is just a wrapper around the environment with an additional guard.
impl<'heap> Deref for UnificationEnvironment<'_, 'heap> {
    type Target = Environment<'heap>;

    fn deref(&self) -> &Self::Target {
        self.environment
    }
}

pub struct SimplifyEnvironment<'env, 'heap> {
    environment: &'env mut Environment<'heap>,
    boundary: RecursionBoundary,
}

impl<'env, 'heap> SimplifyEnvironment<'env, 'heap> {
    pub fn new(environment: &'env mut Environment<'heap>) -> Self {
        Self {
            environment,
            boundary: RecursionBoundary::new(),
        }
    }

    pub fn simplify(&mut self, id: TypeId) -> TypeId {
        let r#type = self.environment.types[id].copied();

        r#type.simplify(self)
    }
}

// We usually try to avoid `Deref` and `DerefMut`, but it makes sense in this case.
// As the unification environment is just a wrapper around the environment with an additional guard.
impl<'heap> Deref for SimplifyEnvironment<'_, 'heap> {
    type Target = Environment<'heap>;

    fn deref(&self) -> &Self::Target {
        self.environment
    }
}

pub struct LatticeEnvironment<'env, 'heap> {
    environment: &'env Environment<'heap>,
    boundary: RecursionBoundary,
}

impl<'env, 'heap> LatticeEnvironment<'env, 'heap> {
    pub fn new(environment: &'env Environment<'heap>) -> Self {
        Self {
            environment,
            boundary: RecursionBoundary::new(),
        }
    }

    pub fn join(&mut self, lhs: TypeId, rhs: TypeId) -> TypeId {
        let lhs = self.environment.types[lhs].copied();
        let rhs = self.environment.types[rhs].copied();

        let variants = lhs.join(rhs, self);

        if variants.is_empty() {
            let kind = self.environment.intern(TypeKind::Never);

            self.environment.alloc(|id| Type {
                id,
                span: lhs.span,
                kind,
            })
        } else if variants.len() == 1 {
            variants[0]
        } else {
            let kind = self.environment.intern(TypeKind::Union(UnionType {
                variants: variants.into_iter().collect(),
            }));

            self.environment.alloc(|id| Type {
                id,
                span: lhs.span,
                kind,
            })
        }
    }

    pub fn meet(&mut self, lhs: TypeId, rhs: TypeId) -> TypeId {
        let lhs = self.environment.types[lhs].copied();
        let rhs = self.environment.types[rhs].copied();

        let variants = lhs.meet(rhs, self);

        if variants.is_empty() {
            let kind = self.environment.intern(TypeKind::Never);

            self.environment.alloc(|id| Type {
                id,
                span: lhs.span,
                kind,
            })
        } else if variants.len() == 1 {
            variants[0]
        } else {
            let kind = self
                .environment
                .intern(TypeKind::Intersection(IntersectionType {
                    variants: variants.into_iter().collect(),
                }));

            self.environment.alloc(|id| Type {
                id,
                span: lhs.span,
                kind,
            })
        }
    }
}

// We usually try to avoid `Deref` and `DerefMut`, but it makes sense in this case.
// As the unification environment is just a wrapper around the environment with an additional guard.
impl<'heap> Deref for LatticeEnvironment<'_, 'heap> {
    type Target = Environment<'heap>;

    fn deref(&self) -> &Self::Target {
        self.environment
    }
}

pub struct TypeAnalysisEnvironment<'env, 'heap> {
    environment: &'env Environment<'heap>,
    boundary: RecursionBoundary,
}

impl<'env, 'heap> TypeAnalysisEnvironment<'env, 'heap> {
    #[must_use]
    pub fn new(environment: &'env Environment<'heap>) -> Self {
        Self {
            environment,
            boundary: RecursionBoundary::new(),
        }
    }

    pub fn uninhabited(&mut self, id: TypeId) -> bool {
        let r#type = self.environment.types[id].copied();

        r#type.uninhabited(self)
    }
}

// We usually try to avoid `Deref` and `DerefMut`, but it makes sense in this case.
// As the unification environment is just a wrapper around the environment with an additional guard.
impl<'heap> Deref for TypeAnalysisEnvironment<'_, 'heap> {
    type Target = Environment<'heap>;

    fn deref(&self) -> &Self::Target {
        self.environment
    }
}

pub struct EquivalenceEnvironment<'env, 'heap> {
    environment: &'env Environment<'heap>,
    boundary: RecursionBoundary,
}

impl<'env, 'heap> EquivalenceEnvironment<'env, 'heap> {
    #[must_use]
    pub fn new(environment: &'env Environment<'heap>) -> Self {
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
    pub fn semantically_equivalent(&mut self, lhs: TypeId, rhs: TypeId) -> bool {
        let lhs_type = self.environment.types[lhs].copied();
        let rhs_type = self.environment.types[rhs].copied();

        if !self.boundary.enter(lhs, rhs) {
            // In case of recursion the result is true
            return true;
        }

        let result = lhs_type.semantically_equivalent(rhs_type, self);

        self.boundary.exit(lhs, rhs);

        result
    }
}

// We usually try to avoid `Deref` and `DerefMut`, but it makes sense in this case.
// As the unification environment is just a wrapper around the environment with an additional guard.
impl<'heap> Deref for EquivalenceEnvironment<'_, 'heap> {
    type Target = Environment<'heap>;

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
            kind::primitive::PrimitiveType,
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
