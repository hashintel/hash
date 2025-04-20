use core::ops::ControlFlow;

use pretty::RcDoc;
use smallvec::SmallVec;

use super::TypeKind;
use crate::r#type::{
    Type, TypeId,
    environment::{Environment, LatticeEnvironment, SimplifyEnvironment, TypeAnalysisEnvironment},
    error::type_mismatch,
    lattice::Lattice,
    pretty_print::PrettyPrint,
    recursion::RecursionDepthBoundary,
};

/// Represents a list type.
///
/// List types maintain an element type that is **covariant**.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct ListType {
    element: TypeId,
}

impl<'heap> Lattice<'heap> for ListType {
    fn join(
        self: Type<'heap, Self>,
        other: Type<'heap, Self>,
        env: &mut LatticeEnvironment<'_, 'heap>,
    ) -> SmallVec<TypeId, 4> {
        let element = env.join(self.kind.element, other.kind.element);

        if element == self.kind.element {
            return SmallVec::from_slice(&[self.id]);
        }

        if element == other.kind.element {
            return SmallVec::from_slice(&[other.id]);
        }

        SmallVec::from_slice(&[env.alloc(|id| Type {
            id,
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

        if element == self.kind.element {
            return SmallVec::from_slice(&[self.id]);
        }

        if element == other.kind.element {
            return SmallVec::from_slice(&[other.id]);
        }

        SmallVec::from_slice(&[env.alloc(|id| Type {
            id,
            span: self.span,
            kind: env.intern_kind(TypeKind::Intrinsic(IntrinsicType::List(Self { element }))),
        })])
    }

    fn is_bottom(self: Type<'heap, Self>, _: &mut TypeAnalysisEnvironment<'_, 'heap>) -> bool {
        // Never bottom, even if the inner element is bottom, as a list can always be empty.
        false
    }

    fn is_top(self: Type<'heap, Self>, _: &mut TypeAnalysisEnvironment<'_, 'heap>) -> bool {
        false
    }

    fn is_concrete(self: Type<'heap, Self>, env: &mut TypeAnalysisEnvironment<'_, 'heap>) -> bool {
        env.is_concrete(self.kind.element)
    }

    fn distribute_union(
        self: Type<'heap, Self>,
        env: &mut TypeAnalysisEnvironment<'_, 'heap>,
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
                env.alloc(|id| Type {
                    id,
                    span: self.span,
                    kind: env
                        .intern_kind(TypeKind::Intrinsic(IntrinsicType::List(Self { element }))),
                })
            })
            .collect()
    }

    fn distribute_intersection(
        self: Type<'heap, Self>,
        _: &mut TypeAnalysisEnvironment<'_, 'heap>,
    ) -> SmallVec<TypeId, 16> {
        // List<T> is covariant over `T`, therefore no distribution is needed.
        SmallVec::from_slice(&[self.id])
    }

    fn is_subtype_of(
        self: Type<'heap, Self>,
        supertype: Type<'heap, Self>,
        env: &mut TypeAnalysisEnvironment<'_, 'heap>,
    ) -> bool {
        env.in_covariant(|env| env.is_subtype_of(self.kind.element, supertype.kind.element))
    }

    fn is_equivalent(
        self: Type<'heap, Self>,
        other: Type<'heap, Self>,
        env: &mut TypeAnalysisEnvironment<'_, 'heap>,
    ) -> bool {
        env.in_covariant(|env| env.is_equivalent(self.kind.element, other.kind.element))
    }

    fn simplify(self: Type<'heap, Self>, env: &mut SimplifyEnvironment<'_, 'heap>) -> TypeId {
        let element = env.simplify(self.kind.element);

        if element == self.kind.element {
            return self.id;
        }

        env.alloc(|id| Type {
            id,
            span: self.span,
            kind: env.intern_kind(TypeKind::Intrinsic(IntrinsicType::List(Self { element }))),
        })
    }
}

impl PrettyPrint for ListType {
    fn pretty<'env>(
        &self,
        env: &'env Environment,
        limit: RecursionDepthBoundary,
    ) -> RcDoc<'env, anstyle::Style> {
        RcDoc::text("List")
            .append(RcDoc::text("<"))
            .append(limit.pretty(env, self.element))
            .append(RcDoc::text(">"))
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
                env.alloc(|id| Type {
                    id,
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
            let self_key = env.types[self.kind.key].copied();
            let other_key = env.types[other.kind.key].copied();

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

            if value == self.kind.value {
                SmallVec::from_slice(&[self.id])
            } else if value == other.kind.value {
                SmallVec::from_slice(&[other.id])
            } else {
                SmallVec::from_slice(&[env.alloc(|id| Type {
                    id,
                    span: self.span,
                    kind: env.intern_kind(TypeKind::Intrinsic(IntrinsicType::Dict(Self {
                        key: self.kind.key,
                        value,
                    }))),
                })])
            }
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
            let self_key = env.types[self.kind.key].copied();
            let other_key = env.types[other.kind.key].copied();

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

            if value == self.kind.value {
                SmallVec::from_slice(&[self.id])
            } else if value == other.kind.value {
                SmallVec::from_slice(&[other.id])
            } else {
                SmallVec::from_slice(&[env.alloc(|id| Type {
                    id,
                    span: self.span,
                    kind: env.intern_kind(TypeKind::Intrinsic(IntrinsicType::Dict(Self {
                        key: self.kind.key,
                        value,
                    }))),
                })])
            }
        } else {
            SmallVec::new()
        }
    }

    fn is_bottom(self: Type<'heap, Self>, _: &mut TypeAnalysisEnvironment<'_, 'heap>) -> bool {
        // Never bottom, as even with a `!` key or value a dict can be empty
        false
    }

    fn is_top(self: Type<'heap, Self>, _: &mut TypeAnalysisEnvironment<'_, 'heap>) -> bool {
        false
    }

    fn is_concrete(self: Type<'heap, Self>, env: &mut TypeAnalysisEnvironment<'_, 'heap>) -> bool {
        env.is_concrete(self.kind.key) && env.is_concrete(self.kind.value)
    }

    fn distribute_union(
        self: Type<'heap, Self>,
        env: &mut TypeAnalysisEnvironment<'_, 'heap>,
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
                env.alloc(|id| Type {
                    id,
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
        _: &mut TypeAnalysisEnvironment<'_, 'heap>,
    ) -> SmallVec<TypeId, 16> {
        // Dict<K, V> is covariant over V and invariant of K, so no distribution necessary
        SmallVec::from_slice(&[self.id])
    }

    fn is_subtype_of(
        self: Type<'heap, Self>,
        supertype: Type<'heap, Self>,
        env: &mut TypeAnalysisEnvironment<'_, 'heap>,
    ) -> bool {
        env.in_invariant(|env| env.is_subtype_of(self.kind.key, supertype.kind.key))
            && env.in_covariant(|env| env.is_subtype_of(self.kind.value, supertype.kind.value))
    }

    fn is_equivalent(
        self: Type<'heap, Self>,
        other: Type<'heap, Self>,
        env: &mut TypeAnalysisEnvironment<'_, 'heap>,
    ) -> bool {
        env.is_equivalent(self.kind.key, other.kind.key)
            && env.is_equivalent(self.kind.value, other.kind.value)
    }

    fn simplify(self: Type<'heap, Self>, env: &mut SimplifyEnvironment<'_, 'heap>) -> TypeId {
        let key = env.simplify(self.kind.key);
        let value = env.simplify(self.kind.value);

        if self.kind.key == key && self.kind.value == value {
            return self.id;
        }

        env.alloc(|id| Type {
            id,
            span: self.span,
            kind: env.intern_kind(TypeKind::Intrinsic(IntrinsicType::Dict(Self {
                key,
                value,
            }))),
        })
    }
}

impl PrettyPrint for DictType {
    fn pretty<'env>(
        &self,
        env: &'env Environment,
        limit: RecursionDepthBoundary,
    ) -> RcDoc<'env, anstyle::Style> {
        RcDoc::text("Dict")
            .append(RcDoc::text("<"))
            .append(
                RcDoc::intersperse(
                    [self.key, self.value]
                        .into_iter()
                        .map(|id| limit.pretty(env, id)),
                    RcDoc::text(",").append(RcDoc::line()),
                )
                .nest(1)
                .group(),
            )
            .append(RcDoc::text(">"))
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
        env: &mut TypeAnalysisEnvironment<'_, 'heap>,
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

    fn is_bottom(self: Type<'heap, Self>, env: &mut TypeAnalysisEnvironment<'_, 'heap>) -> bool {
        match self.kind {
            Self::List(inner) => self.with(inner).is_bottom(env),
            Self::Dict(inner) => self.with(inner).is_bottom(env),
        }
    }

    fn is_top(self: Type<'heap, Self>, env: &mut TypeAnalysisEnvironment<'_, 'heap>) -> bool {
        match self.kind {
            Self::List(inner) => self.with(inner).is_top(env),
            Self::Dict(inner) => self.with(inner).is_top(env),
        }
    }

    fn is_concrete(self: Type<'heap, Self>, env: &mut TypeAnalysisEnvironment<'_, 'heap>) -> bool {
        match self.kind {
            Self::List(inner) => self.with(inner).is_concrete(env),
            Self::Dict(inner) => self.with(inner).is_concrete(env),
        }
    }

    fn distribute_union(
        self: Type<'heap, Self>,
        env: &mut TypeAnalysisEnvironment<'_, 'heap>,
    ) -> SmallVec<TypeId, 16> {
        match self.kind {
            Self::List(list_type) => self.with(list_type).distribute_union(env),
            Self::Dict(dict_type) => self.with(dict_type).distribute_union(env),
        }
    }

    fn distribute_intersection(
        self: Type<'heap, Self>,
        env: &mut TypeAnalysisEnvironment<'_, 'heap>,
    ) -> SmallVec<TypeId, 16> {
        match self.kind {
            Self::List(list_type) => self.with(list_type).distribute_intersection(env),
            Self::Dict(dict_type) => self.with(dict_type).distribute_intersection(env),
        }
    }

    // TODO: we need proper error messages for the `TypeKind` change (or at least a `type_mismatch`)
    fn is_subtype_of(
        self: Type<'heap, Self>,
        supertype: Type<'heap, Self>,
        env: &mut TypeAnalysisEnvironment<'_, 'heap>,
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
        env: &mut TypeAnalysisEnvironment<'_, 'heap>,
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

impl PrettyPrint for IntrinsicType {
    fn pretty<'env>(
        &self,
        env: &'env Environment,
        limit: RecursionDepthBoundary,
    ) -> RcDoc<'env, anstyle::Style> {
        match self {
            Self::List(list) => list.pretty(env, limit),
            Self::Dict(dict) => dict.pretty(env, limit),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{DictType, IntrinsicType, ListType};
    use crate::{
        heap::Heap,
        span::SpanId,
        r#type::{
            environment::{
                Environment, LatticeEnvironment, SimplifyEnvironment, TypeAnalysisEnvironment,
            },
            kind::{
                TypeKind,
                intersection::IntersectionType,
                primitive::PrimitiveType,
                test::{assert_equiv, dict, intersection, list, primitive, union},
                union::UnionType,
            },
            lattice::{Lattice as _, test::assert_lattice_laws},
            pretty_print::PrettyPrint as _,
            test::instantiate,
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

        let mut analysis_env = TypeAnalysisEnvironment::new(&env);

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

        let mut analysis_env = TypeAnalysisEnvironment::new(&env);

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
        let mut analysis_env = TypeAnalysisEnvironment::new(&env);

        // A list with a concrete element type should be concrete
        list!(env, concrete_list, primitive!(env, PrimitiveType::Number));

        assert!(concrete_list.is_concrete(&mut analysis_env));

        // A list with a non-concrete element type should not be concrete
        list!(env, non_concrete_list, instantiate(&env, TypeKind::Infer));

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

        let mut analysis_env = TypeAnalysisEnvironment::new(&env);

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

        let mut analysis_env = TypeAnalysisEnvironment::new(&env);

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
        let mut analysis_env = TypeAnalysisEnvironment::new(&env);

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
            instantiate(&env, TypeKind::Infer),
            primitive!(env, PrimitiveType::Number)
        );
        assert!(!non_concrete_key_dict.is_concrete(&mut analysis_env));

        // A dict with a non-concrete value type should not be concrete
        dict!(
            env,
            non_concrete_value_dict,
            primitive!(env, PrimitiveType::String),
            instantiate(&env, TypeKind::Infer)
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
            env.types[list]
                .copied()
                .join(env.types[dict].copied(), &mut lattice_env),
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
        let met = env.types[list]
            .copied()
            .meet(env.types[dict].copied(), &mut lattice_env);
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
        let infer_var = instantiate(&env, TypeKind::Infer);
        let number_type = primitive!(env, PrimitiveType::Number);
        let string_type = primitive!(env, PrimitiveType::String);

        let dict_a = dict!(env, infer_var, number_type);
        let dict_b = dict!(env, string_type, number_type);

        let mut lattice_env = LatticeEnvironment::new(&env);
        lattice_env.set_inference_enabled(true);

        // During inference, joining dicts with non-concrete keys should work using the carrier
        // pattern
        let joined = env.types[dict_a]
            .copied()
            .join(env.types[dict_b].copied(), &mut lattice_env);
        assert!(!joined.is_empty());

        // Meeting should also work with the carrier pattern
        let met = env.types[dict_a]
            .copied()
            .meet(env.types[dict_b].copied(), &mut lattice_env);
        assert!(!met.is_empty());

        // When inference is disabled, the behavior should be different
        lattice_env.set_inference_enabled(false);

        let joined_no_inference = env.types[dict_a]
            .copied()
            .join(env.types[dict_b].copied(), &mut lattice_env);
        assert_equiv!(env, joined_no_inference, [dict_a, dict_b]);

        let met_no_inference = env.types[dict_a]
            .copied()
            .meet(env.types[dict_b].copied(), &mut lattice_env);
        assert!(met_no_inference.is_empty());
    }

    #[test]
    fn list_distribute_union() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);
        let mut analysis_env = TypeAnalysisEnvironment::new(&env);

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
        let mut analysis_env = TypeAnalysisEnvironment::new(&env);

        // Create a list with an intersection element type
        let number = primitive!(env, PrimitiveType::Number);
        let string = primitive!(env, PrimitiveType::String);
        let intersection_type = intersection!(env, [number, string]);

        list!(env, list_with_intersection, intersection_type);

        // Distribute the intersection (should just return the original list since lists are
        // covariant)
        assert_equiv!(
            env,
            list_with_intersection.distribute_intersection(&mut analysis_env),
            [list_with_intersection.id]
        );
    }

    #[test]
    fn dict_distribute_union() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);
        let mut analysis_env = TypeAnalysisEnvironment::new(&env);

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
        let mut analysis_env = TypeAnalysisEnvironment::new(&env);

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
            [dict_with_intersection.id]
        );
    }

    #[test]
    fn intrinsic_type_distribute_delegation() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);
        let mut analysis_env = TypeAnalysisEnvironment::new(&env);

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
}
