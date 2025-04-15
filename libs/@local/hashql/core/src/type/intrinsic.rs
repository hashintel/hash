use core::ops::Index;

use pretty::RcDoc;

use super::{
    Type, TypeId,
    environment::{StructuralEquivalenceEnvironment, UnificationEnvironment},
    error::type_mismatch,
    pretty_print::PrettyPrint,
    recursion::RecursionDepthBoundary,
};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct ListType {
    element: TypeId,
}

impl ListType {
    fn structurally_equivalent(
        self,
        other: Self,
        env: &mut StructuralEquivalenceEnvironment,
    ) -> bool {
        env.structurally_equivalent(self.element, other.element)
    }
}

impl PrettyPrint for ListType {
    fn pretty<'a>(
        &'a self,
        arena: &'a impl Index<TypeId, Output = Type>,
        limit: RecursionDepthBoundary,
    ) -> pretty::RcDoc<'a, anstyle::Style> {
        RcDoc::text("List")
            .append(RcDoc::text("<"))
            .append(limit.pretty(&arena[self.element], arena))
            .append(RcDoc::text(">"))
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct DictType {
    pub key: TypeId,
    pub value: TypeId,
}

impl DictType {
    fn structurally_equivalent(
        self,
        other: Self,
        env: &mut StructuralEquivalenceEnvironment,
    ) -> bool {
        env.structurally_equivalent(self.key, other.key)
            && env.structurally_equivalent(self.value, other.value)
    }
}

impl PrettyPrint for DictType {
    fn pretty<'a>(
        &'a self,
        arena: &'a impl Index<TypeId, Output = Type>,
        limit: RecursionDepthBoundary,
    ) -> pretty::RcDoc<'a, anstyle::Style> {
        RcDoc::text("Dict")
            .append(RcDoc::text("<"))
            .append(
                RcDoc::intersperse(
                    [self.key, self.value]
                        .into_iter()
                        .map(|id| limit.pretty(&arena[id], arena)),
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
    pub(crate) fn structurally_equivalent(
        &self,
        other: &Self,
        env: &mut StructuralEquivalenceEnvironment,
    ) -> bool {
        match (self, other) {
            (&Self::List(lhs), &Self::List(rhs)) => lhs.structurally_equivalent(rhs, env),
            (&Self::Dict(lhs), &Self::Dict(rhs)) => lhs.structurally_equivalent(rhs, env),
            _ => false,
        }
    }
}

impl PrettyPrint for IntrinsicType {
    fn pretty<'a>(
        &'a self,
        arena: &'a impl Index<TypeId, Output = Type>,
        limit: RecursionDepthBoundary,
    ) -> RcDoc<'a, anstyle::Style> {
        match self {
            Self::List(list) => list.pretty(arena, limit),
            Self::Dict(dict) => dict.pretty(arena, limit),
        }
    }
}

/// Unifies intrinsic types
///
/// In a strictly variance-aware system:
/// - List elements are covariant (immutable collections)
/// - Dict keys are invariant (for reliable lookups)
/// - Dict values are covariant (immutable collections)
pub(crate) fn unify_intrinsic(
    env: &mut UnificationEnvironment,
    lhs: Type<IntrinsicType>,
    rhs: Type<IntrinsicType>,
) {
    // Fast path for identical types
    if lhs.kind == rhs.kind {
        return;
    }

    match (lhs.kind, rhs.kind) {
        // List<T> - elements are covariant in immutable lists
        (
            IntrinsicType::List(ListType {
                element: element_lhs,
            }),
            IntrinsicType::List(ListType {
                element: element_rhs,
            }),
        ) => {
            // Element types are in covariant position
            env.in_covariant(|env| {
                env.unify_type(element_lhs, element_rhs);
            });

            // In a strictly variance-aware system, we do NOT modify the list types
            // Each list maintains its original element type, preserving identity and subtyping
            // relationships
        }
        // Dict<K, V> - keys are invariant, values are covariant
        (
            IntrinsicType::Dict(DictType {
                key: key_lhs,
                value: value_lhs,
            }),
            IntrinsicType::Dict(DictType {
                key: key_rhs,
                value: value_rhs,
            }),
        ) => {
            // Keys must be invariant for lookup reliability
            env.in_invariant(|env| {
                env.unify_type(key_lhs, key_rhs);
            });

            // Values are in covariant position
            env.in_covariant(|env| {
                env.unify_type(value_lhs, value_rhs);
            });

            // In a strictly variance-aware system, we do NOT modify the dict types
            // Each dict maintains its original key and value types, preserving identity and
            // subtyping relationships
        }
        // Different intrinsic types - not unifiable
        _ => {
            // Provide helpful conversion suggestions
            let help = match (&lhs.kind, &rhs.kind) {
                (IntrinsicType::List(_), IntrinsicType::Dict(..)) => Some(
                    "These types are different collection types. You can convert a list of \
                     key-value pairs to a dictionary using the `::core::dict::from_entries/1` \
                     function.",
                ),
                (IntrinsicType::Dict(..), IntrinsicType::List(_)) => Some(
                    "These types are different collection types. You can convert a dictionary to \
                     a list of key-value pairs using the `::core::dict::to_entries/1` function.",
                ),
                _ => Some("These collection types cannot be used interchangeably."),
            };

            let diagnostic = type_mismatch(env, &lhs, &rhs, help);
            env.record_diagnostic(diagnostic);
        }
    }
}

#[cfg(test)]
mod tests {
    use core::assert_matches::assert_matches;

    use super::IntrinsicType;
    use crate::r#type::{
        TypeKind,
        intrinsic::{DictType, ListType, unify_intrinsic},
        primitive::PrimitiveType,
        test::{instantiate, setup_unify},
    };

    #[test]
    fn identical_lists_unify() {
        setup_unify!(env);

        // Create a List<String>
        let element = instantiate(&mut env, TypeKind::Primitive(PrimitiveType::String));
        let list_type = ListType { element };

        let lhs_id = instantiate(
            &mut env,
            TypeKind::Intrinsic(IntrinsicType::List(list_type)),
        );
        let rhs_id = instantiate(
            &mut env,
            TypeKind::Intrinsic(IntrinsicType::List(list_type)),
        );

        let lhs = env.arena[lhs_id]
            .as_ref()
            .map(|kind| kind.as_intrinsic().expect("type should be intrinsic"));
        let rhs = env.arena[rhs_id]
            .as_ref()
            .map(|kind| kind.as_intrinsic().expect("type should be intrinsic"));

        unify_intrinsic(&mut env, lhs, rhs);

        assert!(
            env.take_diagnostics().is_empty(),
            "Failed to unify identical List types"
        );

        // Verify types are still the same after unification
        let lhs = env.arena[lhs_id].as_ref();
        let rhs = env.arena[rhs_id].as_ref();
        assert_eq!(lhs.kind, rhs.kind);
    }

    #[test]
    fn lists_with_unifiable_elements_unify() {
        setup_unify!(env);

        // Create List<Number> and List<Integer>
        let element1 = instantiate(&mut env, TypeKind::Primitive(PrimitiveType::Number));
        let element2 = instantiate(&mut env, TypeKind::Primitive(PrimitiveType::Integer));

        let list1 = ListType { element: element1 };
        let list2 = ListType { element: element2 };

        let lhs_id = instantiate(&mut env, TypeKind::Intrinsic(IntrinsicType::List(list1)));
        let rhs_id = instantiate(&mut env, TypeKind::Intrinsic(IntrinsicType::List(list2)));

        let lhs = env.arena[lhs_id]
            .as_ref()
            .map(|kind| kind.as_intrinsic().expect("type should be intrinsic"));
        let rhs = env.arena[rhs_id]
            .as_ref()
            .map(|kind| kind.as_intrinsic().expect("type should be intrinsic"));

        unify_intrinsic(&mut env, lhs, rhs);

        assert!(
            env.take_diagnostics().is_empty(),
            "Failed to unify lists with unifiable elements"
        );

        // Verify the Integer was promoted to Number
        if let TypeKind::Intrinsic(IntrinsicType::List(ListType { element })) =
            env.arena[lhs_id].kind
        {
            assert_matches!(
                env.arena[element].kind,
                TypeKind::Primitive(PrimitiveType::Number),
                "List element was not promoted to Number"
            );
        }
    }

    #[test]
    fn identical_dicts_unify() {
        setup_unify!(env);

        // Create Dict<String, Number>
        let key = instantiate(&mut env, TypeKind::Primitive(PrimitiveType::String));
        let value = instantiate(&mut env, TypeKind::Primitive(PrimitiveType::Number));
        let dict_type = DictType { key, value };

        let lhs_id = instantiate(
            &mut env,
            TypeKind::Intrinsic(IntrinsicType::Dict(dict_type)),
        );
        let rhs_id = instantiate(
            &mut env,
            TypeKind::Intrinsic(IntrinsicType::Dict(dict_type)),
        );

        let lhs = env.arena[lhs_id]
            .as_ref()
            .map(|kind| kind.as_intrinsic().expect("type should be intrinsic"));
        let rhs = env.arena[rhs_id]
            .as_ref()
            .map(|kind| kind.as_intrinsic().expect("type should be intrinsic"));

        unify_intrinsic(&mut env, lhs, rhs);

        assert!(
            env.take_diagnostics().is_empty(),
            "Failed to unify identical Dict types"
        );

        let lhs = env.arena[lhs_id].as_ref();
        let rhs = env.arena[rhs_id].as_ref();
        assert_eq!(lhs.kind, rhs.kind);
    }

    #[test]
    fn dicts_with_unifiable_values_unify() {
        setup_unify!(env);

        // Create Dict<String, Number> and Dict<String, Integer>
        let key1 = instantiate(&mut env, TypeKind::Primitive(PrimitiveType::String));
        let key2 = instantiate(&mut env, TypeKind::Primitive(PrimitiveType::String));
        let value1 = instantiate(&mut env, TypeKind::Primitive(PrimitiveType::Number));
        let value2 = instantiate(&mut env, TypeKind::Primitive(PrimitiveType::Integer));

        let dict1 = DictType {
            key: key1,
            value: value1,
        };
        let dict2 = DictType {
            key: key2,
            value: value2,
        };

        let lhs_id = instantiate(&mut env, TypeKind::Intrinsic(IntrinsicType::Dict(dict1)));
        let rhs_id = instantiate(&mut env, TypeKind::Intrinsic(IntrinsicType::Dict(dict2)));

        let lhs = env.arena[lhs_id]
            .as_ref()
            .map(|kind| kind.as_intrinsic().expect("type should be intrinsic"));
        let rhs = env.arena[rhs_id]
            .as_ref()
            .map(|kind| kind.as_intrinsic().expect("type should be intrinsic"));

        unify_intrinsic(&mut env, lhs, rhs);

        assert!(
            env.take_diagnostics().is_empty(),
            "Failed to unify dicts with unifiable values"
        );

        // Verify the Integer was promoted to Number
        if let TypeKind::Intrinsic(IntrinsicType::Dict(DictType { value, .. })) =
            env.arena[lhs_id].kind
        {
            assert_matches!(
                env.arena[value].kind,
                TypeKind::Primitive(PrimitiveType::Number),
                "Dict value was not promoted to Number"
            );
        }
    }

    #[test]
    fn incompatible_intrinsics() {
        let test_cases = [
            // List<T> vs Dict<K, V>
            (
                (PrimitiveType::String, None),
                (PrimitiveType::String, Some(PrimitiveType::Number)),
                "List and Dict",
            ),
            // List<String> vs List<Number>
            (
                (PrimitiveType::String, None),
                (PrimitiveType::Number, None),
                "lists with incompatible elements",
            ),
            // Dict<String, String> vs Dict<Number, String>
            (
                (PrimitiveType::String, Some(PrimitiveType::String)),
                (PrimitiveType::Number, Some(PrimitiveType::String)),
                "dicts with incompatible keys",
            ),
        ];

        for ((lhs_key, lhs_value), (rhs_key, rhs_value), description) in test_cases {
            setup_unify!(env);

            let lhs_id = if let Some(value) = lhs_value {
                // Create Dict
                let key = instantiate(&mut env, TypeKind::Primitive(lhs_key));
                let value = instantiate(&mut env, TypeKind::Primitive(value));
                instantiate(
                    &mut env,
                    TypeKind::Intrinsic(IntrinsicType::Dict(DictType { key, value })),
                )
            } else {
                // Create List
                let element = instantiate(&mut env, TypeKind::Primitive(lhs_key));
                instantiate(
                    &mut env,
                    TypeKind::Intrinsic(IntrinsicType::List(ListType { element })),
                )
            };

            let rhs_id = if let Some(value) = rhs_value {
                // Create Dict
                let key = instantiate(&mut env, TypeKind::Primitive(rhs_key));
                let value = instantiate(&mut env, TypeKind::Primitive(value));
                instantiate(
                    &mut env,
                    TypeKind::Intrinsic(IntrinsicType::Dict(DictType { key, value })),
                )
            } else {
                // Create List
                let element = instantiate(&mut env, TypeKind::Primitive(rhs_key));
                instantiate(
                    &mut env,
                    TypeKind::Intrinsic(IntrinsicType::List(ListType { element })),
                )
            };

            let lhs = env.arena[lhs_id]
                .as_ref()
                .map(|kind| kind.as_intrinsic().expect("should be intrinsic"));
            let rhs = env.arena[rhs_id]
                .as_ref()
                .map(|kind| kind.as_intrinsic().expect("should be intrinsic"));

            unify_intrinsic(&mut env, lhs, rhs);

            assert_eq!(
                env.take_diagnostics().len(),
                1,
                "Expected error when unifying {description}"
            );
        }
    }

    #[test]
    fn error_messages() {
        setup_unify!(env);

        // Test List vs Dict error message
        let list_elem = instantiate(&mut env, TypeKind::Primitive(PrimitiveType::String));
        let list_id = instantiate(
            &mut env,
            TypeKind::Intrinsic(IntrinsicType::List(ListType { element: list_elem })),
        );

        let dict_key = instantiate(&mut env, TypeKind::Primitive(PrimitiveType::String));
        let dict_val = instantiate(&mut env, TypeKind::Primitive(PrimitiveType::Number));
        let dict_id = instantiate(
            &mut env,
            TypeKind::Intrinsic(IntrinsicType::Dict(DictType {
                key: dict_key,
                value: dict_val,
            })),
        );

        let list = env.arena[list_id]
            .as_ref()
            .map(|kind| kind.as_intrinsic().expect("should be intrinsic"));
        let dict = env.arena[dict_id]
            .as_ref()
            .map(|kind| kind.as_intrinsic().expect("should be intrinsic"));

        unify_intrinsic(&mut env, list, dict);

        let diagnostic = &env.take_diagnostics()[0];
        assert_eq!(
            diagnostic
                .help
                .as_ref()
                .expect("help should be present")
                .message(),
            "These types are different collection types. You can convert a list of key-value \
             pairs to a dictionary using the `::core::dict::from_entries/1` function."
        );
    }
}
