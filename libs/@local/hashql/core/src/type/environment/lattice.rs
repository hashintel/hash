use core::ops::Deref;

use smallvec::SmallVec;

use super::{Diagnostics, Environment, SimplifyEnvironment};
use crate::{
    symbol::Ident,
    r#type::{
        PartialType, Type, TypeId,
        error::{circular_type_reference, recursive_type_projection},
        inference::{Substitution, VariableKind, VariableLookup},
        kind::{IntersectionType, TypeKind, UnionType},
        lattice::{Lattice as _, Projection},
        recursion::{RecursionBoundary, RecursionCycle},
    },
};

#[derive(Debug)]
pub struct LatticeEnvironment<'env, 'heap> {
    pub environment: &'env Environment<'heap>,
    pub diagnostics: Diagnostics,

    boundary: RecursionBoundary<'heap>,

    simplify_lattice: bool,
    inference: bool,

    simplify: SimplifyEnvironment<'env, 'heap>,
}

impl<'env, 'heap> LatticeEnvironment<'env, 'heap> {
    pub fn new(environment: &'env Environment<'heap>) -> Self {
        Self {
            environment,
            boundary: RecursionBoundary::new(),
            diagnostics: Diagnostics::new(),
            simplify_lattice: true,
            inference: false,
            simplify: SimplifyEnvironment::new(environment),
        }
    }

    #[inline]
    pub(crate) fn set_variables(&mut self, variables: VariableLookup) {
        self.simplify.set_variables(variables);
    }

    #[inline]
    pub(crate) fn set_substitution(&mut self, substitution: Substitution) {
        self.simplify.set_substitution(substitution);
    }

    #[inline]
    pub(crate) fn clear_substitution(&mut self) {
        self.simplify.clear_substitution();
    }

    #[inline]
    pub(crate) const fn substitution_mut(&mut self) -> Option<&mut Substitution> {
        self.simplify.substitution_mut()
    }

    #[inline]
    pub(crate) fn contains_substitution(&self, kind: VariableKind) -> bool {
        self.simplify.contains_substitution(kind)
    }

    pub const fn without_simplify(&mut self) -> &mut Self {
        self.simplify_lattice = false;
        self
    }

    pub fn take_diagnostics(&mut self) -> Diagnostics {
        let mut this = core::mem::take(&mut self.diagnostics);
        let simplify = self.simplify.take_diagnostics();

        if let Some(simplify) = simplify {
            this.merge(simplify);
        }

        this
    }

    pub const fn set_inference_enabled(&mut self, enabled: bool) -> &mut Self {
        self.inference = enabled;
        self
    }

    pub(crate) const fn is_inference_enabled(&self) -> bool {
        self.inference
    }

    #[inline]
    pub(crate) fn resolve_type(&self, r#type: Type<'heap>) -> Option<Type<'heap>> {
        self.simplify.resolve_type(r#type)
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
    fn join_recursive(
        &mut self,
        lhs: Type<'heap>,
        rhs: Type<'heap>,
        cycle: RecursionCycle,
    ) -> TypeId {
        // Record diagnostic for awareness but don't treat as fatal
        self.diagnostics
            .push(circular_type_reference(self.source, lhs, rhs));

        if cycle.should_discharge() {
            return lhs.id;
        }

        // If they aren't in a subtyping relationship, create a union type
        let kind = self.environment.intern_kind(TypeKind::Union(UnionType {
            variants: self.intern_type_ids(&[lhs.id, rhs.id]),
        }));

        self.environment.intern_type(PartialType {
            span: lhs.span,
            kind,
        })
    }

    pub fn join(&mut self, lhs: TypeId, rhs: TypeId) -> TypeId {
        let lhs = self.environment.r#type(lhs);
        let rhs = self.environment.r#type(rhs);

        if self.boundary.enter(lhs, rhs).is_break() {
            let cycle = RecursionCycle {
                lhs: self.is_recursive(lhs.id),
                rhs: self.is_recursive(rhs.id),
            };

            return self.join_recursive(lhs, rhs, cycle);
        }

        let variants = lhs.join(rhs, self);

        let result = if variants.is_empty() {
            let kind = self.environment.intern_kind(TypeKind::Never);

            self.environment.intern_type(PartialType {
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

            let id = self.environment.intern_type(PartialType {
                span: lhs.span,
                kind,
            });

            if self.simplify_lattice {
                self.simplify.simplify(id)
            } else {
                id
            }
        };

        self.boundary.exit(lhs, rhs);
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
    fn meet_recursive(
        &mut self,
        lhs: Type<'heap>,
        rhs: Type<'heap>,
        cycle: RecursionCycle,
    ) -> TypeId {
        // Record diagnostic for awareness but don't treat as fatal
        self.diagnostics
            .push(circular_type_reference(self.source, lhs, rhs));

        if cycle.should_discharge() {
            return lhs.id;
        }

        // If they aren't in a subtyping relationship, create an intersection type
        let kind = self
            .environment
            .intern_kind(TypeKind::Intersection(IntersectionType {
                variants: self.intern_type_ids(&[lhs.id, rhs.id]),
            }));

        self.environment.intern_type(PartialType {
            span: lhs.span,
            kind,
        })
    }

    pub fn meet(&mut self, lhs: TypeId, rhs: TypeId) -> TypeId {
        let lhs = self.environment.r#type(lhs);
        let rhs = self.environment.r#type(rhs);

        if self.boundary.enter(lhs, rhs).is_break() {
            let cycle = RecursionCycle {
                lhs: self.is_recursive(lhs.id),
                rhs: self.is_recursive(rhs.id),
            };

            return self.meet_recursive(lhs, rhs, cycle);
        }

        let variants = lhs.meet(rhs, self);

        let result = if variants.is_empty() {
            // No common variant, therefore `Never`.
            let kind = self.environment.intern_kind(TypeKind::Never);

            self.environment.intern_type(PartialType {
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

            let id = self.environment.intern_type(PartialType {
                span: lhs.span,
                kind,
            });

            if self.simplify_lattice {
                self.simplify.simplify(id)
            } else {
                id
            }
        };

        self.boundary.exit(lhs, rhs);
        result
    }

    pub fn projection(&mut self, id: TypeId, field: Ident<'heap>) -> Projection {
        let r#type = self.environment.r#type(id);

        if self.boundary.enter(r#type, r#type).is_break() {
            self.diagnostics
                .push(recursive_type_projection(r#type, field, self));
            return Projection::Error;
        }

        let result = r#type.projection(field, self);

        self.boundary.exit(r#type, r#type);
        result
    }

    #[inline]
    pub fn is_bottom(&mut self, id: TypeId) -> bool {
        self.simplify.is_bottom(id)
    }

    #[inline]
    pub fn is_top(&mut self, id: TypeId) -> bool {
        self.simplify.is_top(id)
    }

    #[inline]
    pub fn is_subtype_of(&mut self, subtype: TypeId, supertype: TypeId) -> bool {
        self.simplify.is_subtype_of(subtype, supertype)
    }

    #[inline]
    pub fn is_equivalent(&mut self, lhs: TypeId, rhs: TypeId) -> bool {
        self.simplify.is_equivalent(lhs, rhs)
    }

    #[inline]
    pub fn is_concrete(&mut self, id: TypeId) -> bool {
        self.simplify.is_concrete(id)
    }

    #[inline]
    pub fn is_recursive(&mut self, id: TypeId) -> bool {
        self.simplify.is_recursive(id)
    }

    #[inline]
    pub fn distribute_union(&mut self, id: TypeId) -> SmallVec<TypeId, 16> {
        self.simplify.distribute_union(id)
    }

    #[inline]
    pub fn distribute_intersection(&mut self, id: TypeId) -> SmallVec<TypeId, 16> {
        self.simplify.distribute_intersection(id)
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
