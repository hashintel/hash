use core::ops::Index;

use ecow::EcoVec;
use pretty::RcDoc;
use smallvec::SmallVec;

use super::{TypeKind, generic_argument::GenericArguments};
use crate::r#type::{
    Type, TypeId,
    environment::{
        EquivalenceEnvironment, LatticeEnvironment, SimplifyEnvironment, TypeAnalysisEnvironment,
        UnificationEnvironment,
    },
    error::tuple_length_mismatch,
    lattice::Lattice,
    pretty_print::PrettyPrint,
    recursion::RecursionDepthBoundary,
};

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct TupleType {
    pub fields: EcoVec<TypeId>,

    pub arguments: GenericArguments,
}

impl TupleType {
    pub(crate) fn structurally_equivalent(
        &self,
        other: &Self,
        env: &mut EquivalenceEnvironment,
    ) -> bool {
        self.fields.len() == other.fields.len()
            && self
                .fields
                .iter()
                .zip(other.fields.iter())
                .all(|(&lhs, &rhs)| env.semantically_equivalent(lhs, rhs))
            && self
                .arguments
                .semantically_equivalent(&other.arguments, env)
    }
}

impl Lattice for TupleType {
    fn join(
        self: Type<&Self>,
        other: Type<&Self>,
        env: &mut LatticeEnvironment,
    ) -> SmallVec<TypeId, 4> {
        if self.kind.fields.len() != other.kind.fields.len() {
            return SmallVec::from_slice(&[self.id, other.id]);
        }

        // TODO: we need to put the arguments into scope

        // join pointwise
        let mut fields = EcoVec::with_capacity(self.kind.fields.len());
        for (&lhs, &rhs) in self.kind.fields.iter().zip(other.kind.fields.iter()) {
            fields.push(env.join(lhs, rhs));
        }

        // Check if we can opt-out into allocating a new type
        if fields == self.kind.fields {
            return SmallVec::from_slice(&[self.id]);
        }

        if fields == other.kind.fields {
            return SmallVec::from_slice(&[other.id]);
        }

        // ... we can't so we need to allocate a new type
        // merge the two arguments together, as some of the fields may refer to either
        let mut arguments = self.kind.arguments.clone();
        arguments.merge(other.kind.arguments.clone());

        let id = env.arena.push_with(|id| Type {
            id,
            span: self.span,
            kind: TypeKind::Tuple(Self { fields, arguments }),
        });

        SmallVec::from_slice(&[id])
    }

    fn meet(
        self: Type<&Self>,
        other: Type<&Self>,
        env: &mut LatticeEnvironment,
    ) -> SmallVec<TypeId, 4> {
        if self.kind.fields.len() != other.kind.fields.len() {
            return SmallVec::new();
        }

        // TODO: we need to put the arguments into scope

        // meet pointwise
        let mut fields = EcoVec::with_capacity(self.kind.fields.len());
        for (&lhs, &rhs) in self.kind.fields.iter().zip(other.kind.fields.iter()) {
            fields.push(env.meet(lhs, rhs));
        }

        // Check if we can opt-out into allocating a new type
        if fields == self.kind.fields {
            return SmallVec::from_slice(&[self.id]);
        }

        if fields == other.kind.fields {
            return SmallVec::from_slice(&[other.id]);
        }

        // ... we can't so we need to allocate a new type
        // merge the two arguments together, as some of the fields may refer to either
        let mut arguments = self.kind.arguments.clone();
        arguments.merge(other.kind.arguments.clone());

        let id = env.arena.push_with(|id| Type {
            id,
            span: self.span,
            kind: TypeKind::Tuple(Self { fields, arguments }),
        });

        SmallVec::from_slice(&[id])
    }

    fn uninhabited(self: Type<&Self>, env: &mut TypeAnalysisEnvironment) -> bool {
        // uninhabited if any of the fields are uninhabited
        self.kind.fields.iter().any(|&field| env.uninhabited(field))
    }

    fn semantically_equivalent(
        self: Type<&Self>,
        other: Type<&Self>,
        env: &mut EquivalenceEnvironment,
    ) -> bool {
        self.kind.fields.len() == other.kind.fields.len()
            && self
                .kind
                .fields
                .iter()
                .zip(other.kind.fields.iter())
                .all(|(&lhs, &rhs)| env.semantically_equivalent(lhs, rhs))
            && self
                .kind
                .arguments
                .semantically_equivalent(&other.kind.arguments, env)
    }

    /// Unifies tuple types
    ///
    /// In a covariant context:
    /// - Both tuples must have the same number of fields (tuples are invariant in length)
    /// - Each corresponding field must be covariant
    fn unify(self: Type<&Self>, other: Type<&Self>, env: &mut UnificationEnvironment) {
        // Tuples must have the same number of fields
        if self.kind.fields.len() != other.kind.fields.len() {
            let diagnostic = tuple_length_mismatch(
                env.source,
                &self,
                &other,
                self.kind.fields.len(),
                other.kind.fields.len(),
            );

            env.record_diagnostic(diagnostic);

            return;
        }

        // Enter generic argument scope for both tuples
        self.kind.arguments.enter_scope(env);
        other.kind.arguments.enter_scope(env);

        // Unify corresponding fields in each tuple
        for (&lhs_field, &rhs_field) in self.kind.fields.iter().zip(other.kind.fields.iter()) {
            // Fields are covariant
            env.in_covariant(|env| {
                env.unify_type(lhs_field, rhs_field);
            });
        }

        // Exit generic argument scope
        self.kind.arguments.exit_scope(env);
        other.kind.arguments.exit_scope(env);
    }

    fn simplify(self: Type<&Self>, env: &mut SimplifyEnvironment) -> TypeId {
        let mut fields = EcoVec::with_capacity(self.kind.fields.len());

        for &field in &self.kind.fields {
            fields.push(env.simplify(field));
        }

        // Check if we can opt-out into having to allocate a new type
        if fields.len() == self.kind.fields.len() {
            return self.id;
        }

        // ... we can't so we need to allocate a new type
        env.arena.push_with(|id| Type {
            id,
            span: self.span,
            kind: TypeKind::Tuple(Self {
                fields,
                arguments: self.kind.arguments.clone(),
            }),
        })
    }
}

impl PrettyPrint for TupleType {
    fn pretty<'a>(
        &'a self,
        arena: &'a impl Index<TypeId, Output = Type>,
        limit: RecursionDepthBoundary,
    ) -> pretty::RcDoc<'a, anstyle::Style> {
        let inner = if self.fields.is_empty() {
            RcDoc::text("()")
        } else if self.fields.len() == 1 {
            RcDoc::text("(")
                .append(limit.pretty(&arena[self.fields[0]], arena))
                .append(RcDoc::text(",)"))
        } else {
            RcDoc::text("(")
                .append(
                    RcDoc::intersperse(
                        self.fields
                            .iter()
                            .map(|&field| limit.pretty(&arena[field], arena)),
                        RcDoc::text(",").append(RcDoc::line()),
                    )
                    .nest(1)
                    .group(),
                )
                .append(RcDoc::text(")"))
        };

        self.arguments.pretty(arena, limit).append(inner).group()
    }
}

/// Unifies tuple types
///
/// In a covariant context:
/// - Both tuples must have the same number of fields (tuples are invariant in length)
/// - Each corresponding field must be covariant
pub(crate) fn unify_tuple(
    _: &mut UnificationEnvironment,
    _: &Type<TupleType>,
    _: &Type<TupleType>,
) {
    unimplemented!("use Lattice::join instead")
}

#[cfg(test)]
mod test {
    #![expect(clippy::min_ident_chars)]
    use ecow::EcoVec;

    use super::TupleType;
    use crate::{
        arena::TransactionalArena,
        span::SpanId,
        r#type::{
            environment::{
                Environment, EquivalenceEnvironment, LatticeEnvironment, SimplifyEnvironment,
                TypeAnalysisEnvironment, UnificationEnvironment,
            },
            kind::{
                TypeKind,
                generic_argument::GenericArguments,
                primitive::PrimitiveType,
                test::{assert_equiv, primitive, tuple, union},
                union::UnionType,
            },
            lattice::{Lattice as _, test::assert_lattice_laws},
            test::instantiate,
        },
    };

    #[test]
    fn join_identical_tuples() {
        let mut env = Environment::new(SpanId::SYNTHETIC, TransactionalArena::new());

        tuple!(
            env,
            a,
            [],
            [
                primitive!(env, PrimitiveType::Number),
                primitive!(env, PrimitiveType::String)
            ]
        );

        tuple!(
            env,
            b,
            [],
            [
                primitive!(env, PrimitiveType::Number),
                primitive!(env, PrimitiveType::String)
            ]
        );

        let mut lattice_env = LatticeEnvironment::new(&mut env);

        // Join identical tuples should result in the same tuple
        assert_equiv!(
            env,
            a.join(b, &mut lattice_env),
            [tuple!(
                env,
                [],
                [
                    primitive!(env, PrimitiveType::Number),
                    primitive!(env, PrimitiveType::String)
                ]
            )]
        );
    }

    #[test]
    fn join_different_length_tuples() {
        let mut env = Environment::new(SpanId::SYNTHETIC, TransactionalArena::new());

        tuple!(
            env,
            a,
            [],
            [
                primitive!(env, PrimitiveType::Number),
                primitive!(env, PrimitiveType::String)
            ]
        );
        tuple!(
            env,
            b,
            [],
            [
                primitive!(env, PrimitiveType::Number),
                primitive!(env, PrimitiveType::String),
                primitive!(env, PrimitiveType::String)
            ]
        );

        let mut lattice_env = LatticeEnvironment::new(&mut env);

        // Joining tuples of different lengths should return both tuples
        assert_equiv!(
            env,
            a.join(b, &mut lattice_env),
            [
                tuple!(
                    env,
                    [],
                    [
                        primitive!(env, PrimitiveType::Number),
                        primitive!(env, PrimitiveType::String)
                    ]
                ),
                tuple!(
                    env,
                    [],
                    [
                        primitive!(env, PrimitiveType::Number),
                        primitive!(env, PrimitiveType::String),
                        primitive!(env, PrimitiveType::String)
                    ]
                )
            ]
        );
    }

    #[test]
    fn join_tuples_with_different_field_types() {
        let mut env = Environment::new(SpanId::SYNTHETIC, TransactionalArena::new());

        tuple!(
            env,
            a,
            [],
            [
                primitive!(env, PrimitiveType::Number),
                primitive!(env, PrimitiveType::String)
            ]
        );
        tuple!(
            env,
            b,
            [],
            [
                primitive!(env, PrimitiveType::Integer),
                primitive!(env, PrimitiveType::Boolean)
            ]
        );

        let mut lattice_env = LatticeEnvironment::new(&mut env);

        // Join should result in a new tuple with joined fields
        assert_equiv!(
            env,
            a.join(b, &mut lattice_env),
            [tuple!(
                env,
                [],
                [
                    // Number ⊔ Integer = Number (number is supertype of integer)
                    primitive!(env, PrimitiveType::Number),
                    // String ⊔ Boolean = String | Boolean (unrelated)
                    union!(
                        env,
                        [
                            primitive!(env, PrimitiveType::String),
                            primitive!(env, PrimitiveType::Boolean)
                        ]
                    )
                ]
            )]
        );
    }

    #[test]
    fn meet_identical_tuples() {
        let mut env = Environment::new(SpanId::SYNTHETIC, TransactionalArena::new());

        tuple!(
            env,
            a,
            [],
            [
                primitive!(env, PrimitiveType::Number),
                primitive!(env, PrimitiveType::String)
            ]
        );

        tuple!(
            env,
            b,
            [],
            [
                primitive!(env, PrimitiveType::Number),
                primitive!(env, PrimitiveType::String)
            ]
        );

        let mut lattice_env = LatticeEnvironment::new(&mut env);

        // Meet identical tuples should result in the same tuple
        assert_equiv!(
            env,
            a.meet(b, &mut lattice_env),
            [tuple!(
                env,
                [],
                [
                    primitive!(env, PrimitiveType::Number),
                    primitive!(env, PrimitiveType::String)
                ]
            )]
        );
    }

    #[test]
    fn meet_different_length_tuples() {
        let mut env = Environment::new(SpanId::SYNTHETIC, TransactionalArena::new());

        // Create tuples of different lengths
        tuple!(env, a, [], [primitive!(env, PrimitiveType::Number)]);

        tuple!(
            env,
            b,
            [],
            [
                primitive!(env, PrimitiveType::Number),
                primitive!(env, PrimitiveType::String)
            ]
        );

        let mut lattice_env = LatticeEnvironment::new(&mut env);

        // Meeting tuples of different lengths should return empty result
        assert_equiv!(env, a.meet(b, &mut lattice_env), []);
    }

    #[test]
    fn meet_tuples_with_different_field_types() {
        let mut env = Environment::new(SpanId::SYNTHETIC, TransactionalArena::new());

        // Create tuples with same length but different field types
        tuple!(
            env,
            a,
            [],
            [
                primitive!(env, PrimitiveType::Number),
                primitive!(env, PrimitiveType::String)
            ]
        );

        tuple!(
            env,
            b,
            [],
            [
                primitive!(env, PrimitiveType::Integer),
                primitive!(env, PrimitiveType::Boolean)
            ]
        );

        let mut lattice_env = LatticeEnvironment::new(&mut env);

        assert_equiv!(
            env,
            a.meet(b, &mut lattice_env),
            [tuple!(
                env,
                [],
                [
                    // Number ⊓ Integer = Integer (Integer is subtype of number)
                    primitive!(env, PrimitiveType::Integer),
                    // String ⊓ Boolean = Never
                    instantiate(&mut env, TypeKind::Never)
                ]
            )]
        );
    }

    #[test]
    fn uninhabited_tuples() {
        let mut env = Environment::new(SpanId::SYNTHETIC, TransactionalArena::new());

        // Create a normal tuple with inhabited types
        tuple!(
            env,
            normal_tuple,
            [],
            [
                primitive!(env, PrimitiveType::Number),
                primitive!(env, PrimitiveType::String)
            ]
        );

        // Create an empty tuple (which is considered inhabited)
        tuple!(env, empty_tuple, [], []);

        tuple!(
            env,
            never_tuple,
            [],
            [
                primitive!(env, PrimitiveType::Number),
                instantiate(&mut env, TypeKind::Never),
                primitive!(env, PrimitiveType::String)
            ]
        );

        let mut analysis_env = TypeAnalysisEnvironment::new(&env);

        // Empty tuple should be inhabited (not uninhabited)
        assert!(!empty_tuple.uninhabited(&mut analysis_env));

        // Normal tuple should be inhabited (not uninhabited)
        assert!(!normal_tuple.uninhabited(&mut analysis_env));

        // Tuple with a never field should be uninhabited
        assert!(never_tuple.uninhabited(&mut analysis_env));
    }

    #[test]
    fn semantic_equivalence() {
        let mut env = Environment::new(SpanId::SYNTHETIC, TransactionalArena::new());

        // Create tuples with same structure but different TypeIds
        tuple!(
            env,
            a,
            [],
            [
                primitive!(env, PrimitiveType::Number),
                primitive!(env, PrimitiveType::String)
            ]
        );

        tuple!(
            env,
            b,
            [],
            [
                primitive!(env, PrimitiveType::Number),
                primitive!(env, PrimitiveType::String)
            ]
        );

        // Create a tuple with different structure
        tuple!(
            env,
            c,
            [],
            [
                primitive!(env, PrimitiveType::Number),
                primitive!(env, PrimitiveType::Boolean)
            ]
        );

        // Create a tuple with different length
        tuple!(env, d, [], [primitive!(env, PrimitiveType::Number)]);

        let mut equiv_env = EquivalenceEnvironment::new(&env);

        // Tuples with semantically equivalent fields should be equivalent
        assert!(a.semantically_equivalent(b, &mut equiv_env));

        // Tuples with different field types should not be equivalent
        assert!(!a.semantically_equivalent(c, &mut equiv_env));

        // Tuples with different lengths should not be equivalent
        assert!(!a.semantically_equivalent(d, &mut equiv_env));
    }

    #[test]
    fn unification_same_structure() {
        let mut env = Environment::new(SpanId::SYNTHETIC, TransactionalArena::new());

        // Create two tuples with compatible types
        // (Number, String) and (Integer, String) are compatible because Integer <: Number
        tuple!(
            env,
            a,
            [],
            [
                primitive!(env, PrimitiveType::Number),
                primitive!(env, PrimitiveType::String)
            ]
        );

        tuple!(
            env,
            b,
            [],
            [
                primitive!(env, PrimitiveType::Integer),
                primitive!(env, PrimitiveType::String)
            ]
        );

        let mut unif_env = UnificationEnvironment::new(&mut env);

        // Unifying compatible tuples should succeed without errors
        a.unify(b, &mut unif_env);
        assert!(
            unif_env.take_diagnostics().is_empty(),
            "Unification of compatible tuples should succeed"
        );
    }

    #[test]
    fn unification_different_length() {
        let mut env = Environment::new(SpanId::SYNTHETIC, TransactionalArena::new());

        // Create tuples of different lengths
        tuple!(env, a, [], [primitive!(env, PrimitiveType::Number)]);

        tuple!(
            env,
            b,
            [],
            [
                primitive!(env, PrimitiveType::Number),
                primitive!(env, PrimitiveType::String)
            ]
        );

        let mut unif_env = UnificationEnvironment::new(&mut env);

        // Unifying tuples of different lengths should produce a diagnostic
        a.unify(b, &mut unif_env);
        let diagnostics = unif_env.take_diagnostics();
        assert!(
            !diagnostics.is_empty(),
            "Unification of tuples with different lengths should fail"
        );
    }

    #[test]
    fn unification_incompatible_field_types() {
        let mut env = Environment::new(SpanId::SYNTHETIC, TransactionalArena::new());

        // Create tuples with incompatible field types
        // Number and Boolean are incompatible types
        tuple!(
            env,
            a,
            [],
            [
                primitive!(env, PrimitiveType::Number),
                primitive!(env, PrimitiveType::String)
            ]
        );

        tuple!(
            env,
            b,
            [],
            [
                primitive!(env, PrimitiveType::Boolean),
                primitive!(env, PrimitiveType::String)
            ]
        );

        let mut unif_env = UnificationEnvironment::new(&mut env);

        // Unifying tuples with incompatible field types should produce diagnostics
        a.unify(b, &mut unif_env);
        let diagnostics = unif_env.take_diagnostics();
        assert!(
            !diagnostics.is_empty(),
            "Unification of tuples with incompatible fields should fail"
        );
    }

    #[test]
    fn simplify_tuple() {
        let mut env = Environment::new(SpanId::SYNTHETIC, TransactionalArena::new());

        // Create a tuple with fields
        tuple!(
            env,
            tuple,
            [],
            [
                primitive!(env, PrimitiveType::Number),
                primitive!(env, PrimitiveType::String)
            ]
        );

        let mut simplify_env = SimplifyEnvironment::new(&mut env);

        // Simplifying a tuple with already simplified fields should return the same tuple
        let result = tuple.simplify(&mut simplify_env);
        assert_eq!(
            result, tuple.id,
            "Simplifying a tuple with already simple fields should return the same tuple"
        );
    }

    #[test]
    fn lattice_laws() {
        let mut env = Environment::new(SpanId::SYNTHETIC, TransactionalArena::new());

        // Create three distinct single-element tuples for testing lattice laws
        // We need these to have different element types for proper lattice testing
        let a = tuple!(env, [], [primitive!(env, PrimitiveType::Number)]);
        let b = tuple!(env, [], [primitive!(env, PrimitiveType::Integer)]);
        let c = tuple!(env, [], [primitive!(env, PrimitiveType::String)]);

        // Test that tuple types satisfy lattice laws (associativity, commutativity, absorption)
        assert_lattice_laws(
            &mut env,
            |r#type| {
                r#type.map(|kind| {
                    let TypeKind::Tuple(tuple) = kind else {
                        unreachable!()
                    };

                    tuple
                })
            },
            a,
            b,
            c,
        );
    }

    #[test]
    fn structurally_equivalent() {
        let mut env = Environment::new(SpanId::SYNTHETIC, TransactionalArena::new());

        // First create type IDs for our field types
        primitive!(env, number, PrimitiveType::Number);
        primitive!(env, string, PrimitiveType::String);
        primitive!(env, boolean, PrimitiveType::Boolean);

        // Test the structurally_equivalent method directly with identical tuples
        let tuple_a = TupleType {
            fields: EcoVec::from_iter([number.id, string.id]),
            arguments: GenericArguments::default(),
        };

        let tuple_b = TupleType {
            fields: EcoVec::from_iter([number.id, string.id]),
            arguments: GenericArguments::default(),
        };

        let mut equiv_env = EquivalenceEnvironment::new(&env);

        // Identical tuples should be structurally equivalent
        assert!(tuple_a.structurally_equivalent(&tuple_b, &mut equiv_env));

        // Test with different field types
        let tuple_c = TupleType {
            fields: EcoVec::from_iter([number.id, boolean.id]),
            arguments: GenericArguments::default(),
        };

        // Tuples with different field types should not be equivalent
        assert!(!tuple_a.structurally_equivalent(&tuple_c, &mut equiv_env));

        // Test with different length
        let tuple_d = TupleType {
            fields: EcoVec::from_iter([number.id]),
            arguments: GenericArguments::default(),
        };

        // Tuples with different lengths should not be equivalent
        assert!(!tuple_a.structurally_equivalent(&tuple_d, &mut equiv_env));
    }
}
