use core::ops::ControlFlow;

use smallvec::SmallVec;

use super::{PrimitiveType, TypeKind};
use crate::{
    symbol::Ident,
    r#type::{
        PartialType, Type, TypeId,
        environment::{
            AnalysisEnvironment, Environment, InferenceEnvironment, LatticeEnvironment,
            SimplifyEnvironment, Variance, instantiate::InstantiateEnvironment,
        },
        error::{
            UnsupportedProjectionCategory, dict_subscript_mismatch, list_subscript_mismatch,
            type_mismatch, unsupported_projection,
        },
        inference::Inference,
        lattice::{Lattice, Projection, Subscript},
    },
};

/// Represents a list type.
///
/// List types maintain an element type that is **covariant**.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct ListType {
    pub element: TypeId,
}

impl<'heap> Lattice<'heap> for ListType {
    fn join(
        self: Type<'heap, Self>,
        other: Type<'heap, Self>,
        env: &mut LatticeEnvironment<'_, 'heap>,
    ) -> SmallVec<TypeId, 4> {
        let element = env.join(self.kind.element, other.kind.element);

        SmallVec::from_slice_copy(&[env.intern_type(PartialType {
            span: self.span,
            kind: env.intern_kind(TypeKind::Intrinsic(IntrinsicType::List(Self { element }))),
        })])
    }

    fn meet(
        self: Type<'heap, Self>,
        other: Type<'heap, Self>,
        env: &mut LatticeEnvironment<'_, 'heap>,
    ) -> SmallVec<TypeId, 4> {
        let element = env.meet(self.kind.element, other.kind.element);

        SmallVec::from_slice_copy(&[env.intern_type(PartialType {
            span: self.span,
            kind: env.intern_kind(TypeKind::Intrinsic(IntrinsicType::List(Self { element }))),
        })])
    }

    fn projection(
        self: Type<'heap, Self>,
        field: Ident<'heap>,
        env: &mut LatticeEnvironment<'_, 'heap>,
    ) -> Projection {
        env.diagnostics.push(unsupported_projection(
            self,
            field,
            UnsupportedProjectionCategory::List,
            env,
        ));

        Projection::Error
    }

    fn subscript(
        self: Type<'heap, Self>,
        index: TypeId,
        env: &mut LatticeEnvironment<'_, 'heap>,
        infer: &mut InferenceEnvironment<'_, 'heap>,
    ) -> Subscript {
        let number = env.intern_type(PartialType {
            span: self.span,
            kind: env.intern_kind(TypeKind::Primitive(PrimitiveType::Integer)),
        });

        // Check if `index` is concrete, if it isn't we need to issue a `Pending` and discharge a
        // subtyping constraint.
        if !env.is_concrete(index) {
            infer.collect_constraints(Variance::Covariant, index, number);

            return Subscript::Pending;
        }

        if env.is_subtype_of(Variance::Covariant, index, number) {
            return Subscript::Resolved(self.kind.element);
        }

        env.diagnostics
            .push(list_subscript_mismatch(self, index, env));
        Subscript::Error
    }

    fn is_bottom(self: Type<'heap, Self>, _: &mut AnalysisEnvironment<'_, 'heap>) -> bool {
        // Never bottom, even if the inner element is bottom, as a list can always be empty.
        false
    }

    fn is_top(self: Type<'heap, Self>, _: &mut AnalysisEnvironment<'_, 'heap>) -> bool {
        false
    }

    fn is_concrete(self: Type<'heap, Self>, env: &mut AnalysisEnvironment<'_, 'heap>) -> bool {
        env.is_concrete(self.kind.element)
    }

    fn is_recursive(self: Type<'heap, Self>, env: &mut AnalysisEnvironment<'_, 'heap>) -> bool {
        env.is_recursive(self.kind.element)
    }

    fn distribute_union(
        self: Type<'heap, Self>,
        env: &mut AnalysisEnvironment<'_, 'heap>,
    ) -> SmallVec<TypeId, 16> {
        let elements = env.distribute_union(self.kind.element);

        // Due to distribution rules, we know if there's a single element, it's the same as the
        // original type.
        if elements.len() == 1 {
            return SmallVec::from_slice_copy(&[self.id]);
        }

        elements
            .into_iter()
            .map(|element| {
                env.intern_type(PartialType {
                    span: self.span,
                    kind: env
                        .intern_kind(TypeKind::Intrinsic(IntrinsicType::List(Self { element }))),
                })
            })
            .collect()
    }

    fn distribute_intersection(
        self: Type<'heap, Self>,
        env: &mut AnalysisEnvironment<'_, 'heap>,
    ) -> SmallVec<TypeId, 16> {
        let elements = env.distribute_intersection(self.kind.element);

        // Due to distribution rules, we know if there's a single element, it's the same as the
        // original type.
        if elements.len() == 1 {
            return SmallVec::from_slice_copy(&[self.id]);
        }

        elements
            .into_iter()
            .map(|element| {
                env.intern_type(PartialType {
                    span: self.span,
                    kind: env
                        .intern_kind(TypeKind::Intrinsic(IntrinsicType::List(Self { element }))),
                })
            })
            .collect()
    }

    fn is_subtype_of(
        self: Type<'heap, Self>,
        supertype: Type<'heap, Self>,
        env: &mut AnalysisEnvironment<'_, 'heap>,
    ) -> bool {
        env.is_subtype_of(
            Variance::Covariant,
            self.kind.element,
            supertype.kind.element,
        )
    }

    fn is_equivalent(
        self: Type<'heap, Self>,
        other: Type<'heap, Self>,
        env: &mut AnalysisEnvironment<'_, 'heap>,
    ) -> bool {
        env.is_equivalent(self.kind.element, other.kind.element)
    }

    fn simplify(self: Type<'heap, Self>, env: &mut SimplifyEnvironment<'_, 'heap>) -> TypeId {
        let (_guard, id) = env.provision(self.id);
        let element = env.simplify(self.kind.element);

        env.intern_provisioned(
            id,
            PartialType {
                span: self.span,
                kind: env.intern_kind(TypeKind::Intrinsic(IntrinsicType::List(Self { element }))),
            },
        )
    }
}

impl<'heap> Inference<'heap> for ListType {
    fn collect_constraints(
        self: Type<'heap, Self>,
        supertype: Type<'heap, Self>,
        env: &mut InferenceEnvironment<'_, 'heap>,
    ) {
        env.collect_constraints(
            Variance::Covariant,
            self.kind.element,
            supertype.kind.element,
        );
    }

    fn instantiate(self: Type<'heap, Self>, env: &mut InstantiateEnvironment<'_, 'heap>) -> TypeId {
        let (_guard, id) = env.provision(self.id);

        let element = env.instantiate(self.kind.element);

        env.intern_provisioned(
            id,
            PartialType {
                span: self.span,
                kind: env.intern_kind(TypeKind::Intrinsic(IntrinsicType::List(Self { element }))),
            },
        )
    }
}

/// Represents a dictionary (key-value mapping) type.
///
/// Dictionary types maintain a key type and a value type, with specific variance behavior:
/// - Keys are **invariant**: Two dictionary types are only compatible if their key types are
///   equivalent.
/// - Values are **covariant**: A dictionary with a more specific value type is a subtype of a
///   dictionary with a more general value type.
///
/// # Type System Design
///
/// This implementation uses a refined context-sensitive approach for keys:
/// - For concrete types or when inference is disabled: Dict keys are strictly **invariant**,
///   enforcing that two dictionary types are only compatible when their key types are equivalent.
/// - During inference with non-concrete keys: Dict types implement a "carrier" pattern that defers
///   evaluation, allowing inference variables to propagate through the type while maintaining key
///   invariance once fully resolved.
///
/// # Key Invariance Rationale
///
/// Dictionary keys must be invariant for type safety reasons:
///
/// 1. **Hash Consistency**: Different types may have different hashing algorithms
/// 2. **Lookup Correctness**: Allowing substitution of key types could lead to failed lookups
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct DictType {
    pub key: TypeId,
    pub value: TypeId,
}

impl DictType {
    fn postprocess_lattice<'heap>(
        self: Type<'heap, Self>,
        other: Type<'heap, Self>,
        keys: &[TypeId],
        value: TypeId,
        env: &Environment<'heap>,
    ) -> SmallVec<TypeId, 4> {
        // Check if the result is the same as the original types, if that is the case we can
        // return the original type id, instead of allocating a new one.
        if value == self.kind.value && keys == [self.kind.key] {
            SmallVec::from_slice_copy(&[self.id])
        } else if value == other.kind.value && keys == [other.kind.key] {
            SmallVec::from_slice_copy(&[other.id])
        } else {
            keys.iter()
                .map(|&key| {
                    env.intern_type(PartialType {
                        span: self.span,
                        kind: env.intern_kind(TypeKind::Intrinsic(IntrinsicType::Dict(Self {
                            key,
                            value,
                        }))),
                    })
                })
                .collect()
        }
    }
}

impl<'heap> Lattice<'heap> for DictType {
    fn join(
        self: Type<'heap, Self>,
        other: Type<'heap, Self>,
        env: &mut LatticeEnvironment<'_, 'heap>,
    ) -> SmallVec<TypeId, 4> {
        let defer = env.is_inference_enabled()
            && (!env.is_concrete(self.kind.key) || !env.is_concrete(other.kind.key));

        if defer {
            let self_key = env.r#type(self.kind.key);
            let other_key = env.r#type(other.kind.key);

            // We circumvent `env.join` here, by directly joining the representations. This is
            // intentional, so that we can propagate the join result instead of having a `Union`.
            let keys = self_key.join(other_key, env);
            let value = env.join(self.kind.value, other.kind.value);

            // If any of the types aren't concrete, we effectively convert ourselves into a
            // "carrier" to defer evaluation of the term, once inference is completed we'll simplify
            // and postprocess the result.
            self.postprocess_lattice(other, &keys, value, env)
        } else if env.is_equivalent(self.kind.key, other.kind.key) {
            let value = env.join(self.kind.value, other.kind.value);

            SmallVec::from_slice_copy(&[env.intern_type(PartialType {
                span: self.span,
                kind: env.intern_kind(TypeKind::Intrinsic(IntrinsicType::Dict(Self {
                    key: self.kind.key,
                    value,
                }))),
            })])
        } else {
            // keys are not equivalent, cannot join
            SmallVec::from_slice_copy(&[self.id, other.id])
        }
    }

    fn meet(
        self: Type<'heap, Self>,
        other: Type<'heap, Self>,
        env: &mut LatticeEnvironment<'_, 'heap>,
    ) -> SmallVec<TypeId, 4> {
        let defer = env.is_inference_enabled()
            && (!env.is_concrete(self.kind.key) || !env.is_concrete(other.kind.key));

        if defer {
            let self_key = env.r#type(self.kind.key);
            let other_key = env.r#type(other.kind.key);

            // We circumvent `env.meet` here, by directly joining the representations. This is
            // intentional, so that we can propagate the join result instead of having an
            // `Intersection`.
            let keys = self_key.meet(other_key, env);
            let value = env.meet(self.kind.value, other.kind.value);

            // If any of the types aren't concrete, we effectively convert ourselves into a
            // "carrier" to defer evaluation of the term, once inference is completed we'll simplify
            // and postprocess the result.
            self.postprocess_lattice(other, &keys, value, env)
        } else if env.is_equivalent(self.kind.key, other.kind.key) {
            let value = env.meet(self.kind.value, other.kind.value);

            SmallVec::from_slice_copy(&[env.intern_type(PartialType {
                span: self.span,
                kind: env.intern_kind(TypeKind::Intrinsic(IntrinsicType::Dict(Self {
                    key: self.kind.key,
                    value,
                }))),
            })])
        } else {
            SmallVec::new()
        }
    }

    fn projection(
        self: Type<'heap, Self>,
        field: Ident<'heap>,
        env: &mut LatticeEnvironment<'_, 'heap>,
    ) -> Projection {
        env.diagnostics.push(unsupported_projection(
            self,
            field,
            UnsupportedProjectionCategory::Dict,
            env,
        ));

        Projection::Error
    }

    fn subscript(
        self: Type<'heap, Self>,
        index: TypeId,
        env: &mut LatticeEnvironment<'_, 'heap>,
        infer: &mut InferenceEnvironment<'_, 'heap>,
    ) -> Subscript {
        // Check if `index` and `key` are concrete, if not collect the constraints between them
        if !env.is_concrete(index) || !env.is_concrete(self.kind.key) {
            infer.collect_constraints(Variance::Invariant, index, self.kind.key);

            return Subscript::Pending;
        }

        // Dict keys are invariant, and therefore the index must be equivalent to the key
        if env.is_equivalent(index, self.kind.key) {
            return Subscript::Resolved(self.kind.value);
        }

        env.diagnostics
            .push(dict_subscript_mismatch(self, index, env));
        Subscript::Error
    }

    fn is_bottom(self: Type<'heap, Self>, _: &mut AnalysisEnvironment<'_, 'heap>) -> bool {
        // Never bottom, as even with a `!` key or value a dict can be empty
        false
    }

    fn is_top(self: Type<'heap, Self>, _: &mut AnalysisEnvironment<'_, 'heap>) -> bool {
        false
    }

    fn is_concrete(self: Type<'heap, Self>, env: &mut AnalysisEnvironment<'_, 'heap>) -> bool {
        env.is_concrete(self.kind.key) && env.is_concrete(self.kind.value)
    }

    fn is_recursive(self: Type<'heap, Self>, env: &mut AnalysisEnvironment<'_, 'heap>) -> bool {
        env.is_recursive(self.kind.key) || env.is_recursive(self.kind.value)
    }

    fn distribute_union(
        self: Type<'heap, Self>,
        env: &mut AnalysisEnvironment<'_, 'heap>,
    ) -> SmallVec<TypeId, 16> {
        // The key is invariant, but the value is covariant, therefore we need to distribute over
        // the value
        let value = env.distribute_union(self.kind.value);

        if value.len() == 1 {
            // Distribution rules - if the returned value is a single type it must be the same type
            return SmallVec::from_slice_copy(&[self.id]);
        }

        value
            .into_iter()
            .map(|value| {
                env.intern_type(PartialType {
                    span: self.span,
                    kind: env.intern_kind(TypeKind::Intrinsic(IntrinsicType::Dict(Self {
                        key: self.kind.key,
                        value,
                    }))),
                })
            })
            .collect()
    }

    fn distribute_intersection(
        self: Type<'heap, Self>,
        env: &mut AnalysisEnvironment<'_, 'heap>,
    ) -> SmallVec<TypeId, 16> {
        // The key is invariant, but the value is covariant, therefore we need to distribute over
        // the value
        let value = env.distribute_intersection(self.kind.value);

        if value.len() == 1 {
            // Distribution rules - if the returned value is a single type it must be the same type
            return SmallVec::from_slice_copy(&[self.id]);
        }

        value
            .into_iter()
            .map(|value| {
                env.intern_type(PartialType {
                    span: self.span,
                    kind: env.intern_kind(TypeKind::Intrinsic(IntrinsicType::Dict(Self {
                        key: self.kind.key,
                        value,
                    }))),
                })
            })
            .collect()
    }

    fn is_subtype_of(
        self: Type<'heap, Self>,
        supertype: Type<'heap, Self>,
        env: &mut AnalysisEnvironment<'_, 'heap>,
    ) -> bool {
        env.is_subtype_of(Variance::Invariant, self.kind.key, supertype.kind.key)
            && env.is_subtype_of(Variance::Covariant, self.kind.value, supertype.kind.value)
    }

    fn is_equivalent(
        self: Type<'heap, Self>,
        other: Type<'heap, Self>,
        env: &mut AnalysisEnvironment<'_, 'heap>,
    ) -> bool {
        env.is_equivalent(self.kind.key, other.kind.key)
            && env.is_equivalent(self.kind.value, other.kind.value)
    }

    fn simplify(self: Type<'heap, Self>, env: &mut SimplifyEnvironment<'_, 'heap>) -> TypeId {
        let (_guard, id) = env.provision(self.id);

        let key = env.simplify(self.kind.key);
        let value = env.simplify(self.kind.value);

        env.intern_provisioned(
            id,
            PartialType {
                span: self.span,
                kind: env.intern_kind(TypeKind::Intrinsic(IntrinsicType::Dict(Self {
                    key,
                    value,
                }))),
            },
        )
    }
}

impl<'heap> Inference<'heap> for DictType {
    fn collect_constraints(
        self: Type<'heap, Self>,
        supertype: Type<'heap, Self>,
        env: &mut InferenceEnvironment<'_, 'heap>,
    ) {
        // Key is invariant, Value is covariant
        env.collect_constraints(Variance::Invariant, self.kind.key, supertype.kind.key);
        env.collect_constraints(Variance::Covariant, self.kind.value, supertype.kind.value);
    }

    fn instantiate(self: Type<'heap, Self>, env: &mut InstantiateEnvironment<'_, 'heap>) -> TypeId {
        let (_guard, id) = env.provision(self.id);

        let key = env.instantiate(self.kind.key);
        let value = env.instantiate(self.kind.value);

        env.intern_provisioned(
            id,
            PartialType {
                span: self.span,
                kind: env.intern_kind(TypeKind::Intrinsic(IntrinsicType::Dict(Self {
                    key,
                    value,
                }))),
            },
        )
    }
}

// Intrinsics are "magical" types in the HashQL language that have no "substance", in the sense that
// there's no way to define them in terms of HashQL itself.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum IntrinsicType {
    List(ListType),
    Dict(DictType),
}

impl IntrinsicType {
    #[must_use]
    pub const fn list(&self) -> Option<&ListType> {
        match self {
            Self::List(list) => Some(list),
            Self::Dict(_) => None,
        }
    }

    #[must_use]
    pub const fn dict(&self) -> Option<&DictType> {
        match self {
            Self::Dict(dict) => Some(dict),
            Self::List(_) => None,
        }
    }

    fn record_type_mismatch<'heap>(
        self: Type<'heap, Self>,
        other: Type<'heap, Self>,
        env: &mut AnalysisEnvironment<'_, 'heap>,
    ) {
        let _: ControlFlow<()> = env.record_diagnostic(|env| {
            // Provide helpful conversion suggestions
            let help = match (self.kind, other.kind) {
                (Self::List(_), Self::Dict(..)) => Some(
                    "These types are different collection types. You can convert a list of \
                     key-value pairs to a dictionary using the `::core::dict::from_entries/1` \
                     function.",
                ),
                (Self::Dict(..), Self::List(_)) => Some(
                    "These types are different collection types. You can convert a dictionary to \
                     a list of key-value pairs using the `::core::dict::to_entries/1` function.",
                ),
                _ => Some("These collection types cannot be used interchangeably."),
            };

            type_mismatch(env, self, other, help)
        });
    }
}

impl<'heap> Lattice<'heap> for IntrinsicType {
    fn join(
        self: Type<'heap, Self>,
        other: Type<'heap, Self>,
        env: &mut LatticeEnvironment<'_, 'heap>,
    ) -> SmallVec<TypeId, 4> {
        match (self.kind, other.kind) {
            (Self::List(lhs), Self::List(rhs)) => self.with(lhs).join(other.with(rhs), env),
            (Self::Dict(lhs), Self::Dict(rhs)) => self.with(lhs).join(other.with(rhs), env),
            (Self::List(_), Self::Dict(_)) | (Self::Dict(_), Self::List(_)) => {
                SmallVec::from_slice_copy(&[self.id, other.id])
            }
        }
    }

    fn meet(
        self: Type<'heap, Self>,
        other: Type<'heap, Self>,
        env: &mut LatticeEnvironment<'_, 'heap>,
    ) -> SmallVec<TypeId, 4> {
        match (self.kind, other.kind) {
            (Self::List(lhs), Self::List(rhs)) => self.with(lhs).meet(other.with(rhs), env),
            (Self::Dict(lhs), Self::Dict(rhs)) => self.with(lhs).meet(other.with(rhs), env),
            (Self::List(_), Self::Dict(_)) | (Self::Dict(_), Self::List(_)) => SmallVec::new(),
        }
    }

    fn projection(
        self: Type<'heap, Self>,
        field: Ident<'heap>,
        env: &mut LatticeEnvironment<'_, 'heap>,
    ) -> Projection {
        match self.kind {
            Self::List(inner) => self.with(inner).projection(field, env),
            Self::Dict(inner) => self.with(inner).projection(field, env),
        }
    }

    fn subscript(
        self: Type<'heap, Self>,
        index: TypeId,
        env: &mut LatticeEnvironment<'_, 'heap>,
        infer: &mut InferenceEnvironment<'_, 'heap>,
    ) -> Subscript {
        match self.kind {
            Self::List(list_type) => self.with(list_type).subscript(index, env, infer),
            Self::Dict(dict_type) => self.with(dict_type).subscript(index, env, infer),
        }
    }

    fn is_bottom(self: Type<'heap, Self>, env: &mut AnalysisEnvironment<'_, 'heap>) -> bool {
        match self.kind {
            Self::List(inner) => self.with(inner).is_bottom(env),
            Self::Dict(inner) => self.with(inner).is_bottom(env),
        }
    }

    fn is_top(self: Type<'heap, Self>, env: &mut AnalysisEnvironment<'_, 'heap>) -> bool {
        match self.kind {
            Self::List(inner) => self.with(inner).is_top(env),
            Self::Dict(inner) => self.with(inner).is_top(env),
        }
    }

    fn is_concrete(self: Type<'heap, Self>, env: &mut AnalysisEnvironment<'_, 'heap>) -> bool {
        match self.kind {
            Self::List(inner) => self.with(inner).is_concrete(env),
            Self::Dict(inner) => self.with(inner).is_concrete(env),
        }
    }

    fn is_recursive(self: Type<'heap, Self>, env: &mut AnalysisEnvironment<'_, 'heap>) -> bool {
        match self.kind {
            Self::List(inner) => self.with(inner).is_recursive(env),
            Self::Dict(inner) => self.with(inner).is_recursive(env),
        }
    }

    fn distribute_union(
        self: Type<'heap, Self>,
        env: &mut AnalysisEnvironment<'_, 'heap>,
    ) -> SmallVec<TypeId, 16> {
        match self.kind {
            Self::List(list_type) => self.with(list_type).distribute_union(env),
            Self::Dict(dict_type) => self.with(dict_type).distribute_union(env),
        }
    }

    fn distribute_intersection(
        self: Type<'heap, Self>,
        env: &mut AnalysisEnvironment<'_, 'heap>,
    ) -> SmallVec<TypeId, 16> {
        match self.kind {
            Self::List(list_type) => self.with(list_type).distribute_intersection(env),
            Self::Dict(dict_type) => self.with(dict_type).distribute_intersection(env),
        }
    }

    fn is_subtype_of(
        self: Type<'heap, Self>,
        supertype: Type<'heap, Self>,
        env: &mut AnalysisEnvironment<'_, 'heap>,
    ) -> bool {
        match (self.kind, supertype.kind) {
            (Self::List(lhs), Self::List(rhs)) => {
                self.with(lhs).is_subtype_of(supertype.with(rhs), env)
            }
            (Self::Dict(inner), Self::Dict(rhs)) => {
                self.with(inner).is_subtype_of(supertype.with(rhs), env)
            }
            (Self::List(_), Self::Dict(_)) | (Self::Dict(_), Self::List(_)) => {
                self.record_type_mismatch(supertype, env);

                false
            }
        }
    }

    fn is_equivalent(
        self: Type<'heap, Self>,
        other: Type<'heap, Self>,
        env: &mut AnalysisEnvironment<'_, 'heap>,
    ) -> bool {
        match (self.kind, other.kind) {
            (Self::List(lhs), Self::List(rhs)) => {
                self.with(lhs).is_equivalent(other.with(rhs), env)
            }
            (Self::Dict(inner), Self::Dict(rhs)) => {
                self.with(inner).is_equivalent(other.with(rhs), env)
            }
            (Self::List(_), Self::Dict(_)) | (Self::Dict(_), Self::List(_)) => {
                self.record_type_mismatch(other, env);

                false
            }
        }
    }

    fn simplify(self: Type<'heap, Self>, env: &mut SimplifyEnvironment<'_, 'heap>) -> TypeId {
        match self.kind {
            Self::List(list) => self.with(list).simplify(env),
            Self::Dict(dict) => self.with(dict).simplify(env),
        }
    }
}

impl<'heap> Inference<'heap> for IntrinsicType {
    fn collect_constraints(
        self: Type<'heap, Self>,
        supertype: Type<'heap, Self>,
        env: &mut InferenceEnvironment<'_, 'heap>,
    ) {
        match (self.kind, supertype.kind) {
            (Self::List(lhs), Self::List(rhs)) => {
                self.with(lhs).collect_constraints(supertype.with(rhs), env);
            }
            (Self::Dict(inner), Self::Dict(rhs)) => {
                self.with(inner)
                    .collect_constraints(supertype.with(rhs), env);
            }
            _ => {
                // During constraint collection we ignore any errors, as these will be caught during
                // `is_subtype_of` checking later
            }
        }
    }

    fn instantiate(self: Type<'heap, Self>, env: &mut InstantiateEnvironment<'_, 'heap>) -> TypeId {
        match self.kind {
            Self::List(list) => self.with(list).instantiate(env),
            Self::Dict(dict) => self.with(dict).instantiate(env),
        }
    }
}
