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

    #[must_use]
    pub fn new_empty(source: SpanId, heap: &'heap Heap) -> Self {
        Self {
            source,

            heap,
            types: ConcurrentArena::new(),
            interner: Interner::new_empty(heap),

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
    pub environment: &'env Environment<'heap>,
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

    // Two types are disjoint if neither is a subtype of the other
    // This means they share no common values and their intersection is empty
    pub fn is_disjoint(&mut self, lhs: TypeId, rhs: TypeId) -> bool {
        self.analysis.is_disjoint(lhs, rhs)
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
    simplify_lattice: bool,

    simplify: SimplifyEnvironment<'env, 'heap>,
}

impl<'env, 'heap> LatticeEnvironment<'env, 'heap> {
    pub fn new(environment: &'env Environment<'heap>) -> Self {
        Self {
            environment,
            boundary: RecursionBoundary::new(),
            diagnostics: Diagnostics::new(),
            simplify_lattice: true,
            simplify: SimplifyEnvironment::new(environment),
        }
    }

    pub const fn without_simplify(&mut self) -> &mut Self {
        self.simplify_lattice = false;
        self
    }

    /// Handling recursive type cycles during a join operation.
    ///
    /// For recursive types, the join (least upper bound) requires careful handling.
    /// Subtyping and equivalence both use coinductive reasoning to resolve recursive types.
    ///
    /// Example:
    /// For `type A = (Integer, A)` and `type B = (Number, B)`:
    /// - `A <: B` (`Integer <: Number`)
    /// - `join(A, B)` should be `B`, since `B` is the supertype
    ///
    /// Returning Never (bottom) would be incorrect because:
    /// 1. In lattice theory, `join(x, y)` must be >= both `x` and `y`
    /// 2. The bottom type is <= every type, violating lattice properties
    /// 3. This contradicts our coinductive approach to recursive types
    ///
    /// Similarly, returning Unknown (top) would also be incorrect because:
    /// 1. The join should be the *least* upper bound of the types
    /// 2. Unknown is *always* an upper bound, but rarely the *least* upper bound
    /// 3. This would make nearly all joins between recursive types equivalent regardless of their
    ///    structure, losing precision in the type system
    /// 4. In our example with `A = (Integer, A)` and `B = (Number, B)`, the join should preserve
    ///    the relationship structure rather than collapsing to Unknown
    ///
    /// We determine the proper join based on subtyping relationships:
    /// - If one is a subtype of the other, the supertype is the join
    /// - Otherwise, we form a union type (standard lattice behavior)
    ///
    /// See <https://en.wikipedia.org/wiki/Coinduction> and
    /// Chapter 21.1 of "Types and Programming Languages" by Benjamin C. Pierce
    fn join_recursive(&mut self, lhs: Type<'heap>, rhs: Type<'heap>) -> TypeId {
        // Record diagnostic for awareness but don't treat as fatal
        self.diagnostics
            .push(circular_type_reference(self.source, lhs, rhs));

        // If one type is a subtype of the other, return the supertype
        if self.simplify.is_subtype_of(lhs.id, rhs.id) {
            return rhs.id;
        } else if self.simplify.is_subtype_of(rhs.id, lhs.id) {
            return lhs.id;
        }

        // If they aren't in a subtyping relationship, create a union type
        let kind = self.environment.intern_kind(TypeKind::Union(UnionType {
            variants: self.intern_type_ids(&[lhs.id, rhs.id]),
        }));

        self.environment.alloc(|id| Type {
            id,
            span: lhs.span,
            kind,
        })
    }

    pub fn join(&mut self, lhs: TypeId, rhs: TypeId) -> TypeId {
        let lhs = self.environment.types[lhs].copied();
        let rhs = self.environment.types[rhs].copied();

        if !self.boundary.enter(lhs.id, rhs.id) {
            return self.join_recursive(lhs, rhs);
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
            let id = variants[0];

            if self.simplify_lattice {
                self.simplify.simplify(id)
            } else {
                id
            }
        } else {
            let kind = self.environment.intern_kind(TypeKind::Union(UnionType {
                variants: self.intern_type_ids(&variants),
            }));

            let id = self.environment.alloc(|id| Type {
                id,
                span: lhs.span,
                kind,
            });

            if self.simplify_lattice {
                self.simplify.simplify(id)
            } else {
                id
            }
        };

        self.boundary.exit(lhs.id, rhs.id);
        result
    }

    /// Handle recursive type cycles during a meet operation.
    ///
    /// For recursive types, the meet (greatest lower bound) requires careful handling.
    /// Subtyping and equivalence both use coinductive reasoning to resolve recursive types.
    ///
    /// Example:
    /// For `type A = (Integer, A)` and `type B = (Number, B)`:
    /// - `A <: B` (`Integer <: Number`)
    /// - `meet(A, B)` should be `A`, since `A` is the subtype
    ///
    /// Returning Unknown (top) would be incorrect because:
    /// 1. In lattice theory, `meet(x, y)` must be <= both `x` and `y`
    /// 2. The top type is >= every type, violating lattice properties
    /// 3. This contradicts our coinductive approach to recursive types
    ///
    /// Similarly, returning Never (bottom) would also be incorrect because:
    /// 1. The meet should be the *greatest* lower bound of the types
    /// 2. Never is *always* a lower bound, but rarely the *greatest* lower bound
    /// 3. This would make nearly all meets between recursive types equivalent regardless of their
    ///    structure, losing precision in the type system
    /// 4. In our example with `A = (Integer, A)` and `B = (Number, B)`, the meet should preserve
    ///    the relationship structure (resulting in `A`) rather than collapsing to `Never`, which
    ///    would discard the recursive relationship
    /// 5. Returning `Never` would only be correct if the types are truly disjoint, which cannot be
    ///    determined just by encountering recursion
    ///
    /// We determine the proper meet based on subtyping relationships:
    /// - If one is a subtype of the other, the subtype is the meet
    /// - Otherwise, we form an intersection type (standard lattice behavior)
    ///
    /// See <https://en.wikipedia.org/wiki/Coinduction> and
    /// Chapter 21.1 of "Types and Programming Languages" by Benjamin C. Pierce
    fn meet_recursive(&mut self, lhs: Type<'heap>, rhs: Type<'heap>) -> TypeId {
        // Record diagnostic for awareness but don't treat as fatal
        self.diagnostics
            .push(circular_type_reference(self.source, lhs, rhs));

        // If one type is a subtype of the other, return the subtype
        if self.simplify.is_subtype_of(lhs.id, rhs.id) {
            return lhs.id;
        } else if self.simplify.is_subtype_of(rhs.id, lhs.id) {
            return rhs.id;
        }

        // If they aren't in a subtyping relationship, create an intersection type
        let kind = self
            .environment
            .intern_kind(TypeKind::Intersection(IntersectionType {
                variants: self.intern_type_ids(&[lhs.id, rhs.id]),
            }));

        self.environment.alloc(|id| Type {
            id,
            span: lhs.span,
            kind,
        })
    }

    pub fn meet(&mut self, lhs: TypeId, rhs: TypeId) -> TypeId {
        let lhs = self.environment.types[lhs].copied();
        let rhs = self.environment.types[rhs].copied();

        if !self.boundary.enter(lhs.id, rhs.id) {
            return self.meet_recursive(lhs, rhs);
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
            let id = variants[0];

            if self.simplify_lattice {
                self.simplify.simplify(id)
            } else {
                id
            }
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

            if self.simplify_lattice {
                self.simplify.simplify(id)
            } else {
                id
            }
        };

        self.boundary.exit(lhs.id, rhs.id);
        result
    }

    pub fn is_bottom(&mut self, id: TypeId) -> bool {
        self.simplify.is_bottom(id)
    }

    pub fn is_top(&mut self, id: TypeId) -> bool {
        self.simplify.is_top(id)
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

    pub fn fatal_diagnostics(&self) -> usize {
        self.diagnostics.as_ref().map_or(0, Diagnostics::fatal)
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

    pub fn is_disjoint(&mut self, lhs: TypeId, rhs: TypeId) -> bool {
        let lhs = self.environment.types[lhs].copied();
        let rhs = self.environment.types[rhs].copied();

        !lhs.is_subtype_of(rhs, self) && !rhs.is_subtype_of(lhs, self)
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

    /// Handling of recursive types on subtype checks
    ///
    /// For recursive types, we use coinductive reasoning when determining subtyping
    /// relationships. When we encounter the same subtyping check again during recursion,
    /// we should return true to maintain the coinductive assumption.
    ///
    /// Example:
    /// For `type A = (Integer, A)` and `type B = (Number, B)`,
    /// to check if A <: B, we need to check if (Integer, A) <: (Number, B)
    /// This involves checking:
    ///   1. Integer <: Number (true)
    ///   2. A <: B (the original question)
    ///
    /// When we reach step 2, we encounter the same check we started with.
    /// By returning true here, we complete the coinductive proof,
    /// confirming A <: B if their non-recursive parts satisfy the subtyping relation.
    ///
    /// This implementation adheres to two fundamental coinductive principles:
    ///
    /// 1. **F-closure**: We assume the recursive subtype relationship holds, adding it to our
    ///    relation. This means if (A,B) is in our relation, then all structurally derived pairs
    ///    should also be in the relation.
    ///
    /// 2. **F-consistency**: For each subtyping pair in our assumed relation, we verify it can be
    ///    justified by the subtyping rules applied to other pairs. We check all non-recursive
    ///    components to ensure they maintain the expected relationship.
    ///
    /// By returning `true` upon cycle detection, we're allowing the coinductive hypothesis to
    /// stand if no contradictions are found in the non-recursive parts, which matches formal
    /// coinductive definitions of subtyping for recursive types.
    ///
    /// See <https://en.wikipedia.org/wiki/Coinduction> and
    /// Chapter 21.1 of "Types and Programming Languages" by Benjamin C. Pierce
    #[inline]
    fn is_subtype_of_recursive(&mut self, subtype: Type<'heap>, supertype: Type<'heap>) -> bool {
        // Issue a non-fatal diagnostic to inform that a cycle was detected, but don't treat
        // it as an error for subtyping.
        let _: ControlFlow<()> =
            self.record_diagnostic(|env| circular_type_reference(env.source, subtype, supertype));

        true
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
            return self.is_subtype_of_recursive(subtype, supertype);
        }

        if let Some(result) = Self::is_quick_subtype(&subtype, &supertype) {
            self.boundary.exit(subtype.id, supertype.id);

            return result;
        }

        let result = subtype.is_subtype_of(supertype, self);

        self.boundary.exit(subtype.id, supertype.id);

        result
    }

    /// Handling recursive type cycles during equivalence checks.
    ///
    /// For recursive types, equivalence is also determined using coinductive reasoning.
    /// When checking if two recursive types are equivalent, we initially assume they
    /// might be equivalent and check their constituent parts.
    ///
    /// Example:
    /// For `type A = (Number, A)` and `type B = (Number, B)`,
    /// to check if A ≡ B, we check if (Number, A) ≡ (Number, B)
    /// This involves checking:
    ///   1. Number ≡ Number (true)
    ///   2. A ≡ B (the original question)
    ///
    /// When we reach step 2, we're back to our original question.
    /// By returning true here, we complete the coinductive proof,
    /// confirming A ≡ B if their non-recursive parts are equivalent.
    ///
    /// This implementation adheres to two fundamental coinductive principles:
    ///
    /// 1. **F-closure**: We assume the recursive equivalence relationship holds, adding it to our
    ///    relation. This means if (A,B) is in our relation, then all structurally derived pairs
    ///    should also be in the relation.
    ///
    /// 2. **F-consistency**: For each equivalence pair in our assumed relation, we verify it can be
    ///    justified by applying equivalence rules to other pairs. We check all non-recursive
    ///    components to ensure they maintain the expected equivalence.
    ///
    /// By returning `true` upon cycle detection, we're allowing the coinductive hypothesis to
    /// stand if no contradictions are found in the non-recursive parts, which matches formal
    /// coinductive definitions of type equivalence for recursive types.
    ///
    /// See <https://en.wikipedia.org/wiki/Coinduction> and
    /// Chapter 21.1 of "Types and Programming Languages" by Benjamin C. Pierce
    #[inline]
    fn is_equivalent_recursive(&mut self, lhs: Type<'heap>, rhs: Type<'heap>) -> bool {
        // Issue a non-fatal diagnostic to inform that a cycle was detected, but don't treat
        // it as an error for subtyping.
        let _: ControlFlow<()> =
            self.record_diagnostic(|env| circular_type_reference(env.source, lhs, rhs));

        true
    }

    pub fn is_equivalent(&mut self, lhs: TypeId, rhs: TypeId) -> bool {
        if lhs == rhs {
            return true;
        }

        let lhs = self.environment.types[lhs].copied();
        let rhs = self.environment.types[rhs].copied();

        if !self.boundary.enter(lhs.id, rhs.id) {
            return self.is_equivalent_recursive(lhs, rhs);
        }

        if core::ptr::eq(lhs.kind, rhs.kind) {
            self.boundary.exit(lhs.id, rhs.id);

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
