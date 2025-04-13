use pretty::RcDoc;

use super::{
    Type, TypeId,
    error::type_mismatch,
    pretty_print::{PrettyPrint, RecursionLimit},
    unify::{UnificationArena, UnificationContext},
    unify_type,
};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct ListType {
    element: TypeId,
}

impl PrettyPrint for ListType {
    fn pretty<'a>(
        &'a self,
        arena: &'a UnificationArena,
        limit: RecursionLimit,
    ) -> pretty::RcDoc<'a, anstyle::Style> {
        RcDoc::text("List")
            .append(RcDoc::text("<"))
            .append(limit.pretty(&arena[self.element], arena))
            .append(RcDoc::text(">"))
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct DictType {
    key: TypeId,
    value: TypeId,
}

impl PrettyPrint for DictType {
    fn pretty<'a>(
        &'a self,
        arena: &'a UnificationArena,
        limit: RecursionLimit,
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

impl PrettyPrint for IntrinsicType {
    fn pretty<'a>(
        &'a self,
        arena: &'a UnificationArena,
        limit: RecursionLimit,
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
    context: &mut UnificationContext,
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
            context.in_covariant(|ctx| {
                unify_type(ctx, element_lhs, element_rhs);
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
            context.in_invariant(|ctx| {
                unify_type(ctx, key_lhs, key_rhs);
            });

            // Values are in covariant position
            context.in_covariant(|ctx| {
                unify_type(ctx, value_lhs, value_rhs);
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

            context.record_diagnostic(type_mismatch(
                context.source,
                &context.arena,
                &lhs,
                &rhs,
                help,
            ));

            // Mark both types as errors
            context.mark_error(lhs.id);
            context.mark_error(rhs.id);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::IntrinsicType;
    use crate::r#type::{
        TypeKind,
        intrinsic::{DictType, ListType, unify_intrinsic},
        primitive::PrimitiveType,
        test::{instantiate, setup},
    };

    #[test]
    fn identical_lists_unify() {
        let mut context = setup();

        // Create a List<String>
        let element = instantiate(&mut context, TypeKind::Primitive(PrimitiveType::String));
        let list_type = ListType { element };

        let lhs_id = instantiate(
            &mut context,
            TypeKind::Intrinsic(IntrinsicType::List(list_type)),
        );
        let rhs_id = instantiate(
            &mut context,
            TypeKind::Intrinsic(IntrinsicType::List(list_type)),
        );

        let lhs = context.arena[lhs_id]
            .as_ref()
            .map(|kind| kind.as_intrinsic().expect("type should be intrinsic"));
        let rhs = context.arena[rhs_id]
            .as_ref()
            .map(|kind| kind.as_intrinsic().expect("type should be intrinsic"));

        unify_intrinsic(&mut context, lhs, rhs);

        assert!(
            context.take_diagnostics().is_empty(),
            "Failed to unify identical List types"
        );

        // Verify types are still the same after unification
        let lhs = context.arena[lhs_id].as_ref();
        let rhs = context.arena[rhs_id].as_ref();
        assert_eq!(lhs.kind, rhs.kind);
    }

    #[test]
    fn lists_with_unifiable_elements_unify() {
        let mut context = setup();

        // Create List<Integer> and List<Number>
        let element1 = instantiate(&mut context, TypeKind::Primitive(PrimitiveType::Integer));
        let element2 = instantiate(&mut context, TypeKind::Primitive(PrimitiveType::Number));

        let list1 = ListType { element: element1 };
        let list2 = ListType { element: element2 };

        let lhs_id = instantiate(
            &mut context,
            TypeKind::Intrinsic(IntrinsicType::List(list1)),
        );
        let rhs_id = instantiate(
            &mut context,
            TypeKind::Intrinsic(IntrinsicType::List(list2)),
        );

        let lhs = context.arena[lhs_id]
            .as_ref()
            .map(|kind| kind.as_intrinsic().expect("type should be intrinsic"));
        let rhs = context.arena[rhs_id]
            .as_ref()
            .map(|kind| kind.as_intrinsic().expect("type should be intrinsic"));

        unify_intrinsic(&mut context, lhs, rhs);

        assert!(
            context.take_diagnostics().is_empty(),
            "Failed to unify lists with unifiable elements"
        );

        // Verify the Integer was promoted to Number
        if let TypeKind::Intrinsic(IntrinsicType::List(ListType { element })) =
            context.arena[lhs_id].kind
        {
            assert!(
                matches!(
                    context.arena[element].kind,
                    TypeKind::Primitive(PrimitiveType::Number)
                ),
                "List element was not promoted to Number"
            );
        }
    }

    #[test]
    fn identical_dicts_unify() {
        let mut context = setup();

        // Create Dict<String, Number>
        let key = instantiate(&mut context, TypeKind::Primitive(PrimitiveType::String));
        let value = instantiate(&mut context, TypeKind::Primitive(PrimitiveType::Number));
        let dict_type = DictType { key, value };

        let lhs_id = instantiate(
            &mut context,
            TypeKind::Intrinsic(IntrinsicType::Dict(dict_type)),
        );
        let rhs_id = instantiate(
            &mut context,
            TypeKind::Intrinsic(IntrinsicType::Dict(dict_type)),
        );

        let lhs = context.arena[lhs_id]
            .as_ref()
            .map(|kind| kind.as_intrinsic().expect("type should be intrinsic"));
        let rhs = context.arena[rhs_id]
            .as_ref()
            .map(|kind| kind.as_intrinsic().expect("type should be intrinsic"));

        unify_intrinsic(&mut context, lhs, rhs);

        assert!(
            context.take_diagnostics().is_empty(),
            "Failed to unify identical Dict types"
        );

        let lhs = context.arena[lhs_id].as_ref();
        let rhs = context.arena[rhs_id].as_ref();
        assert_eq!(lhs.kind, rhs.kind);
    }

    #[test]
    fn dicts_with_unifiable_values_unify() {
        let mut context = setup();

        // Create Dict<String, Integer> and Dict<String, Number>
        let key1 = instantiate(&mut context, TypeKind::Primitive(PrimitiveType::String));
        let key2 = instantiate(&mut context, TypeKind::Primitive(PrimitiveType::String));
        let value1 = instantiate(&mut context, TypeKind::Primitive(PrimitiveType::Integer));
        let value2 = instantiate(&mut context, TypeKind::Primitive(PrimitiveType::Number));

        let dict1 = DictType {
            key: key1,
            value: value1,
        };
        let dict2 = DictType {
            key: key2,
            value: value2,
        };

        let lhs_id = instantiate(
            &mut context,
            TypeKind::Intrinsic(IntrinsicType::Dict(dict1)),
        );
        let rhs_id = instantiate(
            &mut context,
            TypeKind::Intrinsic(IntrinsicType::Dict(dict2)),
        );

        let lhs = context.arena[lhs_id]
            .as_ref()
            .map(|kind| kind.as_intrinsic().expect("type should be intrinsic"));
        let rhs = context.arena[rhs_id]
            .as_ref()
            .map(|kind| kind.as_intrinsic().expect("type should be intrinsic"));

        unify_intrinsic(&mut context, lhs, rhs);

        assert!(
            context.take_diagnostics().is_empty(),
            "Failed to unify dicts with unifiable values"
        );

        // Verify the Integer was promoted to Number
        if let TypeKind::Intrinsic(IntrinsicType::Dict(DictType { value, .. })) =
            context.arena[lhs_id].kind
        {
            assert!(
                matches!(
                    context.arena[value].kind,
                    TypeKind::Primitive(PrimitiveType::Number)
                ),
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
                true,
            ),
            // List<String> vs List<Number>
            (
                (PrimitiveType::String, None),
                (PrimitiveType::Number, None),
                "lists with incompatible elements",
                false,
            ),
            // Dict<String, String> vs Dict<Number, String>
            (
                (PrimitiveType::String, Some(PrimitiveType::String)),
                (PrimitiveType::Number, Some(PrimitiveType::String)),
                "dicts with incompatible keys",
                false,
            ),
        ];

        for ((lhs_key, lhs_value), (rhs_key, rhs_value), description, should_be_error) in test_cases
        {
            let mut context = setup();

            let lhs_id = if let Some(value) = lhs_value {
                // Create Dict
                let key = instantiate(&mut context, TypeKind::Primitive(lhs_key));
                let value = instantiate(&mut context, TypeKind::Primitive(value));
                instantiate(
                    &mut context,
                    TypeKind::Intrinsic(IntrinsicType::Dict(DictType { key, value })),
                )
            } else {
                // Create List
                let element = instantiate(&mut context, TypeKind::Primitive(lhs_key));
                instantiate(
                    &mut context,
                    TypeKind::Intrinsic(IntrinsicType::List(ListType { element })),
                )
            };

            let rhs_id = if let Some(value) = rhs_value {
                // Create Dict
                let key = instantiate(&mut context, TypeKind::Primitive(rhs_key));
                let value = instantiate(&mut context, TypeKind::Primitive(value));
                instantiate(
                    &mut context,
                    TypeKind::Intrinsic(IntrinsicType::Dict(DictType { key, value })),
                )
            } else {
                // Create List
                let element = instantiate(&mut context, TypeKind::Primitive(rhs_key));
                instantiate(
                    &mut context,
                    TypeKind::Intrinsic(IntrinsicType::List(ListType { element })),
                )
            };

            let lhs = context.arena[lhs_id]
                .as_ref()
                .map(|kind| kind.as_intrinsic().expect("should be intrinsic"));
            let rhs = context.arena[rhs_id]
                .as_ref()
                .map(|kind| kind.as_intrinsic().expect("should be intrinsic"));

            unify_intrinsic(&mut context, lhs, rhs);

            assert_eq!(
                context.take_diagnostics().len(),
                1,
                "Expected error when unifying {description}"
            );

            if !should_be_error {
                continue;
            }

            // Verify both types are marked as errors
            assert!(
                matches!(context.arena[lhs_id].kind, TypeKind::Error),
                "Left type not marked as error for {description}"
            );
            assert!(
                matches!(context.arena[rhs_id].kind, TypeKind::Error),
                "Right type not marked as error for {description}"
            );
        }
    }

    #[test]
    fn error_messages() {
        let mut context = setup();

        // Test List vs Dict error message
        let list_elem = instantiate(&mut context, TypeKind::Primitive(PrimitiveType::String));
        let list_id = instantiate(
            &mut context,
            TypeKind::Intrinsic(IntrinsicType::List(ListType { element: list_elem })),
        );

        let dict_key = instantiate(&mut context, TypeKind::Primitive(PrimitiveType::String));
        let dict_val = instantiate(&mut context, TypeKind::Primitive(PrimitiveType::Number));
        let dict_id = instantiate(
            &mut context,
            TypeKind::Intrinsic(IntrinsicType::Dict(DictType {
                key: dict_key,
                value: dict_val,
            })),
        );

        let list = context.arena[list_id]
            .as_ref()
            .map(|kind| kind.as_intrinsic().expect("should be intrinsic"));
        let dict = context.arena[dict_id]
            .as_ref()
            .map(|kind| kind.as_intrinsic().expect("should be intrinsic"));

        unify_intrinsic(&mut context, list, dict);

        let diagnostic = &context.take_diagnostics()[0];
        assert_eq!(
            diagnostic
                .help
                .as_ref()
                .expect("help should be present")
                .message(),
            "You can convert a list of key-value pairs to a dict using the \
             `::core::dict::from_entries/1` function."
        );
    }
}
