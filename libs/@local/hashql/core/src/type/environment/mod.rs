pub mod auxiliary;
pub mod diagnostics;
pub mod substitution;
pub mod variance;

use core::ops::{ControlFlow, Deref};

use self::{
    auxiliary::AuxiliaryData, diagnostics::Diagnostics, substitution::Substitution,
    variance::Variance,
};
use super::{
    Type, TypeId, TypeKind,
    error::{TypeCheckDiagnostic, circular_type_reference},
    intern::Interner,
    kind::{generic_argument::GenericArgument, intersection::IntersectionType, union::UnionType},
    lattice::Lattice as _,
    recursion::RecursionBoundary,
};
use crate::{arena::concurrent::ConcurrentArena, heap::Heap, span::SpanId};

#[derive(Debug)]
pub struct Environment<'heap> {
    pub source: SpanId,

    pub heap: &'heap Heap,
    pub types: ConcurrentArena<Type<'heap>>,
    interner: Interner<'heap>,

    pub auxiliary: AuxiliaryData,
    pub substitution: Substitution,
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
            substitution: Substitution::new(),
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

pub struct SimplifyEnvironment<'env, 'heap> {
    environment: &'env Environment<'heap>,
    boundary: RecursionBoundary,

    // lattice: LatticeEnvironment<'env, 'heap>,
    analysis: TypeAnalysisEnvironment<'env, 'heap>,
}

impl<'env, 'heap> SimplifyEnvironment<'env, 'heap> {
    pub fn new(environment: &'env Environment<'heap>) -> Self {
        Self {
            environment,
            boundary: RecursionBoundary::new(),
            // lattice: LatticeEnvironment::new(environment),
            analysis: TypeAnalysisEnvironment::new(environment),
        }
    }

    pub fn is_equivalent(&mut self, lhs: TypeId, rhs: TypeId) -> bool {
        self.analysis.is_equivalent(lhs, rhs)
    }

    pub fn is_subtype_of(&mut self, subtype: TypeId, supertype: TypeId) -> bool {
        self.analysis.is_subtype_of(subtype, supertype)
    }

    pub fn is_bottom(&mut self, id: TypeId) -> bool {
        self.analysis.is_bottom(id)
    }

    pub fn is_top(&mut self, id: TypeId) -> bool {
        self.analysis.is_top(id)
    }

    pub fn simplify(&mut self, id: TypeId) -> TypeId {
        if !self.boundary.enter(id, id) {
            // We have discovered a recursive type, as such we stop simplification
            return id;
        }

        let r#type = self.environment.types[id].copied();
        let result = r#type.simplify(self);

        self.boundary.exit(id, id);
        result
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
    pub diagnostics: Diagnostics,

    simplify: SimplifyEnvironment<'env, 'heap>,
}

impl<'env, 'heap> LatticeEnvironment<'env, 'heap> {
    pub fn new(environment: &'env Environment<'heap>) -> Self {
        Self {
            environment,
            boundary: RecursionBoundary::new(),
            diagnostics: Diagnostics::new(),
            simplify: SimplifyEnvironment::new(environment),
        }
    }

    pub fn join(&mut self, lhs: TypeId, rhs: TypeId) -> TypeId {
        let lhs = self.environment.types[lhs].copied();
        let rhs = self.environment.types[rhs].copied();

        if !self.boundary.enter(lhs.id, rhs.id) {
            // We have a recursive type, do not attempt to stop any join outside forcefully, instead
            // return `Never` and record a fatal diagnostic.
            self.diagnostics
                .push(circular_type_reference(self.source, lhs, rhs));

            return self.environment.alloc(|id| Type {
                id,
                span: lhs.span,
                kind: self.environment.intern_kind(TypeKind::Never),
            });
        }

        let variants = lhs.join(rhs, self);

        let result = if variants.is_empty() {
            let kind = self.environment.intern_kind(TypeKind::Never);

            self.environment.alloc(|id| Type {
                id,
                span: lhs.span,
                kind,
            })
        } else if variants.len() == 1 {
            variants[0]
        } else {
            let kind = self.environment.intern_kind(TypeKind::Union(UnionType {
                variants: self.intern_type_ids(&variants),
            }));

            let id = self.environment.alloc(|id| Type {
                id,
                span: lhs.span,
                kind,
            });

            self.simplify.simplify(id)
        };

        self.boundary.exit(lhs.id, rhs.id);
        result
    }

    pub fn meet(&mut self, lhs: TypeId, rhs: TypeId) -> TypeId {
        let lhs = self.environment.types[lhs].copied();
        let rhs = self.environment.types[rhs].copied();

        if !self.boundary.enter(lhs.id, rhs.id) {
            // We have detected a recursive type, do not attempt to join any other meet forcefully,
            // instead return `Unknown` and record a diagnostic.
            self.diagnostics
                .push(circular_type_reference(self.source, lhs, rhs));

            return self.environment.alloc(|id| Type {
                id,
                span: lhs.span,
                kind: self.environment.intern_kind(TypeKind::Unknown),
            });
        }

        let variants = lhs.meet(rhs, self);

        let result = if variants.is_empty() {
            // No common variant, therefore `Never`.
            let kind = self.environment.intern_kind(TypeKind::Never);

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
                .intern_kind(TypeKind::Intersection(IntersectionType {
                    variants: self.intern_type_ids(&variants),
                }));

            let id = self.environment.alloc(|id| Type {
                id,
                span: lhs.span,
                kind,
            });

            self.simplify.simplify(id)
        };

        self.boundary.exit(lhs.id, rhs.id);
        result
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
    diagnostics: Option<Diagnostics>,
    variance: Variance,
}

impl<'env, 'heap> TypeAnalysisEnvironment<'env, 'heap> {
    #[must_use]
    pub fn new(environment: &'env Environment<'heap>) -> Self {
        Self {
            environment,
            boundary: RecursionBoundary::new(),
            diagnostics: None,
            variance: Variance::Covariant,
        }
    }

    pub fn with_diagnostics(&mut self) -> &mut Self {
        self.diagnostics = Some(Diagnostics::new());

        self
    }

    pub fn take_diagnostics(&mut self) -> Vec<TypeCheckDiagnostic> {
        self.diagnostics
            .as_mut()
            .map_or_else(Vec::new, Diagnostics::take)
    }

    pub fn is_bottom(&mut self, id: TypeId) -> bool {
        if !self.boundary.enter(id, id) {
            // We have found a recursive type, meaning it can't be bottom
            return false;
        }

        let r#type = self.environment.types[id].copied();
        let result = r#type.is_bottom(self);

        self.boundary.exit(id, id);

        result
    }

    pub fn is_top(&mut self, id: TypeId) -> bool {
        if !self.boundary.enter(id, id) {
            // We have found a recursive type, meaning it can't be top
            return false;
        }

        let r#type = self.environment.types[id].copied();
        let result = r#type.is_top(self);

        self.boundary.exit(id, id);

        result
    }

    #[must_use]
    pub const fn is_fail_fast(&self) -> bool {
        self.diagnostics.is_none()
    }

    pub fn record_diagnostic(
        &mut self,
        diagnostic: impl FnOnce(&Environment<'heap>) -> TypeCheckDiagnostic,
    ) -> ControlFlow<()> {
        let Some(diagnostics) = self.diagnostics.as_mut() else {
            // Fail-fast mode: No diagnostics storage available
            // (typical for equivalence checks where we just need a yes/no answer)
            return ControlFlow::Break(());
        };

        // Record the diagnostic in fail-slow mode
        diagnostics.push(diagnostic(self.environment));

        // Return indication to continue processing
        // (used in type checking/unification to collect multiple errors)
        ControlFlow::Continue(())
    }

    fn is_quick_subtype(subtype: &Type<'heap>, supertype: &Type<'heap>) -> Option<bool> {
        if subtype.id == supertype.id {
            return Some(true);
        }

        if core::ptr::eq(subtype.kind, supertype.kind) {
            return Some(true);
        }

        if *subtype.kind == TypeKind::Never {
            return Some(true);
        }

        if *supertype.kind == TypeKind::Never {
            return Some(false);
        }

        if *subtype.kind == TypeKind::Unknown {
            return Some(true);
        }

        if *supertype.kind == TypeKind::Unknown {
            return Some(false);
        }

        None
    }

    pub fn is_subtype_of(&mut self, subtype: TypeId, supertype: TypeId) -> bool {
        let (subtype, supertype) = match self.variance {
            Variance::Covariant => (subtype, supertype),
            Variance::Contravariant => (supertype, subtype),
            Variance::Invariant => return self.is_equivalent(subtype, supertype),
        };

        let subtype = self.environment.types[subtype].copied();
        let supertype = self.environment.types[supertype].copied();

        if !self.boundary.enter(subtype.id, supertype.id) {
            // We have discovered a recursive type
            let _: ControlFlow<()> = self
                .record_diagnostic(|env| circular_type_reference(env.source, subtype, supertype));

            return false;
        }

        if let Some(result) = Self::is_quick_subtype(&subtype, &supertype) {
            return result;
        }

        if !self.boundary.enter(subtype.id, supertype.id) {
            // In case of recursion the result is true
            return true;
        }

        let result = subtype.is_subtype_of(supertype, self);

        self.boundary.exit(subtype.id, supertype.id);

        result
    }

    pub fn is_equivalent(&mut self, lhs: TypeId, rhs: TypeId) -> bool {
        if lhs == rhs {
            return true;
        }

        let lhs = self.environment.types[lhs].copied();
        let rhs = self.environment.types[rhs].copied();

        if !self.boundary.enter(lhs.id, rhs.id) {
            // A recursive type cannot be equivalent to another type
            let _: ControlFlow<()> =
                self.record_diagnostic(|env| circular_type_reference(env.source, lhs, rhs));

            return false;
        }

        if core::ptr::eq(lhs.kind, rhs.kind) {
            return true;
        }

        let result = lhs.is_equivalent(rhs, self);

        self.boundary.exit(lhs.id, rhs.id);

        result
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
impl<'heap> Deref for TypeAnalysisEnvironment<'_, 'heap> {
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
        r#type::environment::{Environment, TypeAnalysisEnvironment, Variance},
    };

    #[test]
    fn variance_context() {
        let heap = Heap::new();
        let environment = Environment::new(SpanId::SYNTHETIC, &heap);
        let mut env = TypeAnalysisEnvironment::new(&environment);

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
