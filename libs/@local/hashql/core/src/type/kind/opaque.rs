use core::ops::ControlFlow;

use smallvec::SmallVec;

use super::TypeKind;
use crate::{
    symbol::{Ident, Symbol},
    r#type::{
        PartialType, Type, TypeId,
        environment::{
            AnalysisEnvironment, Environment, InferenceEnvironment, LatticeEnvironment,
            SimplifyEnvironment, Variance, instantiate::InstantiateEnvironment,
        },
        error::opaque_type_name_mismatch,
        inference::Inference,
        lattice::{Lattice, Projection, Subscript},
    },
};

/// Represents a nominal type with an encapsulated representation.
///
/// Opaque types capture the concept of nominal typing, where type identity is determined by name
/// rather than structure. Two opaque types with different names are considered distinct types,
/// even if their representations are identical. This contrasts with structural typing where
/// compatibility is based on structure alone.
///
/// # Type System Design
///
/// This implementation uses a refined context-sensitive variance approach:
/// - For concrete types or when inference is disabled: Opaque types are **invariant** with respect
///   to their inner representation, enforcing strict nominal typing semantics.
/// - Only for non-concrete types during inference: Opaque types use a **covariant-like** approach
///   that allows them to act as "carriers" for inference variables.
///
/// This precise, context-sensitive approach provides several benefits:
/// 1. Proper constraint propagation for types containing inference variables
/// 2. Strict nominal type safety for all concrete types
/// 3. Clear separation between inference and checking phases
/// 4. Consistent variance behavior across the type system
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct OpaqueType<'heap> {
    pub name: Symbol<'heap>,
    pub repr: TypeId,
}

impl<'heap> OpaqueType<'heap> {
    /// Helper method for processing the results of join/meet operations on inner representations.
    ///
    /// This method handles the creation of new opaque types based on the join/meet results of
    /// their inner representations. It's a critical component of the "carrier" pattern used
    /// for non-concrete types during inference:
    ///
    /// 1. If the result matches one of the original representations, we reuse the original opaque
    ///    type
    /// 2. Otherwise, we create new opaque types that preserve the name but use the new
    ///    representations
    ///
    /// By preserving the opaque type's name while allowing its representation to evolve during
    /// inference, we effectively defer the invariance check until inference variables are resolved.
    /// This enables proper constraint propagation without compromising nominal type safety.
    fn postprocess_lattice(
        self: Type<'heap, Self>,
        result: SmallVec<TypeId, 4>,
        env: &Environment<'heap>,
    ) -> SmallVec<TypeId, 4> {
        if result.is_empty() {
            // Early exit if empty, that way we don't need to allocate an arguments if we aren't
            // going to use it
            return SmallVec::new();
        }

        result
            .into_iter()
            .map(|repr| {
                env.intern_type(PartialType {
                    span: self.span,
                    kind: env.intern_kind(TypeKind::Opaque(OpaqueType {
                        name: self.kind.name,
                        repr,
                    })),
                })
            })
            .collect()
    }
}

impl<'heap> Lattice<'heap> for OpaqueType<'heap> {
    /// Computes the join (least upper bound) of two opaque types.
    ///
    /// The join operation uses a refined context-sensitive approach:
    ///
    /// When inference is enabled AND at least one type contains inference variables:
    /// - If types have different names: Return a union of both types.
    /// - If types have the same name: Join their inner representations, allowing the opaque type to
    ///   act as a "carrier" for inference variables until they are resolved.
    ///
    /// Otherwise (for concrete types or when inference is disabled):
    /// - If types have different names: Return a union of both types.
    /// - If types have the same name but different representations: Return a union of both types.
    /// - If types have the same name and equivalent representations: Return the type itself.
    ///
    /// This approach maintains invariant behavior for concrete types while allowing inference
    /// variables to propagate constraints. It effectively defers the final invariance check until
    /// after inference has completed.
    fn join(
        self: Type<'heap, Self>,
        other: Type<'heap, Self>,
        env: &mut LatticeEnvironment<'_, 'heap>,
    ) -> SmallVec<TypeId, 4> {
        if self.kind.name != other.kind.name {
            return SmallVec::from_slice_copy(&[self.id, other.id]);
        }

        if env.is_inference_enabled()
            && (!env.is_concrete(self.kind.repr) || !env.is_concrete(other.kind.repr))
        {
            let self_repr = env.r#type(self.kind.repr);
            let other_repr = env.r#type(other.kind.repr);

            // We circumvent `env.join` here, by directly joining the representations. This is
            // intentional, so that we can propagate the join result instead of having a `Union`.
            let result = self_repr.join(other_repr, env);

            // If any of the types aren't concrete, we effectively convert ourselves into a
            // "carrier" to defer evaluation of the term, once inference is completed we'll simplify
            // and postprocess the result.
            self.postprocess_lattice(result, env.environment)
        } else if env.is_equivalent(self.kind.repr, other.kind.repr) {
            SmallVec::from_slice_copy(&[self.id])
        } else {
            SmallVec::from_slice_copy(&[self.id, other.id])
        }
    }

    /// Computes the meet (greatest lower bound) of two opaque types.
    ///
    /// The meet operation uses a refined context-sensitive approach:
    ///
    /// When inference is enabled AND at least one type contains inference variables:
    /// - If types have different names: Return Never (empty set).
    /// - If types have the same name: Meet their inner representations, allowing the opaque type to
    ///   act as a "carrier" for inference variables until they are resolved.
    ///
    /// Otherwise (for concrete types or when inference is disabled):
    /// - If types have different names: Return Never (empty set).
    /// - If types have the same name but different representations: Return Never (empty set).
    /// - If types have the same name and equivalent representations: Return the type itself.
    ///
    /// This approach prevents premature failure during inference while maintaining strict
    /// nominal semantics once types are fully resolved. It allows constraint propagation while
    /// preserving type safety.
    fn meet(
        self: Type<'heap, Self>,
        other: Type<'heap, Self>,
        env: &mut LatticeEnvironment<'_, 'heap>,
    ) -> SmallVec<TypeId, 4> {
        if self.kind.name != other.kind.name {
            return SmallVec::new();
        }

        if env.is_inference_enabled()
            && (!env.is_concrete(self.kind.repr) || !env.is_concrete(other.kind.repr))
        {
            let self_repr = env.r#type(self.kind.repr);
            let other_repr = env.r#type(other.kind.repr);

            // We circumvent `env.meet` here, by directly meeting the representations. This is
            // intentional, so that we can propagate the meet result instead of having a
            // `Intersection`.
            let result = self_repr.meet(other_repr, env);

            // If any of the types aren't concrete, we effectively convert ourselves into a
            // "carrier" to defer evaluation of the term, once inference is completed we'll simplify
            // and postprocess the result.
            self.postprocess_lattice(result, env.environment)
        } else if env.is_equivalent(self.kind.repr, other.kind.repr) {
            SmallVec::from_slice_copy(&[self.id])
        } else {
            SmallVec::new()
        }
    }

    fn projection(
        self: Type<'heap, Self>,
        field: Ident<'heap>,
        env: &mut LatticeEnvironment<'_, 'heap>,
    ) -> Projection {
        env.projection(self.kind.repr, field)
    }

    fn subscript(
        self: Type<'heap, Self>,
        index: TypeId,
        env: &mut LatticeEnvironment<'_, 'heap>,
        infer: &mut InferenceEnvironment<'_, 'heap>,
    ) -> Subscript {
        env.subscript(self.kind.repr, index, infer)
    }

    fn is_bottom(self: Type<'heap, Self>, env: &mut AnalysisEnvironment<'_, 'heap>) -> bool {
        env.is_bottom(self.kind.repr)
    }

    fn is_top(self: Type<'heap, Self>, env: &mut AnalysisEnvironment<'_, 'heap>) -> bool {
        env.is_top(self.kind.repr)
    }

    fn is_concrete(self: Type<'heap, Self>, env: &mut AnalysisEnvironment<'_, 'heap>) -> bool {
        env.is_concrete(self.kind.repr)
    }

    fn is_recursive(self: Type<'heap, Self>, env: &mut AnalysisEnvironment<'_, 'heap>) -> bool {
        env.is_recursive(self.kind.repr)
    }

    fn distribute_union(
        self: Type<'heap, Self>,
        _: &mut AnalysisEnvironment<'_, 'heap>,
    ) -> SmallVec<TypeId, 16> {
        // opaque type is invariant in regards to generic arguments, so we simply return ourselves
        SmallVec::from_slice_copy(&[self.id])
    }

    fn distribute_intersection(
        self: Type<'heap, Self>,
        _: &mut AnalysisEnvironment<'_, 'heap>,
    ) -> SmallVec<TypeId, 16> {
        // opaque type is invariant in regards to generic arguments, so we simply return ourselves
        SmallVec::from_slice_copy(&[self.id])
    }

    /// Determines if one opaque type is a subtype of another.
    ///
    /// Implements invariant nominal typing semantics:
    /// 1. Types with different names are always unrelated (neither is a subtype of the other)
    /// 2. Types with the same name follow invariant rules for their inner representation (enforced
    ///    via the `in_invariant` context)
    fn is_subtype_of(
        self: Type<'heap, Self>,
        supertype: Type<'heap, Self>,
        env: &mut AnalysisEnvironment<'_, 'heap>,
    ) -> bool {
        if self.kind.name != supertype.kind.name {
            let _: ControlFlow<()> = env.record_diagnostic(|_| {
                opaque_type_name_mismatch(self, supertype, self.kind.name, supertype.kind.name)
            });

            return false;
        }

        env.is_subtype_of(Variance::Invariant, self.kind.repr, supertype.kind.repr)
    }

    fn is_equivalent(
        self: Type<'heap, Self>,
        other: Type<'heap, Self>,
        env: &mut AnalysisEnvironment<'_, 'heap>,
    ) -> bool {
        if self.kind.name != other.kind.name {
            let _: ControlFlow<()> = env.record_diagnostic(|_| {
                opaque_type_name_mismatch(self, other, self.kind.name, other.kind.name)
            });

            return false;
        }

        env.is_equivalent(self.kind.repr, other.kind.repr)
    }

    fn simplify(self: Type<'heap, Self>, env: &mut SimplifyEnvironment<'_, 'heap>) -> TypeId {
        let (_guard, id) = env.provision(self.id);

        let repr = env.simplify(self.kind.repr);

        env.intern_provisioned(
            id,
            PartialType {
                span: self.span,
                kind: env.intern_kind(TypeKind::Opaque(OpaqueType {
                    name: self.kind.name,
                    repr,
                })),
            },
        )
    }
}

impl<'heap> Inference<'heap> for OpaqueType<'heap> {
    fn collect_constraints(
        self: Type<'heap, Self>,
        supertype: Type<'heap, Self>,
        env: &mut InferenceEnvironment<'_, 'heap>,
    ) {
        if self.kind.name != supertype.kind.name {
            // During constraint collection we ignore any errors, as these will be caught during
            // `is_subtype_of` checking later
            return;
        }

        // Opaque types are invariant in regards to their arguments
        env.collect_constraints(Variance::Invariant, self.kind.repr, supertype.kind.repr);
    }

    fn instantiate(self: Type<'heap, Self>, env: &mut InstantiateEnvironment<'_, 'heap>) -> TypeId {
        let (_guard, id) = env.provision(self.id);

        let repr = env.instantiate(self.kind.repr);

        env.intern_provisioned(
            id,
            PartialType {
                span: self.span,
                kind: env.intern_kind(TypeKind::Opaque(OpaqueType {
                    name: self.kind.name,
                    repr,
                })),
            },
        )
    }
}
