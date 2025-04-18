use core::ops::ControlFlow;

use pretty::RcDoc;
use smallvec::SmallVec;

use super::{TypeKind, generic_argument::GenericArguments};
use crate::r#type::{
    Type, TypeId,
    environment::{Environment, LatticeEnvironment, SimplifyEnvironment, TypeAnalysisEnvironment},
    error::tuple_length_mismatch,
    lattice::Lattice,
    pretty_print::PrettyPrint,
    recursion::RecursionDepthBoundary,
};

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct TupleType<'heap> {
    pub fields: &'heap [TypeId],

    pub arguments: GenericArguments<'heap>,
}

impl<'heap> Lattice<'heap> for TupleType<'heap> {
    fn join(
        self: Type<'heap, Self>,
        other: Type<'heap, Self>,
        env: &mut LatticeEnvironment<'_, 'heap>,
    ) -> SmallVec<TypeId, 4> {
        if self.kind.fields.len() != other.kind.fields.len() {
            return SmallVec::from_slice(&[self.id, other.id]);
        }

        // join pointwise
        let mut fields = Vec::with_capacity(self.kind.fields.len());
        for (&lhs, &rhs) in self.kind.fields.iter().zip(other.kind.fields.iter()) {
            fields.push(env.join(lhs, rhs));
        }

        // Check if we can opt-out into allocating a new type
        if self.kind.fields == fields {
            return SmallVec::from_slice(&[self.id]);
        }

        if other.kind.fields == fields {
            return SmallVec::from_slice(&[other.id]);
        }

        // ... we can't so we need to allocate a new type
        let kind = env.intern_kind(TypeKind::Tuple(Self {
            fields: env.intern_type_ids(&fields),
            // merge the two arguments together, as some of the fields may refer to either
            arguments: self
                .kind
                .arguments
                .merge(&other.kind.arguments, env.environment),
        }));

        let id = env.alloc(|id| Type {
            id,
            span: self.span,
            kind,
        });

        SmallVec::from_slice(&[id])
    }

    fn meet(
        self: Type<'heap, Self>,
        other: Type<'heap, Self>,
        env: &mut LatticeEnvironment<'_, 'heap>,
    ) -> SmallVec<TypeId, 4> {
        if self.kind.fields.len() != other.kind.fields.len() {
            return SmallVec::new();
        }

        // meet pointwise
        let mut fields = Vec::with_capacity(self.kind.fields.len());
        for (&lhs, &rhs) in self.kind.fields.iter().zip(other.kind.fields.iter()) {
            fields.push(env.meet(lhs, rhs));
        }

        // Check if we can opt-out into allocating a new type
        if self.kind.fields == fields {
            return SmallVec::from_slice(&[self.id]);
        }

        if other.kind.fields == fields {
            return SmallVec::from_slice(&[other.id]);
        }

        // ... we can't so we need to allocate a new type
        let kind = env.intern_kind(TypeKind::Tuple(Self {
            fields: env.intern_type_ids(&fields),
            // merge the two arguments together, as some of the fields may refer to either
            arguments: self.kind.arguments.merge(&other.kind.arguments, env),
        }));

        let id = env.alloc(|id| Type {
            id,
            span: self.span,
            kind,
        });

        SmallVec::from_slice(&[id])
    }

    fn is_uninhabited(
        self: Type<'heap, Self>,
        env: &mut TypeAnalysisEnvironment<'_, 'heap>,
    ) -> bool {
        // uninhabited if any of the fields are uninhabited
        self.kind.fields.iter().any(|&field| env.uninhabited(field))
    }

    fn is_subtype_of(
        self: Type<'heap, Self>,
        supertype: Type<'heap, Self>,
        env: &mut TypeAnalysisEnvironment<'_, 'heap>,
    ) -> bool {
        // Tuples must have the same number of fields for subtyping to be possible
        if self.kind.fields.len() != supertype.kind.fields.len() {
            // We always fail-fast here
            let _: ControlFlow<()> = env.record_diagnostic(|env| {
                tuple_length_mismatch(
                    env.source,
                    self,
                    supertype,
                    self.kind.fields.len(),
                    supertype.kind.fields.len(),
                )
            });

            return false;
        }

        let mut compatible = true;

        // Each field in the subtype must be a subtype of the corresponding field in the supertype
        // Unify corresponding fields in each tuple
        for (&lhs_field, &rhs_field) in self.kind.fields.iter().zip(supertype.kind.fields.iter()) {
            // Fields are covariant
            let is_valid = env.in_covariant(|env| env.is_subtype_of(lhs_field, rhs_field));

            if !is_valid && env.is_fail_fast() {
                return false;
            }

            if !is_valid {
                compatible = false;
            }
        }

        compatible
    }

    fn is_equivalent(
        self: Type<'heap, Self>,
        other: Type<'heap, Self>,
        env: &mut TypeAnalysisEnvironment<'_, 'heap>,
    ) -> bool {
        self.kind.fields.len() == other.kind.fields.len()
            && self
                .kind
                .fields
                .iter()
                .zip(other.kind.fields.iter())
                .all(|(&lhs, &rhs)| env.is_equivalent(lhs, rhs))
    }

    fn simplify(self: Type<'heap, Self>, env: &mut SimplifyEnvironment<'_, 'heap>) -> TypeId {
        let mut fields = Vec::with_capacity(self.kind.fields.len());

        for &field in self.kind.fields {
            fields.push(env.simplify(field));
        }

        // Check if we can skip the creation of a new type if all the fields are identical
        if self
            .kind
            .fields
            .iter()
            .zip(fields.iter())
            .all(|(&lhs, &rhs)| lhs == rhs)
        {
            return self.id;
        }

        // Check if any of the fields are uninhabited, if that is the case we simplify down to an
        // uninhabited type
        if fields.iter().any(|&field| env.uninhabited(field)) {
            let kind = env.intern_kind(TypeKind::Never);

            return env.alloc(|id| Type {
                id,
                span: self.span,
                kind,
            });
        }

        let kind = env.intern_kind(TypeKind::Tuple(Self {
            fields: env.intern_type_ids(&fields),
            arguments: self.kind.arguments,
        }));

        // ... we can't so we need to allocate a new type
        env.alloc(|id| Type {
            id,
            span: self.span,
            kind,
        })
    }
}

impl PrettyPrint for TupleType<'_> {
    fn pretty<'env>(
        &self,
        env: &'env Environment,
        limit: RecursionDepthBoundary,
    ) -> RcDoc<'env, anstyle::Style> {
        let inner = if self.fields.is_empty() {
            RcDoc::text("()")
        } else if self.fields.len() == 1 {
            RcDoc::text("(")
                .append(limit.pretty(env, self.fields[0]))
                .append(RcDoc::text(",)"))
        } else {
            RcDoc::text("(")
                .append(
                    RcDoc::intersperse(
                        self.fields.iter().map(|&field| limit.pretty(env, field)),
                        RcDoc::text(",").append(RcDoc::line()),
                    )
                    .nest(1)
                    .group(),
                )
                .append(RcDoc::text(")"))
        };

        self.arguments.pretty(env, limit).append(inner).group()
    }
}

#[cfg(test)]
mod test {
    #![expect(clippy::min_ident_chars)]
    use super::TupleType;
    use crate::{
        heap::Heap,
        span::SpanId,
        r#type::{
            environment::{
                Environment, LatticeEnvironment, SimplifyEnvironment, TypeAnalysisEnvironment,
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
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

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

        let mut lattice_env = LatticeEnvironment::new(&env);

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
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

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

        let mut lattice_env = LatticeEnvironment::new(&env);

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
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

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

        let mut lattice_env = LatticeEnvironment::new(&env);

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
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

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

        let mut lattice_env = LatticeEnvironment::new(&env);

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
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

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

        let mut lattice_env = LatticeEnvironment::new(&env);

        // Meeting tuples of different lengths should return empty result
        assert_equiv!(env, a.meet(b, &mut lattice_env), []);
    }

    #[test]
    fn meet_tuples_with_different_field_types() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

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

        let mut lattice_env = LatticeEnvironment::new(&env);

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
                    instantiate(&env, TypeKind::Never)
                ]
            )]
        );
    }

    #[test]
    fn uninhabited_tuples() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

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
                instantiate(&env, TypeKind::Never),
                primitive!(env, PrimitiveType::String)
            ]
        );

        let mut analysis_env = TypeAnalysisEnvironment::new(&env);

        // Empty tuple should be inhabited (not uninhabited)
        assert!(!empty_tuple.is_uninhabited(&mut analysis_env));

        // Normal tuple should be inhabited (not uninhabited)
        assert!(!normal_tuple.is_uninhabited(&mut analysis_env));

        // Tuple with a never field should be uninhabited
        assert!(never_tuple.is_uninhabited(&mut analysis_env));
    }

    #[test]
    fn subtype_relationship() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Create tuple types for testing
        let number = primitive!(env, PrimitiveType::Number);
        let integer = primitive!(env, PrimitiveType::Integer);
        let string = primitive!(env, PrimitiveType::String);

        tuple!(env, tuple_number_string, [], [number, string]);
        tuple!(env, tuple_integer_string, [], [integer, string]);
        tuple!(env, tuple_number_number, [], [number, number]);
        tuple!(env, tuple_different_length, [], [number, string, number]);

        let mut analysis_env = TypeAnalysisEnvironment::new(&env);

        // Reflexivity: Every tuple is a subtype of itself
        assert!(tuple_number_string.is_subtype_of(tuple_number_string, &mut analysis_env));
        assert!(tuple_integer_string.is_subtype_of(tuple_integer_string, &mut analysis_env));

        // Tuples with the same structure but different field types
        // Since Integer <: Number, (Integer, String) <: (Number, String)
        assert!(tuple_integer_string.is_subtype_of(tuple_number_string, &mut analysis_env));

        // But (Number, String) is not a subtype of (Integer, String)
        assert!(!tuple_number_string.is_subtype_of(tuple_integer_string, &mut analysis_env));

        // Different field types entirely
        assert!(!tuple_number_string.is_subtype_of(tuple_number_number, &mut analysis_env));

        // Different length tuples have no subtyping relationship
        assert!(!tuple_number_string.is_subtype_of(tuple_different_length, &mut analysis_env));
        assert!(!tuple_different_length.is_subtype_of(tuple_number_string, &mut analysis_env));
    }

    #[test]
    fn equivalence_relationship() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

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

        let mut analysis_env = TypeAnalysisEnvironment::new(&env);

        // Tuples with semantically equivalent fields should be equivalent
        assert!(a.is_equivalent(b, &mut analysis_env));

        // Tuples with different field types should not be equivalent
        assert!(!a.is_equivalent(c, &mut analysis_env));

        // Tuples with different lengths should not be equivalent
        assert!(!a.is_equivalent(d, &mut analysis_env));
    }

    // #[test]
    // fn unification_same_structure() {
    //     let heap = Heap::new();
    //     let env = Environment::new(SpanId::SYNTHETIC, &heap);

    //     // Create two tuples with compatible types
    //     // (Number, String) and (Integer, String) are compatible because Integer <: Number
    //     tuple!(
    //         env,
    //         a,
    //         [],
    //         [
    //             primitive!(env, PrimitiveType::Number),
    //             primitive!(env, PrimitiveType::String)
    //         ]
    //     );

    //     tuple!(
    //         env,
    //         b,
    //         [],
    //         [
    //             primitive!(env, PrimitiveType::Integer),
    //             primitive!(env, PrimitiveType::String)
    //         ]
    //     );

    //     let mut unif_env = UnificationEnvironment::new(&env);

    //     // Unifying compatible tuples should succeed without errors
    //     a.unify(b, &mut unif_env);
    //     assert!(
    //         unif_env.diagnostics.take().is_empty(),
    //         "Unification of compatible tuples should succeed"
    //     );
    // }

    // #[test]
    // fn unification_different_length() {
    //     let heap = Heap::new();
    //     let env = Environment::new(SpanId::SYNTHETIC, &heap);

    //     // Create tuples of different lengths
    //     tuple!(env, a, [], [primitive!(env, PrimitiveType::Number)]);

    //     tuple!(
    //         env,
    //         b,
    //         [],
    //         [
    //             primitive!(env, PrimitiveType::Number),
    //             primitive!(env, PrimitiveType::String)
    //         ]
    //     );

    //     let mut unif_env = UnificationEnvironment::new(&env);

    //     // Unifying tuples of different lengths should produce a diagnostic
    //     a.unify(b, &mut unif_env);
    //     let diagnostics = unif_env.diagnostics.take();
    //     assert!(
    //         !diagnostics.is_empty(),
    //         "Unification of tuples with different lengths should fail"
    //     );
    // }

    // #[test]
    // fn unification_incompatible_field_types() {
    //     let heap = Heap::new();
    //     let env = Environment::new(SpanId::SYNTHETIC, &heap);

    //     // Create tuples with incompatible field types
    //     // Number and Boolean are incompatible types
    //     tuple!(
    //         env,
    //         a,
    //         [],
    //         [
    //             primitive!(env, PrimitiveType::Number),
    //             primitive!(env, PrimitiveType::String)
    //         ]
    //     );

    //     tuple!(
    //         env,
    //         b,
    //         [],
    //         [
    //             primitive!(env, PrimitiveType::Boolean),
    //             primitive!(env, PrimitiveType::String)
    //         ]
    //     );

    //     let mut unif_env = UnificationEnvironment::new(&env);

    //     // Unifying tuples with incompatible field types should produce diagnostics
    //     a.unify(b, &mut unif_env);
    //     let diagnostics = unif_env.diagnostics.take();
    //     assert!(
    //         !diagnostics.is_empty(),
    //         "Unification of tuples with incompatible fields should fail"
    //     );
    // }

    #[test]
    fn simplify_tuple() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

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

        let mut simplify_env = SimplifyEnvironment::new(&env);

        // Simplifying a tuple with already simplified fields should return the same tuple
        let result = tuple.simplify(&mut simplify_env);
        assert_eq!(
            result, tuple.id,
            "Simplifying a tuple with already simple fields should return the same tuple"
        );
    }

    #[test]
    fn lattice_laws() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Create three distinct single-element tuples for testing lattice laws
        // We need these to have different element types for proper lattice testing
        let a = tuple!(env, [], [primitive!(env, PrimitiveType::Number)]);
        let b = tuple!(env, [], [primitive!(env, PrimitiveType::Integer)]);
        let c = tuple!(env, [], [primitive!(env, PrimitiveType::String)]);

        // Test that tuple types satisfy lattice laws (associativity, commutativity, absorption)
        assert_lattice_laws(
            &env,
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
}
