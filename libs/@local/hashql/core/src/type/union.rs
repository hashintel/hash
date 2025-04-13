use ecow::EcoVec;
use pretty::RcDoc;

use super::{
    Type, TypeId, TypeKind,
    error::union_variant_mismatch,
    pretty_print::PrettyPrint,
    recursion::{RecursionGuard, RecursionLimit},
    unify::{UnificationArena, UnificationContext},
};
use crate::arena::Arena;

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct UnionType {
    pub variants: EcoVec<TypeId>,
}

impl UnionType {
    pub(crate) fn structurally_equivalent(
        &self,
        other: &Self,
        arena: &Arena<Type>,
        guard: &mut RecursionGuard,
    ) -> bool {
        // go through every variant in self and check if there is a variant matching in other
        self.variants.iter().all(|&variant| {
            other.variants.iter().any(|&other_variant| {
                arena[variant].structurally_equivalent_impl(&arena[other_variant], arena, guard)
            })
        })
    }
}

impl PrettyPrint for UnionType {
    fn pretty<'a>(
        &'a self,
        arena: &'a UnificationArena,
        limit: RecursionLimit,
    ) -> pretty::RcDoc<'a, anstyle::Style> {
        RcDoc::intersperse(
            self.variants
                .iter()
                .map(|&variant| limit.pretty(&arena[variant], arena)),
            RcDoc::line()
                .append(RcDoc::text("|"))
                .append(RcDoc::space()),
        )
        .nest(1)
        .group()
    }
}

/// Unifies union types
///
/// In a covariant context (checking if `rhs <: lhs`):
/// - For each variant in `rhs`, it must be a subtype of at least one variant in `lhs`
/// - This is the correct union subtyping rule: (A | B) <: C if and only if A <: C and B <: C
///
/// For example, if `lhs` is `Number | String` and `rhs` is `Integer | String`,
/// this would be valid because:
/// - `Integer <: Number`, so the `Integer` variant in `rhs` is covered
/// - `String <: String`, so the `String` variant in `rhs` is covered
pub(crate) fn unify_union(
    context: &mut UnificationContext,
    lhs: &Type<UnionType>,
    rhs: &Type<UnionType>,
) {
    // For each variant in rhs (the provided type), check if it's a subtype of at least one lhs
    // variant
    for &rhs_variant in &rhs.kind.variants {
        // We need to find at least one lhs variant that this rhs variant is a subtype of
        let mut compatible_variant_found = false;

        for &lhs_variant in &lhs.kind.variants {
            let diagnostics = context.diagnostics.len();

            context.in_transaction(|context| {
                // Try to unify this specific pair of variants
                // In covariant context, we check if rhs_variant <: lhs_variant
                context.in_covariant(|ctx| {
                    super::unify_type(ctx, lhs_variant, rhs_variant);
                });

                if context.diagnostics.len() == diagnostics {
                    compatible_variant_found = true;

                    true
                } else {
                    false
                }
            });
        }

        if !compatible_variant_found {
            let diagnostic =
                union_variant_mismatch(rhs.span, &context.arena, &context.arena[rhs_variant], lhs);

            context.record_diagnostic(diagnostic);
            context.mark_error(rhs_variant);
        }
    }

    // If we reach here, every rhs variant is a subtype of at least one lhs variant
    // In a strictly variance-aware system, we do NOT modify the union types.
    // Each union maintains its original variants, preserving their identity and subtyping
    // relationships

    // TODO: flatten union type iff not "virtual"
}

pub(crate) fn unify_union_lhs(
    context: &mut UnificationContext,
    lhs: &Type<UnionType>,
    rhs: &Type<TypeKind>,
) {
    let rhs = rhs.as_ref().map(|_| UnionType {
        variants: EcoVec::from([rhs.id]),
    });

    unify_union(context, lhs, &rhs);
}

pub(crate) fn unify_union_rhs(
    context: &mut UnificationContext,
    lhs: &Type<TypeKind>,
    rhs: &Type<UnionType>,
) {
    let lhs = lhs.as_ref().map(|_| UnionType {
        variants: EcoVec::from([lhs.id]),
    });

    unify_union(context, &lhs, rhs);
}

#[cfg(test)]
mod tests {
    use super::{UnionType, unify_union, unify_union_lhs, unify_union_rhs};
    use crate::r#type::{
        TypeId, TypeKind,
        primitive::PrimitiveType,
        test::{instantiate, setup},
    };

    fn create_union_type(
        context: &mut crate::r#type::unify::UnificationContext,
        variants: Vec<TypeId>,
    ) -> crate::r#type::Type<UnionType> {
        let id = context
            .arena
            .arena_mut_test_only()
            .push_with(|id| crate::r#type::Type {
                id,
                span: crate::span::SpanId::SYNTHETIC,
                kind: TypeKind::Union(UnionType {
                    variants: variants.into(),
                }),
            });

        context.arena[id]
            .clone()
            .map(|kind| kind.into_union().expect("should be union type"))
    }

    #[test]
    fn identical_unions_unify() {
        let mut context = setup();

        // Create two identical unions: String | Number
        let str1 = instantiate(&mut context, TypeKind::Primitive(PrimitiveType::String));
        let num1 = instantiate(&mut context, TypeKind::Primitive(PrimitiveType::Number));

        let str2 = instantiate(&mut context, TypeKind::Primitive(PrimitiveType::String));
        let num2 = instantiate(&mut context, TypeKind::Primitive(PrimitiveType::Number));

        let lhs = create_union_type(&mut context, vec![str1, num1]);
        let rhs = create_union_type(&mut context, vec![str2, num2]);

        unify_union(&mut context, &lhs, &rhs);

        assert!(
            context.take_diagnostics().is_empty(),
            "Failed to unify identical unions"
        );
    }

    #[test]
    fn subtype_union_unifies() {
        let mut context = setup();

        // lhs: Number | String
        // rhs: Integer | String
        // This should succeed because Integer <: Number
        let num = instantiate(&mut context, TypeKind::Primitive(PrimitiveType::Number));
        let str1 = instantiate(&mut context, TypeKind::Primitive(PrimitiveType::String));

        let int = instantiate(&mut context, TypeKind::Primitive(PrimitiveType::Integer));
        let str2 = instantiate(&mut context, TypeKind::Primitive(PrimitiveType::String));

        let lhs = create_union_type(&mut context, vec![num, str1]);
        let rhs = create_union_type(&mut context, vec![int, str2]);

        unify_union(&mut context, &lhs, &rhs);

        assert!(
            context.take_diagnostics().is_empty(),
            "Failed to unify union with subtype variants"
        );
    }

    #[test]
    fn incompatible_union_fails() {
        let mut context = setup();

        // lhs: Number | String
        // rhs: Boolean | String
        // This should fail because Boolean is not a subtype of Number or String
        let num = instantiate(&mut context, TypeKind::Primitive(PrimitiveType::Number));
        let str1 = instantiate(&mut context, TypeKind::Primitive(PrimitiveType::String));

        let bool_type = instantiate(&mut context, TypeKind::Primitive(PrimitiveType::Boolean));
        let str2 = instantiate(&mut context, TypeKind::Primitive(PrimitiveType::String));

        let lhs = create_union_type(&mut context, vec![num, str1]);
        let rhs = create_union_type(&mut context, vec![bool_type, str2]);

        unify_union(&mut context, &lhs, &rhs);

        assert!(
            !context.take_diagnostics().is_empty(),
            "Should fail to unify unions with incompatible variants"
        );
    }

    #[test]
    fn single_type_to_union() {
        let mut context = setup();

        // lhs: Number | String
        // rhs: Number
        // This should succeed because Number <: (Number | String)
        let num1 = instantiate(&mut context, TypeKind::Primitive(PrimitiveType::Number));
        let str1 = instantiate(&mut context, TypeKind::Primitive(PrimitiveType::String));
        let num2 = instantiate(&mut context, TypeKind::Primitive(PrimitiveType::Number));

        let union = create_union_type(&mut context, vec![num1, str1]);
        let single = context.arena[num2].clone();

        unify_union_lhs(&mut context, &union, &single);

        assert!(
            context.take_diagnostics().is_empty(),
            "Failed to unify single type with compatible union"
        );
    }

    #[test]
    fn union_to_single_type() {
        let mut context = setup();

        // lhs: Number
        // rhs: Number | String
        // This should fail because (Number | String) is not a subtype of Number
        let num1 = instantiate(&mut context, TypeKind::Primitive(PrimitiveType::Number));
        let num2 = instantiate(&mut context, TypeKind::Primitive(PrimitiveType::Number));
        let str2 = instantiate(&mut context, TypeKind::Primitive(PrimitiveType::String));

        let single = context.arena[num1].clone();
        let union = create_union_type(&mut context, vec![num2, str2]);

        unify_union_rhs(&mut context, &single, &union);

        assert!(
            !context.take_diagnostics().is_empty(),
            "Should fail to unify union with single type when union has extra variants"
        );
    }

    #[test]
    fn subtype_single_to_union() {
        let mut context = setup();

        // lhs: Number | String
        // rhs: Integer
        // This should succeed because Integer <: Number <: (Number | String)
        let num = instantiate(&mut context, TypeKind::Primitive(PrimitiveType::Number));
        let str1 = instantiate(&mut context, TypeKind::Primitive(PrimitiveType::String));
        let int = instantiate(&mut context, TypeKind::Primitive(PrimitiveType::Integer));

        let union = create_union_type(&mut context, vec![num, str1]);
        let single = context.arena[int].clone();

        unify_union_lhs(&mut context, &union, &single);

        assert!(
            context.take_diagnostics().is_empty(),
            "Failed to unify subtype with union containing supertype"
        );
    }
}
