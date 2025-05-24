use core::ops::ControlFlow;

use pretty::{DocAllocator as _, RcAllocator, RcDoc};
use smallvec::SmallVec;

use super::TypeKind;
use crate::{
    pretty::{PrettyPrint, PrettyRecursionBoundary},
    symbol::Ident,
    r#type::{
        PartialType, Type, TypeId,
        environment::{
            AnalysisEnvironment, Environment, InferenceEnvironment, LatticeEnvironment,
            SimplifyEnvironment, instantiate::InstantiateEnvironment,
        },
        error::{UnsupportedProjectionCategory, type_mismatch, unsupported_projection},
        inference::{Inference, PartialStructuralEdge},
        lattice::{Lattice, Projection},
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

        SmallVec::from_slice(&[env.intern_type(PartialType {
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

        SmallVec::from_slice(&[env.intern_type(PartialType {
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
            return SmallVec::from_slice(&[self.id]);
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
            return SmallVec::from_slice(&[self.id]);
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
        env.in_covariant(|env| env.is_subtype_of(self.kind.element, supertype.kind.element))
    }

    fn is_equivalent(
        self: Type<'heap, Self>,
        other: Type<'heap, Self>,
        env: &mut AnalysisEnvironment<'_, 'heap>,
    ) -> bool {
        env.in_covariant(|env| env.is_equivalent(self.kind.element, other.kind.element))
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
        env.in_covariant(|env| {
            env.collect_constraints(self.kind.element, supertype.kind.element);
        });
    }

    fn collect_structural_edges(
        self: Type<'heap, Self>,
        variable: PartialStructuralEdge,
        env: &mut InferenceEnvironment<'_, 'heap>,
    ) {
        env.in_covariant(|env| env.collect_structural_edges(self.kind.element, variable));
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

impl<'heap> PrettyPrint<'heap> for ListType {
    fn pretty(
        &self,
        env: &Environment<'heap>,
        boundary: &mut PrettyRecursionBoundary,
    ) -> RcDoc<'heap, anstyle::Style> {
        RcDoc::text("List")
            .append(RcDoc::text("<"))
            .append(boundary.pretty_type(env, self.element).group())
            .append(RcDoc::text(">"))
            .group()
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
            return SmallVec::from_slice(&[self.id]);
        } else if value == other.kind.value && keys == [other.kind.key] {
            return SmallVec::from_slice(&[other.id]);
        }

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

            SmallVec::from_slice(&[env.intern_type(PartialType {
                span: self.span,
                kind: env.intern_kind(TypeKind::Intrinsic(IntrinsicType::Dict(Self {
                    key: self.kind.key,
                    value,
                }))),
            })])
        } else {
            // keys are not equivalent, cannot join
            SmallVec::from_slice(&[self.id, other.id])
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

            SmallVec::from_slice(&[env.intern_type(PartialType {
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
            return SmallVec::from_slice(&[self.id]);
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
            return SmallVec::from_slice(&[self.id]);
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
        env.in_invariant(|env| env.is_subtype_of(self.kind.key, supertype.kind.key))
            && env.in_covariant(|env| env.is_subtype_of(self.kind.value, supertype.kind.value))
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
        env.in_invariant(|env| env.collect_constraints(self.kind.key, supertype.kind.key));
        env.in_covariant(|env| env.collect_constraints(self.kind.value, supertype.kind.value));
    }

    fn collect_structural_edges(
        self: Type<'heap, Self>,
        variable: PartialStructuralEdge,
        env: &mut InferenceEnvironment<'_, 'heap>,
    ) {
        env.in_invariant(|env| env.collect_structural_edges(self.kind.key, variable));
        env.in_covariant(|env| env.collect_structural_edges(self.kind.value, variable));
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

impl<'heap> PrettyPrint<'heap> for DictType {
    fn pretty(
        &self,
        env: &Environment<'heap>,
        boundary: &mut PrettyRecursionBoundary,
    ) -> RcDoc<'heap, anstyle::Style> {
        RcDoc::text("Dict")
            .append(
                RcAllocator
                    .intersperse(
                        [self.key, self.value]
                            .into_iter()
                            .map(|id| boundary.pretty_type(env, id)),
                        RcDoc::text(",").append(RcDoc::softline()),
                    )
                    .nest(1)
                    .group()
                    .angles()
                    .group()
                    .into_doc(),
            )
            .group()
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
                SmallVec::from_slice(&[self.id, other.id])
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

    fn collect_structural_edges(
        self: Type<'heap, Self>,
        variable: PartialStructuralEdge,
        env: &mut InferenceEnvironment<'_, 'heap>,
    ) {
        match self.kind {
            Self::List(list_type) => {
                self.with(list_type).collect_structural_edges(variable, env);
            }
            Self::Dict(dict_type) => {
                self.with(dict_type).collect_structural_edges(variable, env);
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

impl<'heap> PrettyPrint<'heap> for IntrinsicType {
    fn pretty(
        &self,
        env: &Environment<'heap>,
        boundary: &mut PrettyRecursionBoundary,
    ) -> RcDoc<'heap, anstyle::Style> {
        match self {
            Self::List(list) => list.pretty(env, boundary),
            Self::Dict(dict) => dict.pretty(env, boundary),
        }
    }
}

#[cfg(test)]
mod tests {
    use core::assert_matches::assert_matches;

    use super::{DictType, IntrinsicType, ListType};
    use crate::{
        heap::Heap,
        pretty::PrettyPrint as _,
        span::SpanId,
        r#type::{
            PartialType,
            environment::{
                AnalysisEnvironment, Environment, InferenceEnvironment, LatticeEnvironment,
                SimplifyEnvironment, instantiate::InstantiateEnvironment,
            },
            inference::{
                Constraint, Inference as _, PartialStructuralEdge, Variable, VariableKind,
            },
            kind::{
                Generic, OpaqueType, Param, TypeKind,
                generic::GenericArgument,
                infer::HoleId,
                intersection::IntersectionType,
                primitive::PrimitiveType,
                test::{assert_equiv, dict, generic, intersection, list, opaque, primitive, union},
                union::UnionType,
            },
            lattice::{Lattice as _, test::assert_lattice_laws},
            test::{instantiate, instantiate_infer, instantiate_param},
        },
    };

    #[test]
    fn join_lists_same_element_type() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Create two list types with the same element type
        list!(env, list_a, primitive!(env, PrimitiveType::Number));
        list!(env, list_b, primitive!(env, PrimitiveType::Number));

        let mut lattice_env = LatticeEnvironment::new(&env);

        // Joining two lists with the same element type should return one of them
        assert_equiv!(env, list_a.join(list_b, &mut lattice_env), [list_a.id]);
    }

    #[test]
    fn join_lists_different_element_types() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Create two list types with different element types
        list!(env, list_a, primitive!(env, PrimitiveType::Number));
        list!(env, list_b, primitive!(env, PrimitiveType::String));

        let mut lattice_env = LatticeEnvironment::new(&env);

        // Joining two lists with different element types should return a list with the joined
        // element types
        assert_equiv!(
            env,
            list_a.join(list_b, &mut lattice_env),
            [list!(
                env,
                union!(
                    env,
                    [
                        primitive!(env, PrimitiveType::Number),
                        primitive!(env, PrimitiveType::String)
                    ]
                )
            )]
        );
    }

    #[test]
    fn meet_lists_same_element_type() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Create two list types with the same element type
        list!(env, list_a, primitive!(env, PrimitiveType::Number));
        list!(env, list_b, primitive!(env, PrimitiveType::Number));

        let mut lattice_env = LatticeEnvironment::new(&env);

        // Meeting two lists with the same element type should return one of them
        assert_equiv!(env, list_a.meet(list_b, &mut lattice_env), [list_a.id]);
    }

    #[test]
    fn meet_lists_different_element_types() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Create two list types with different element types
        list!(env, list_a, primitive!(env, PrimitiveType::Number));
        list!(env, list_b, primitive!(env, PrimitiveType::Integer));

        let mut lattice_env = LatticeEnvironment::new(&env);

        // Meeting List<Number> and List<Integer> should give List<Integer> (since Integer <:
        // Number)
        assert_equiv!(env, list_a.meet(list_b, &mut lattice_env), [list_b.id]);

        // Meeting with incompatible types should give empty
        list!(env, list_c, primitive!(env, PrimitiveType::String));

        assert_equiv!(
            env,
            list_a.meet(list_c, &mut lattice_env),
            [list!(env, instantiate(&env, TypeKind::Never))]
        );
    }

    #[test]
    fn is_subtype_of_list() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Create two list types where one element is a subtype of the other
        list!(env, list_number, primitive!(env, PrimitiveType::Number));
        list!(env, list_integer, primitive!(env, PrimitiveType::Integer));

        let mut analysis_env = AnalysisEnvironment::new(&env);

        // List<Integer> should be a subtype of List<Number> (covariance)
        assert!(list_integer.is_subtype_of(list_number, &mut analysis_env));

        // List<Number> should not be a subtype of List<Integer>
        assert!(!list_number.is_subtype_of(list_integer, &mut analysis_env));
    }

    #[test]
    fn is_equivalent_list() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Create two list types with equivalent element types
        list!(env, list_a, primitive!(env, PrimitiveType::Number));
        list!(env, list_b, primitive!(env, PrimitiveType::Number));

        let mut analysis_env = AnalysisEnvironment::new(&env);

        // Lists with equivalent element types should be equivalent
        assert!(list_a.is_equivalent(list_b, &mut analysis_env));

        // Lists with different element types should not be equivalent
        list!(env, list_c, primitive!(env, PrimitiveType::String));

        assert!(!list_a.is_equivalent(list_c, &mut analysis_env));
    }

    #[test]
    fn simplify_list() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Create a list with a union element that contains duplicates
        list!(
            env,
            list_with_duplicate_union,
            union!(
                env,
                [
                    primitive!(env, PrimitiveType::Number),
                    primitive!(env, PrimitiveType::Number)
                ]
            )
        );

        let mut simplify_env = SimplifyEnvironment::new(&env);

        // Simplifying should remove duplicates in the element type
        assert_equiv!(
            env,
            [list_with_duplicate_union.simplify(&mut simplify_env)],
            [list!(env, primitive!(env, PrimitiveType::Number))]
        );
    }

    #[test]
    fn list_concrete_check() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);
        let mut analysis_env = AnalysisEnvironment::new(&env);

        // A list with a concrete element type should be concrete
        list!(env, concrete_list, primitive!(env, PrimitiveType::Number));

        assert!(concrete_list.is_concrete(&mut analysis_env));

        // A list with a non-concrete element type should not be concrete
        list!(env, non_concrete_list, instantiate_infer(&env, 0_u32));

        assert!(!non_concrete_list.is_concrete(&mut analysis_env));
    }

    #[test]
    fn join_dicts_same_key_type() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Create two dict types with the same key type but different value types
        dict!(
            env,
            dict_a,
            primitive!(env, PrimitiveType::String),
            primitive!(env, PrimitiveType::Number)
        );

        dict!(
            env,
            dict_b,
            primitive!(env, PrimitiveType::String),
            primitive!(env, PrimitiveType::Boolean)
        );

        let mut lattice_env = LatticeEnvironment::new(&env);

        // Joining two dicts with the same key type should return a dict with the joined value types
        assert_equiv!(
            env,
            dict_a.join(dict_b, &mut lattice_env),
            [dict!(
                env,
                primitive!(env, PrimitiveType::String),
                union!(
                    env,
                    [
                        primitive!(env, PrimitiveType::Number),
                        primitive!(env, PrimitiveType::Boolean)
                    ]
                )
            )]
        );
    }

    #[test]
    fn join_dicts_different_key_types() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Create two dict types with different key types
        dict!(
            env,
            dict_a,
            primitive!(env, PrimitiveType::String),
            primitive!(env, PrimitiveType::Number)
        );
        dict!(
            env,
            dict_b,
            primitive!(env, PrimitiveType::Number),
            primitive!(env, PrimitiveType::Boolean)
        );

        let mut lattice_env = LatticeEnvironment::new(&env);

        // Joining two dicts with different key types should return both dicts in a union
        assert_equiv!(
            env,
            dict_a.join(dict_b, &mut lattice_env),
            [
                dict!(
                    env,
                    primitive!(env, PrimitiveType::String),
                    primitive!(env, PrimitiveType::Number)
                ),
                dict!(
                    env,
                    primitive!(env, PrimitiveType::Number),
                    primitive!(env, PrimitiveType::Boolean)
                )
            ]
        );
    }

    #[test]
    fn meet_dicts_same_key_type() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Create two dict types with the same key type but different value types
        // Integer <: Number
        dict!(
            env,
            dict_a,
            primitive!(env, PrimitiveType::String),
            primitive!(env, PrimitiveType::Number)
        );
        dict!(
            env,
            dict_b,
            primitive!(env, PrimitiveType::String),
            primitive!(env, PrimitiveType::Integer)
        );

        let mut lattice_env = LatticeEnvironment::new(&env);

        // Meeting Dict<String, Number> and Dict<String, Integer> should give Dict<String, Integer>
        assert_equiv!(env, dict_a.meet(dict_b, &mut lattice_env), [dict_b.id]);
    }

    #[test]
    fn meet_dicts_different_key_types() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Create two dict types with different key types
        dict!(
            env,
            dict_a,
            primitive!(env, PrimitiveType::String),
            primitive!(env, PrimitiveType::Number)
        );
        dict!(
            env,
            dict_b,
            primitive!(env, PrimitiveType::Boolean),
            primitive!(env, PrimitiveType::Number)
        );

        let mut lattice_env = LatticeEnvironment::new(&env);

        // Meeting two dicts with different key types should return empty (Never)
        assert_equiv!(env, dict_a.meet(dict_b, &mut lattice_env), []);
    }

    #[test]
    fn is_subtype_of_dict() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Create dicts to test invariance of keys and covariance of values
        // Integer <: Number
        dict!(
            env,
            dict_string_number,
            primitive!(env, PrimitiveType::String),
            primitive!(env, PrimitiveType::Number)
        );
        dict!(
            env,
            dict_string_integer,
            primitive!(env, PrimitiveType::String),
            primitive!(env, PrimitiveType::Integer)
        );

        // Same value type, different key type
        dict!(
            env,
            integer_key_number_value,
            primitive!(env, PrimitiveType::Integer),
            primitive!(env, PrimitiveType::Number)
        );

        let mut analysis_env = AnalysisEnvironment::new(&env);

        // Dict<String, Integer> should be a subtype of Dict<String, Number> (covariant values)
        assert!(dict_string_integer.is_subtype_of(dict_string_number, &mut analysis_env));

        // Dict<String, Number> should not be a subtype of Dict<String, Integer>
        assert!(!dict_string_number.is_subtype_of(dict_string_integer, &mut analysis_env));

        // Dict<Integer, Number> should not be a subtype of Dict<String, Number> (invariant keys)
        assert!(!integer_key_number_value.is_subtype_of(dict_string_number, &mut analysis_env));
    }

    #[test]
    fn is_equivalent_dict() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Create dicts with equivalent types
        dict!(
            env,
            dict_a,
            primitive!(env, PrimitiveType::String),
            primitive!(env, PrimitiveType::Number)
        );
        dict!(
            env,
            dict_b,
            primitive!(env, PrimitiveType::String),
            primitive!(env, PrimitiveType::Number)
        );

        // Different key type
        dict!(
            env,
            dict_c,
            primitive!(env, PrimitiveType::Boolean),
            primitive!(env, PrimitiveType::Number)
        );

        let mut analysis_env = AnalysisEnvironment::new(&env);

        // Dicts with equivalent key and value types should be equivalent
        assert!(dict_a.is_equivalent(dict_b, &mut analysis_env));

        // Dicts with different key types should not be equivalent
        assert!(!dict_a.is_equivalent(dict_c, &mut analysis_env));
    }

    #[test]
    fn simplify_dict() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Create a dict with union types that contain duplicates
        dict!(
            env,
            dict_with_duplicates,
            union!(
                env,
                [
                    primitive!(env, PrimitiveType::String),
                    primitive!(env, PrimitiveType::String)
                ]
            ),
            union!(
                env,
                [
                    primitive!(env, PrimitiveType::Number),
                    primitive!(env, PrimitiveType::Number)
                ]
            )
        );

        let mut simplify_env = SimplifyEnvironment::new(&env);

        // Simplifying should remove duplicates in both key and value types
        assert_equiv!(
            env,
            [dict_with_duplicates.simplify(&mut simplify_env)],
            [dict!(
                env,
                primitive!(env, PrimitiveType::String),
                primitive!(env, PrimitiveType::Number)
            )]
        );
    }

    #[test]
    fn dict_concrete_check() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);
        let mut analysis_env = AnalysisEnvironment::new(&env);

        // A dict with concrete key and value types should be concrete
        dict!(
            env,
            concrete_dict,
            primitive!(env, PrimitiveType::String),
            primitive!(env, PrimitiveType::Number)
        );
        assert!(concrete_dict.is_concrete(&mut analysis_env));

        // A dict with a non-concrete key type should not be concrete
        dict!(
            env,
            non_concrete_key_dict,
            instantiate_infer(&env, 0_u32),
            primitive!(env, PrimitiveType::Number)
        );
        assert!(!non_concrete_key_dict.is_concrete(&mut analysis_env));

        // A dict with a non-concrete value type should not be concrete
        dict!(
            env,
            non_concrete_value_dict,
            primitive!(env, PrimitiveType::String),
            instantiate_infer(&env, 0_u32)
        );
        assert!(!non_concrete_value_dict.is_concrete(&mut analysis_env));
    }

    #[test]
    fn join_different_intrinsic_types() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Create a list and a dict
        let list = list!(env, primitive!(env, PrimitiveType::String));
        let dict = dict!(
            env,
            primitive!(env, PrimitiveType::String),
            primitive!(env, PrimitiveType::Number)
        );

        let mut lattice_env = LatticeEnvironment::new(&env);

        // Joining a list and a dict should give a union of both
        assert_equiv!(
            env,
            env.r#type(list).join(env.r#type(dict), &mut lattice_env),
            [list, dict]
        );
    }

    #[test]
    fn meet_different_intrinsic_types() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Create a list and a dict
        let list = list!(env, primitive!(env, PrimitiveType::String));
        let dict = dict!(
            env,
            primitive!(env, PrimitiveType::String),
            primitive!(env, PrimitiveType::Number)
        );

        let mut lattice_env = LatticeEnvironment::new(&env);

        // Meeting a list and a dict should give Never (empty)
        let met = env.r#type(list).meet(env.r#type(dict), &mut lattice_env);
        assert!(met.is_empty());
    }

    #[test]
    fn lattice_laws_for_intrinsics() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Create three distinct list types
        let number_type = primitive!(env, PrimitiveType::Number);
        let string_type = primitive!(env, PrimitiveType::String);
        let boolean_type = primitive!(env, PrimitiveType::Boolean);

        let list_a = list!(env, number_type);
        let list_b = list!(env, string_type);
        let list_c = list!(env, boolean_type);

        // Verify lattice laws for lists
        assert_lattice_laws(&env, list_a, list_b, list_c);

        // Create three distinct dict types
        let dict_a = dict!(env, number_type, string_type);
        let dict_b = dict!(env, number_type, boolean_type);
        let dict_c = dict!(env, string_type, boolean_type);

        // Verify lattice laws for dicts
        assert_lattice_laws(&env, dict_a, dict_b, dict_c);
    }

    #[test]
    fn dict_inference_with_non_concrete_keys() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Create a dict with an inference variable as key
        let infer_var = instantiate_infer(&env, 0_u32);
        let number_type = primitive!(env, PrimitiveType::Number);
        let string_type = primitive!(env, PrimitiveType::String);

        let dict_a = dict!(env, infer_var, number_type);
        let dict_b = dict!(env, string_type, number_type);

        let mut lattice_env = LatticeEnvironment::new(&env);
        lattice_env.set_inference_enabled(true);

        // During inference, joining dicts with non-concrete keys should work using the carrier
        // pattern
        let joined = env
            .r#type(dict_a)
            .join(env.r#type(dict_b), &mut lattice_env);
        assert!(!joined.is_empty());

        // Meeting should also work with the carrier pattern
        let met = env
            .r#type(dict_a)
            .meet(env.r#type(dict_b), &mut lattice_env);
        assert!(!met.is_empty());

        // When inference is disabled, the behavior should be different
        lattice_env.set_inference_enabled(false);

        let joined_no_inference = env
            .r#type(dict_a)
            .join(env.r#type(dict_b), &mut lattice_env);
        assert_equiv!(env, joined_no_inference, [dict_a, dict_b]);

        let met_no_inference = env
            .r#type(dict_a)
            .meet(env.r#type(dict_b), &mut lattice_env);
        assert!(met_no_inference.is_empty());
    }

    #[test]
    fn list_distribute_union() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);
        let mut analysis_env = AnalysisEnvironment::new(&env);

        // Create primitive types
        let number = primitive!(env, PrimitiveType::Number);
        let string = primitive!(env, PrimitiveType::String);
        let boolean = primitive!(env, PrimitiveType::Boolean);

        // Create a list with a normal element type
        list!(env, list_normal, number);

        // Should return the original list since there's no union to distribute
        assert_equiv!(
            env,
            list_normal.distribute_union(&mut analysis_env),
            [list_normal.id]
        );

        // Create a list with a union element type
        let union_type = union!(env, [string, boolean]);
        list!(env, list_with_union, union_type);

        // Should result in two separate lists, one for each variant in the union
        assert_equiv!(
            env,
            list_with_union.distribute_union(&mut analysis_env),
            [list!(env, string), list!(env, boolean)]
        );
    }

    #[test]
    fn list_distribute_intersection() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);
        let mut analysis_env = AnalysisEnvironment::new(&env);

        // Create a list with an intersection element type
        let number = primitive!(env, PrimitiveType::Number);
        let string = primitive!(env, PrimitiveType::String);
        let intersection_type = intersection!(env, [number, string]);

        list!(env, list_with_intersection, intersection_type);

        assert_equiv!(
            env,
            list_with_intersection.distribute_intersection(&mut analysis_env),
            [list!(env, number), list!(env, string)]
        );
    }

    #[test]
    fn dict_distribute_union() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);
        let mut analysis_env = AnalysisEnvironment::new(&env);

        // Create primitive types
        let number = primitive!(env, PrimitiveType::Number);
        let string = primitive!(env, PrimitiveType::String);
        let boolean = primitive!(env, PrimitiveType::Boolean);

        // Create a dict with a normal value type
        dict!(env, dict_normal, string, number);

        // Should return the original dict since there's no union to distribute
        assert_equiv!(
            env,
            dict_normal.distribute_union(&mut analysis_env),
            [dict_normal.id]
        );

        // Create a dict with a union value type
        let union_type = union!(env, [number, boolean]);
        dict!(env, dict_with_union, string, union_type);

        // Should result in two separate dicts, one for each variant in the value union
        assert_equiv!(
            env,
            dict_with_union.distribute_union(&mut analysis_env),
            [dict!(env, string, number), dict!(env, string, boolean)]
        );

        // Create a dict with a union key type
        let key_union = union!(env, [string, number]);
        dict!(env, dict_with_union_key, key_union, boolean);

        // Distribute the union on the key - this should NOT distribute since keys are invariant
        // Should return the original dict, as Dict<K, V> only distributes unions in its value type
        assert_equiv!(
            env,
            dict_with_union_key.distribute_union(&mut analysis_env),
            [dict_with_union_key.id]
        );
    }

    #[test]
    fn dict_distribute_intersection() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);
        let mut analysis_env = AnalysisEnvironment::new(&env);

        // Create a dict with an intersection value type
        let number = primitive!(env, PrimitiveType::Number);
        let string = primitive!(env, PrimitiveType::String);
        let intersection_type = intersection!(env, [number, string]);

        dict!(env, dict_with_intersection, string, intersection_type);

        // Distribute the intersection
        // Should return the original dict (no distribution necessary)
        assert_equiv!(
            env,
            dict_with_intersection.distribute_intersection(&mut analysis_env),
            [dict!(env, string, number), dict!(env, string, string)]
        );
    }

    #[test]
    fn intrinsic_type_distribute_delegation() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);
        let mut analysis_env = AnalysisEnvironment::new(&env);

        // Create primitive types
        let number = primitive!(env, PrimitiveType::Number);
        let string = primitive!(env, PrimitiveType::String);
        let boolean = primitive!(env, PrimitiveType::Boolean);

        // Create union types
        let union_type = union!(env, [number, boolean]);

        // Test that IntrinsicType::List correctly delegates to ListType
        list!(env, list_with_union, union_type);

        // Distribute the union
        // Should result in two separate lists
        assert_equiv!(
            env,
            list_with_union.distribute_union(&mut analysis_env),
            [list!(env, number), list!(env, boolean)]
        );

        // Test that IntrinsicType::Dict correctly delegates to DictType
        dict!(env, dict_with_union, string, union_type);

        // Distribute the union
        // Should result in two separate dicts
        assert_equiv!(
            env,
            dict_with_union.distribute_union(&mut analysis_env),
            [dict!(env, string, number), dict!(env, string, boolean)]
        );
    }

    #[test]
    fn collect_constraints_list_lower_bound() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Create a list with a concrete type
        let number = primitive!(env, PrimitiveType::Number);
        list!(env, concrete_list, number);

        // Create a list with an inference variable
        let hole = HoleId::new(0);
        let infer_var = instantiate_infer(&env, hole);
        list!(env, infer_list, infer_var);

        // Create an inference environment to collect constraints
        let mut inference_env = InferenceEnvironment::new(&env);

        // List is covariant in its element type, so the element type of the subtype
        // must be a subtype of the element type of the supertype
        concrete_list.collect_constraints(infer_list, &mut inference_env);

        let constraints = inference_env.take_constraints();
        assert_eq!(
            constraints,
            [Constraint::LowerBound {
                variable: Variable::synthetic(VariableKind::Hole(hole)),
                bound: number
            }]
        );
    }

    #[test]
    fn collect_constraints_list_upper_bound() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Create a list with a concrete type
        let number = primitive!(env, PrimitiveType::Number);
        list!(env, concrete_list, number);

        // Create a list with an inference variable
        let hole = HoleId::new(0);
        let infer_var = instantiate_infer(&env, hole);
        list!(env, infer_list, infer_var);

        // Create an inference environment to collect constraints
        let mut inference_env = InferenceEnvironment::new(&env);

        // Collect constraints in the other direction
        infer_list.collect_constraints(concrete_list, &mut inference_env);

        let constraints = inference_env.take_constraints();
        assert_eq!(
            constraints,
            [Constraint::UpperBound {
                variable: Variable::synthetic(VariableKind::Hole(hole)),
                bound: number
            }]
        );
    }

    #[test]
    fn collect_constraints_nested_list() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Create a nested list with inference variable
        let hole = HoleId::new(0);
        let infer_var = instantiate_infer(&env, hole);
        let inner_list_a = list!(env, infer_var);
        list!(env, list_a, inner_list_a);

        // Create a nested list with concrete type
        let number = primitive!(env, PrimitiveType::Number);
        let inner_list_b = list!(env, number);
        list!(env, list_b, inner_list_b);

        let mut inference_env = InferenceEnvironment::new(&env);

        // Collect constraints between nested lists
        list_a.collect_constraints(list_b, &mut inference_env);

        let constraints = inference_env.take_constraints();
        assert_eq!(
            constraints,
            [Constraint::UpperBound {
                variable: Variable::synthetic(VariableKind::Hole(hole)),
                bound: number
            }]
        );
    }

    #[test]
    fn collect_constraints_dict_key_invariant() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Create a dict with a concrete key and an inference variable as value
        let string = primitive!(env, PrimitiveType::String);
        let hole = HoleId::new(0);
        let infer_var = instantiate_infer(&env, hole);
        dict!(env, dict_a, string, infer_var);

        // Create a dict with a concrete key and concrete value
        let number = primitive!(env, PrimitiveType::Number);
        dict!(env, dict_b, string, number);

        let mut inference_env = InferenceEnvironment::new(&env);

        // Collect constraints between the two dictionary types
        dict_a.collect_constraints(dict_b, &mut inference_env);

        let constraints = inference_env.take_constraints();
        assert_eq!(
            constraints,
            [Constraint::UpperBound {
                variable: Variable::synthetic(VariableKind::Hole(hole)),
                bound: number
            }]
        );
    }

    #[test]
    fn collect_constraints_dict_key_variable() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Create a dict with an inference variable as key
        let hole = HoleId::new(0);
        let infer_key = instantiate_infer(&env, hole);
        let number = primitive!(env, PrimitiveType::Number);
        dict!(env, dict_a, infer_key, number);

        // Create a dict with a concrete key
        let string = primitive!(env, PrimitiveType::String);
        dict!(env, dict_b, string, number);

        let mut inference_env = InferenceEnvironment::new(&env);

        // Collect constraints between the two dictionary types
        dict_a.collect_constraints(dict_b, &mut inference_env);

        let constraints = inference_env.take_constraints();
        assert_eq!(
            constraints,
            [Constraint::Equals {
                variable: Variable::synthetic(VariableKind::Hole(hole)),
                r#type: string
            }]
        );
    }

    #[test]
    fn collect_constraints_dict_bidirectional() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Create a dict with inference variables for both key and value
        let hole_key = HoleId::new(0);
        let infer_key = instantiate_infer(&env, hole_key);
        let hole_value = HoleId::new(1);
        let infer_value = instantiate_infer(&env, hole_value);
        dict!(env, dict_a, infer_key, infer_value);

        // Create a dict with concrete types
        let string = primitive!(env, PrimitiveType::String);
        let number = primitive!(env, PrimitiveType::Number);
        dict!(env, dict_b, string, number);

        let mut inference_env = InferenceEnvironment::new(&env);

        // Collect constraints between the two dictionary types
        dict_a.collect_constraints(dict_b, &mut inference_env);

        let constraints = inference_env.take_constraints();
        // We expect two constraints:
        // 1. infer_key = string (keys are invariant)
        // 2. infer_value <: number (values are covariant)
        assert_eq!(
            constraints,
            [
                Constraint::Equals {
                    variable: Variable::synthetic(VariableKind::Hole(hole_key)),
                    r#type: string,
                },
                Constraint::UpperBound {
                    variable: Variable::synthetic(VariableKind::Hole(hole_value)),
                    bound: number,
                }
            ]
        );
    }

    #[test]
    fn collect_constraints_concrete_intrinsics() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Create concrete lists and dicts
        let integer = primitive!(env, PrimitiveType::Integer);
        let number = primitive!(env, PrimitiveType::Number);
        let string = primitive!(env, PrimitiveType::String);

        // Integer <: Number
        list!(env, integer_list, integer);
        list!(env, number_list, number);

        dict!(env, dict_a, string, integer);
        dict!(env, dict_b, string, number);

        let mut inference_env = InferenceEnvironment::new(&env);

        // Collect constraints for concrete lists
        integer_list.collect_constraints(number_list, &mut inference_env);

        // No constraints should be generated for concrete types
        assert!(inference_env.take_constraints().is_empty());

        // Collect constraints for concrete dicts
        dict_a.collect_constraints(dict_b, &mut inference_env);

        // No constraints should be generated for concrete types
        assert!(inference_env.take_constraints().is_empty());
    }

    // Tests for ListType.collect_structural_edges
    #[test]
    fn collect_structural_edges_list_basic() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Create an inference variable
        let hole = HoleId::new(0);
        let infer_var = instantiate_infer(&env, hole);

        // Create a list with an inference variable: List<_0>
        list!(env, list_type, infer_var);

        let mut inference_env = InferenceEnvironment::new(&env);

        // Create a variable to use as the source in a structural edge
        let source_var = Variable::synthetic(VariableKind::Hole(HoleId::new(1)));
        let partial_edge = PartialStructuralEdge::Source(source_var);

        // Collect structural edges
        list_type.collect_structural_edges(partial_edge, &mut inference_env);

        // Since list elements are covariant, the source should flow to the element infer var
        // We expect: _1 -> _0
        let constraints = inference_env.take_constraints();
        assert_eq!(
            constraints,
            [Constraint::StructuralEdge {
                source: source_var,
                target: Variable::synthetic(VariableKind::Hole(hole)),
            }]
        );
    }

    #[test]
    fn collect_structural_edges_list_target() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Create an inference variable
        let hole = HoleId::new(0);
        let infer_var = instantiate_infer(&env, hole);

        // Create a list with an inference variable: List<_0>
        list!(env, list_type, infer_var);

        let mut inference_env = InferenceEnvironment::new(&env);

        // Create a variable to use as the target in a structural edge
        let target_var = Variable::synthetic(VariableKind::Hole(HoleId::new(1)));
        let partial_edge = PartialStructuralEdge::Target(target_var);

        // Collect structural edges
        list_type.collect_structural_edges(partial_edge, &mut inference_env);

        // Since list elements are covariant, the element infer var should flow to the target
        // We expect: _0 -> _1
        let constraints = inference_env.take_constraints();
        assert_eq!(
            constraints,
            [Constraint::StructuralEdge {
                source: Variable::synthetic(VariableKind::Hole(hole)),
                target: target_var,
            }]
        );
    }

    #[test]
    fn collect_structural_edges_nested_list() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Create an inference variable
        let hole = HoleId::new(0);
        let infer_var = instantiate_infer(&env, hole);

        // Create a nested list: List<List<_0>>
        let inner_list = list!(env, infer_var);
        list!(env, nested_list, inner_list);

        let mut inference_env = InferenceEnvironment::new(&env);

        // Create a variable to use as the source in a structural edge
        let source_var = Variable::synthetic(VariableKind::Hole(HoleId::new(1)));
        let partial_edge = PartialStructuralEdge::Source(source_var);

        // Collect structural edges
        nested_list.collect_structural_edges(partial_edge, &mut inference_env);

        // Since list elements are covariant at both levels, the source should flow through to the
        // innermost element We expect: _1 -> _0 (flow from source through both covariant
        // positions to infer var)
        let constraints = inference_env.take_constraints();
        assert_eq!(
            constraints,
            [Constraint::StructuralEdge {
                source: source_var,
                target: Variable::synthetic(VariableKind::Hole(hole)),
            }]
        );
    }

    #[test]
    fn collect_structural_edges_list_contravariant_context() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Create an inference variable
        let hole = HoleId::new(0);
        let infer_var = instantiate_infer(&env, hole);

        // Create a list with an inference variable: List<_0>
        list!(env, list_type, infer_var);

        let mut inference_env = InferenceEnvironment::new(&env);

        // Create a variable to use as the source in a structural edge
        let source_var = Variable::synthetic(VariableKind::Hole(HoleId::new(1)));
        let partial_edge = PartialStructuralEdge::Source(source_var);

        // Collect structural edges in a contravariant context
        inference_env.in_contravariant(|env| {
            list_type.collect_structural_edges(partial_edge, env);
        });

        // In a contravariant context, the flow direction is inverted
        // We expect: _0 -> _1 (element flows to source)
        let constraints = inference_env.take_constraints();
        assert_eq!(
            constraints,
            [Constraint::StructuralEdge {
                source: Variable::synthetic(VariableKind::Hole(hole)),
                target: source_var,
            }]
        );
    }

    // Tests for DictType.collect_structural_edges
    #[test]
    fn collect_structural_edges_dict_key() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Create inference variables
        let key_hole = HoleId::new(0);
        let key_var = instantiate_infer(&env, key_hole);
        let string = primitive!(env, PrimitiveType::String);

        // Create a dict with an inference variable as key: Dict<_0, String>
        dict!(env, dict_type, key_var, string);

        let mut inference_env = InferenceEnvironment::new(&env);

        // Create a variable to use as the source in a structural edge
        let source_var = Variable::synthetic(VariableKind::Hole(HoleId::new(1)));
        let partial_edge = PartialStructuralEdge::Source(source_var);

        // Collect structural edges
        dict_type.collect_structural_edges(partial_edge, &mut inference_env);

        // Dict keys are invariant, so no structural edges should be collected for the key
        // The environment will discard edges for invariant positions
        let constraints = inference_env.take_constraints();
        assert!(constraints.is_empty());
    }

    #[test]
    fn collect_structural_edges_dict_value() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Create inference variables
        let value_hole = HoleId::new(0);
        let value_var = instantiate_infer(&env, value_hole);
        let string = primitive!(env, PrimitiveType::String);

        // Create a dict with an inference variable as value: Dict<String, _0>
        dict!(env, dict_type, string, value_var);

        let mut inference_env = InferenceEnvironment::new(&env);

        // Create a variable to use as the source in a structural edge
        let source_var = Variable::synthetic(VariableKind::Hole(HoleId::new(1)));
        let partial_edge = PartialStructuralEdge::Source(source_var);

        // Collect structural edges
        dict_type.collect_structural_edges(partial_edge, &mut inference_env);

        // Dict values are covariant, so the source should flow to the value infer var
        // We expect: _1 -> _0
        let constraints = inference_env.take_constraints();
        assert_eq!(
            constraints,
            [Constraint::StructuralEdge {
                source: source_var,
                target: Variable::synthetic(VariableKind::Hole(value_hole)),
            }]
        );
    }

    #[test]
    fn collect_structural_edges_dict_both_vars() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Create inference variables for both key and value
        let key_hole = HoleId::new(0);
        let key_var = instantiate_infer(&env, key_hole);
        let value_hole = HoleId::new(1);
        let value_var = instantiate_infer(&env, value_hole);

        // Create a dict with inference variables for both key and value: Dict<_0, _1>
        dict!(env, dict_type, key_var, value_var);

        let mut inference_env = InferenceEnvironment::new(&env);

        // Create a variable to use as the source in a structural edge
        let source_var = Variable::synthetic(VariableKind::Hole(HoleId::new(2)));
        let partial_edge = PartialStructuralEdge::Source(source_var);

        // Collect structural edges
        dict_type.collect_structural_edges(partial_edge, &mut inference_env);

        // Dict keys are invariant (no edge), values are covariant (source flows to value)
        // We expect only: _2 -> _1
        let constraints = inference_env.take_constraints();
        assert_eq!(
            constraints,
            [Constraint::StructuralEdge {
                source: source_var,
                target: Variable::synthetic(VariableKind::Hole(value_hole)),
            }]
        );
    }

    #[test]
    fn collect_structural_edges_dict_contravariant_context() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Create an inference variable for the value
        let value_hole = HoleId::new(0);
        let value_var = instantiate_infer(&env, value_hole);
        let string = primitive!(env, PrimitiveType::String);

        // Create a dict with an inference variable as value: Dict<String, _0>
        dict!(env, dict_type, string, value_var);

        let mut inference_env = InferenceEnvironment::new(&env);

        // Create a variable to use as the source in a structural edge
        let source_var = Variable::synthetic(VariableKind::Hole(HoleId::new(1)));
        let partial_edge = PartialStructuralEdge::Source(source_var);

        // Collect structural edges in a contravariant context
        inference_env.in_contravariant(|env| {
            dict_type.collect_structural_edges(partial_edge, env);
        });

        // In a contravariant context, the flow direction is inverted for covariant positions
        // We expect: _0 -> _1 (value flows to source)
        let constraints = inference_env.take_constraints();
        assert_eq!(
            constraints,
            [Constraint::StructuralEdge {
                source: Variable::synthetic(VariableKind::Hole(value_hole)),
                target: source_var,
            }]
        );
    }

    #[test]
    fn collect_structural_edges_dict_nested() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Create an inference variable
        let hole = HoleId::new(0);
        let infer_var = instantiate_infer(&env, hole);
        let string = primitive!(env, PrimitiveType::String);

        // Create a nested structure: Dict<String, List<_0>>
        let inner_list = list!(env, infer_var);
        dict!(env, nested_dict, string, inner_list);

        let mut inference_env = InferenceEnvironment::new(&env);

        // Create a variable to use as the source in a structural edge
        let source_var = Variable::synthetic(VariableKind::Hole(HoleId::new(1)));
        let partial_edge = PartialStructuralEdge::Source(source_var);

        // Collect structural edges
        nested_dict.collect_structural_edges(partial_edge, &mut inference_env);

        // Dict values and list elements are both covariant, so the source should flow through to
        // the innermost element We expect: _1 -> _0
        let constraints = inference_env.take_constraints();
        assert_eq!(
            constraints,
            [Constraint::StructuralEdge {
                source: source_var,
                target: Variable::synthetic(VariableKind::Hole(hole)),
            }]
        );
    }

    #[test]
    fn collect_structural_edges_dict_list_nested_complex() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Create inference variables
        let key_hole = HoleId::new(0);
        let key_var = instantiate_infer(&env, key_hole);
        let value_hole = HoleId::new(1);
        let value_var = instantiate_infer(&env, value_hole);

        // Create a complex nested structure: Dict<List<_0>, List<_1>>
        let key_list = list!(env, key_var);
        let value_list = list!(env, value_var);
        dict!(env, complex_dict, key_list, value_list);

        let mut inference_env = InferenceEnvironment::new(&env);

        // Create a variable to use as the source in a structural edge
        let source_var = Variable::synthetic(VariableKind::Hole(HoleId::new(2)));
        let partial_edge = PartialStructuralEdge::Source(source_var);

        // Collect structural edges
        complex_dict.collect_structural_edges(partial_edge, &mut inference_env);

        // Dict keys are invariant, so no edge for key_var
        // Dict values and list elements are covariant, so source flows to value_var
        // We expect only: _2 -> _1
        let constraints = inference_env.take_constraints();
        assert_eq!(
            constraints,
            [Constraint::StructuralEdge {
                source: source_var,
                target: Variable::synthetic(VariableKind::Hole(value_hole)),
            }]
        );
    }

    #[test]
    fn collect_structural_edges_intrinsic_type_delegation() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Create inference variables
        let list_hole = HoleId::new(0);
        let list_var = instantiate_infer(&env, list_hole);
        let dict_hole = HoleId::new(1);
        let dict_var = instantiate_infer(&env, dict_hole);
        let string = primitive!(env, PrimitiveType::String);

        // Create intrinsic types
        let list = list!(env, list_var);
        let dict = dict!(env, string, dict_var);

        // Get the TypeIds for the intrinsic types
        let list_id = list;
        let dict_id = dict;

        let mut inference_env = InferenceEnvironment::new(&env);

        // Create a variable to use as the source in a structural edge
        let source_var = Variable::synthetic(VariableKind::Hole(HoleId::new(2)));
        let partial_edge = PartialStructuralEdge::Source(source_var);

        // Collect structural edges for both intrinsic types
        env.r#type(list_id)
            .collect_structural_edges(partial_edge, &mut inference_env);

        // The IntrinsicType should delegate to ListType
        let list_constraints = inference_env.take_constraints();
        assert_eq!(
            list_constraints,
            [Constraint::StructuralEdge {
                source: source_var,
                target: Variable::synthetic(VariableKind::Hole(list_hole)),
            }]
        );

        // Now test dict
        env.r#type(dict_id)
            .collect_structural_edges(partial_edge, &mut inference_env);

        // The IntrinsicType should delegate to DictType
        let dict_constraints = inference_env.take_constraints();
        assert_eq!(
            dict_constraints,
            [Constraint::StructuralEdge {
                source: source_var,
                target: Variable::synthetic(VariableKind::Hole(dict_hole)),
            }]
        );
    }

    #[test]
    fn simplify_recursive_list() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        let r#type = env.types.intern(|id| PartialType {
            span: SpanId::SYNTHETIC,
            kind: env.intern_kind(TypeKind::Intrinsic(IntrinsicType::List(ListType {
                element: id.value(),
            }))),
        });

        let mut simplify = SimplifyEnvironment::new(&env);
        let type_id = simplify.simplify(r#type.id);

        let r#type = env.r#type(type_id);

        assert_matches!(
            r#type.kind,
            TypeKind::Intrinsic(IntrinsicType::List(ListType { element })) if *element == type_id
        );
    }

    #[test]
    fn simplify_recursive_dict() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        let r#type = env.types.intern(|id| PartialType {
            span: SpanId::SYNTHETIC,
            kind: env.intern_kind(TypeKind::Intrinsic(IntrinsicType::Dict(DictType {
                key: id.value(),
                value: id.value(),
            }))),
        });

        let mut simplify = SimplifyEnvironment::new(&env);
        let type_id = simplify.simplify(r#type.id);

        let r#type = env.r#type(type_id);

        assert_matches!(
            r#type.kind,
            TypeKind::Intrinsic(IntrinsicType::Dict(DictType { key, value })) if *key == type_id && *value == type_id
        );
    }

    #[test]
    fn instantiate_list() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        let argument = env.counter.generic_argument.next();
        let param = instantiate_param(&env, argument);

        let value = generic!(
            env,
            opaque!(env, "A", list!(env, param)),
            [GenericArgument {
                id: argument,
                name: heap.intern_symbol("T"),
                constraint: None
            }]
        );

        let mut instantiate = InstantiateEnvironment::new(&env);
        let type_id = instantiate.instantiate(value);
        assert!(instantiate.take_diagnostics().is_empty());

        let result = env.r#type(type_id);

        let generic = result.kind.generic().expect("should be a generic type");
        let opaque = env
            .r#type(generic.base)
            .kind
            .opaque()
            .expect("should be an opaque type");
        let element = env
            .r#type(opaque.repr)
            .kind
            .intrinsic()
            .expect("should be an intrinsic type")
            .list()
            .expect("should be a list")
            .element;
        let element = env.r#type(element).kind.param().expect("should be a param");

        assert_eq!(generic.arguments.len(), 1);
        assert_eq!(
            *element,
            Param {
                argument: generic.arguments[0].id
            }
        );
        assert_ne!(element.argument, argument);
    }

    #[test]
    fn instantiate_dict() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        let argument = env.counter.generic_argument.next();
        let param = instantiate_param(&env, argument);

        let value = generic!(
            env,
            opaque!(env, "A", dict!(env, param, param)),
            [GenericArgument {
                id: argument,
                name: heap.intern_symbol("T"),
                constraint: None
            }]
        );

        let mut instantiate = InstantiateEnvironment::new(&env);
        let type_id = instantiate.instantiate(value);
        assert!(instantiate.take_diagnostics().is_empty());

        let result = env.r#type(type_id);
        let generic = result.kind.generic().expect("should be a generic type");
        let opaque = env
            .r#type(generic.base)
            .kind
            .opaque()
            .expect("should be an opaque type");
        let dict = env
            .r#type(opaque.repr)
            .kind
            .intrinsic()
            .expect("should be an intrinsic type")
            .dict()
            .expect("should be a dict");
        let key = env
            .r#type(dict.key)
            .kind
            .param()
            .expect("should be a param");
        let value = env
            .r#type(dict.value)
            .kind
            .param()
            .expect("should be a param");

        assert_eq!(generic.arguments.len(), 1);
        assert_eq!(
            *key,
            Param {
                argument: generic.arguments[0].id
            }
        );
        assert_ne!(key.argument, argument);

        assert_eq!(
            *value,
            Param {
                argument: generic.arguments[0].id
            }
        );
        assert_ne!(value.argument, argument);
    }
}
