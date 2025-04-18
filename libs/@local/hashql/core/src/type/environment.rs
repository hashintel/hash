use core::ops::Deref;

use hashbrown::HashMap;
use scc::HashSet;

use super::{
    Type, TypeId, TypeKind,
    error::{TypeCheckDiagnostic, circular_type_reference},
    intern::Interner,
    kind::{
        generic_argument::{GenericArgument, GenericArgumentData, GenericArgumentId},
        primitive::PrimitiveType,
    },
    lattice::Lattice as _,
    recursion::RecursionBoundary,
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
    #[must_use]
    pub const fn new() -> Self {
        Self {
            inner: Vec::new(),
            fatal: 0,
        }
    }

    pub fn take(&mut self) -> Vec<TypeCheckDiagnostic> {
        core::mem::take(&mut self.inner)
    }

    pub fn replace(&mut self, diagnostics: Vec<TypeCheckDiagnostic>) {
        self.fatal = diagnostics
            .iter()
            .filter(|diagnostic| diagnostic.severity.is_fatal())
            .count();

        self.inner = diagnostics;
    }

    #[must_use]
    pub const fn fatal(&self) -> usize {
        self.fatal
    }

    pub fn push(&mut self, diagnostic: TypeCheckDiagnostic) {
        if diagnostic.severity.is_fatal() {
            self.fatal += 1;
        }

        self.inner.push(diagnostic);
    }
}

impl Default for Diagnostics {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Debug)]
pub struct AuxiliaryData {
    pub arguments: HashMap<GenericArgumentId, GenericArgumentData, foldhash::fast::RandomState>,
}

impl AuxiliaryData {
    pub fn new() -> Self {
        Self {
            arguments: HashMap::default(),
        }
    }
}

#[derive(Debug)]
pub struct Environment<'heap> {
    pub source: SpanId,

    pub heap: &'heap Heap,
    pub types: ConcurrentArena<Type<'heap>>,
    interner: Interner<'heap>,

    pub auxiliary: AuxiliaryData,
}

impl<'heap> Environment<'heap> {
    #[must_use]
    pub fn new(source: SpanId, heap: &'heap Heap) -> Self {
        Self {
            source,

            heap,
            types: ConcurrentArena::new(),
            interner: Interner::new(heap),

            auxiliary: AuxiliaryData::new(),
        }
    }

    #[inline]
    pub fn alloc(&self, with: impl FnOnce(TypeId) -> Type<'heap>) -> TypeId {
        self.types.push_with(with)
    }

    #[inline]
    pub fn intern_kind(&self, kind: TypeKind<'heap>) -> &'heap TypeKind<'heap> {
        self.interner.intern_kind(kind)
    }

    #[inline]
    pub fn intern_type_ids(&self, ids: &[TypeId]) -> &'heap [TypeId] {
        self.interner.intern_type_ids(ids)
    }

    #[inline]
    pub fn intern_generic_arguments(
        &self,
        arguments: &[GenericArgument],
    ) -> &'heap [GenericArgument] {
        self.interner.intern_generic_arguments(arguments)
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

        // unify_type_impl(self, lhs, rhs);
        todo!("Implement type unification");

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
        // TODO: recursion boundary
        let r#type = self.environment.types[id].copied();

        r#type.simplify(self)
    }

    pub fn uninhabited(&mut self, id: TypeId) -> bool {
        let r#type = self.environment.types[id].copied();

        let mut env = TypeAnalysisEnvironment::new(self.environment);

        r#type.uninhabited(&mut env)
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
    pub environment: &'env Environment<'heap>,
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
            let kind = self.environment.intern_kind(TypeKind::Never);

            self.environment.alloc(|id| Type {
                id,
                span: lhs.span,
                kind,
            })
        } else if variants.len() == 1 {
            variants[0]
        } else {
            todo!()

            // let kind = self.environment.intern(TypeKind::Union(UnionType {
            //     variants: variants.into_iter().collect(),
            // }));

            // self.environment.alloc(|id| Type {
            //     id,
            //     span: lhs.span,
            //     kind,
            // })
        }
    }

    pub fn meet(&mut self, lhs: TypeId, rhs: TypeId) -> TypeId {
        let lhs = self.environment.types[lhs].copied();
        let rhs = self.environment.types[rhs].copied();

        let variants = lhs.meet(rhs, self);

        if variants.is_empty() {
            let kind = self.environment.intern_kind(TypeKind::Never);

            self.environment.alloc(|id| Type {
                id,
                span: lhs.span,
                kind,
            })
        } else if variants.len() == 1 {
            variants[0]
        } else {
            todo!()
            // let kind = self
            //     .environment
            //     .intern(TypeKind::Intersection(IntersectionType {
            //         variants: variants.into_iter().collect(),
            //     }));

            // self.environment.alloc(|id| Type {
            //     id,
            //     span: lhs.span,
            //     kind,
            // })
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
        heap::Heap,
        span::SpanId,
        r#type::environment::{Environment, UnificationEnvironment, Variance},
    };

    #[test]
    fn variance_context() {
        let heap = Heap::new();
        let environment = Environment::new(SpanId::SYNTHETIC, &heap);
        let mut env = UnificationEnvironment::new(&environment);

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
}
