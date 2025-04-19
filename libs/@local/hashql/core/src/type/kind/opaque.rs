use pretty::RcDoc;
use smallvec::SmallVec;

use super::{TypeKind, generic_argument::GenericArguments};
use crate::{
    symbol::InternedSymbol,
    r#type::{
        Type, TypeId,
        environment::{
            Environment, LatticeEnvironment, SimplifyEnvironment, TypeAnalysisEnvironment,
        },
        lattice::Lattice,
        pretty_print::PrettyPrint,
        recursion::RecursionDepthBoundary,
    },
};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct OpaqueType<'heap> {
    pub name: InternedSymbol<'heap>,
    pub repr: TypeId,

    pub arguments: GenericArguments<'heap>,
}

impl<'heap> OpaqueType<'heap> {
    fn postprocess_lattice(
        self: Type<'heap, Self>,
        other: Type<'heap, Self>,
        result: SmallVec<TypeId, 4>,
        env: &Environment<'heap>,
    ) -> SmallVec<TypeId, 4> {
        if result.is_empty() {
            // Early exit if empty, that way we don't need to allocate an arguments if we aren't
            // going to use it
            return SmallVec::new();
        }

        // Try to see if we can't re-use one of the opaque types instead of creating new ones
        if result == [self.kind.repr] {
            return SmallVec::from_slice(&[self.id]);
        }

        if result == [other.kind.repr] {
            return SmallVec::from_slice(&[other.id]);
        }

        // Merge the two arguments together, as the inner type may refer to either
        let arguments = self.kind.arguments.merge(&other.kind.arguments, env);

        result
            .into_iter()
            .map(|repr| {
                env.alloc(|id| Type {
                    id,
                    span: self.span,
                    kind: env.intern_kind(TypeKind::Opaque(OpaqueType {
                        name: self.kind.name,
                        repr,
                        arguments,
                    })),
                })
            })
            .collect()
    }
}

impl<'heap> Lattice<'heap> for OpaqueType<'heap> {
    fn join(
        self: Type<'heap, Self>,
        other: Type<'heap, Self>,
        env: &mut LatticeEnvironment<'_, 'heap>,
    ) -> SmallVec<TypeId, 4> {
        if self.kind.name != other.kind.name {
            return SmallVec::from_slice(&[self.id, other.id]);
        }

        let self_repr = env.types[self.kind.repr].copied();
        let other_repr = env.types[other.kind.repr].copied();

        // We circumvent `env.join` here, by directly joining the representations. This is
        // intentional, so that we can propagate the join result instead of having a `Union`.
        let result = self_repr.join(other_repr, env);

        self.postprocess_lattice(other, result, env.environment)
    }

    fn meet(
        self: Type<'heap, Self>,
        other: Type<'heap, Self>,
        env: &mut LatticeEnvironment<'_, 'heap>,
    ) -> SmallVec<TypeId, 4> {
        if self.kind.name != other.kind.name {
            return SmallVec::new();
        }

        let self_repr = env.types[self.kind.repr].copied();
        let other_repr = env.types[other.kind.repr].copied();

        // We circumvent `env.meet` here, by directly meeting the representations. This is
        // intentional, so that we can propagate the meet result instead of having a `Intersection`.
        let result = self_repr.meet(other_repr, env);

        self.postprocess_lattice(other, result, env.environment)
    }

    fn is_bottom(self: Type<'heap, Self>, env: &mut TypeAnalysisEnvironment<'_, 'heap>) -> bool {
        env.is_bottom(self.kind.repr)
    }

    fn is_top(self: Type<'heap, Self>, env: &mut TypeAnalysisEnvironment<'_, 'heap>) -> bool {
        env.is_top(self.kind.repr)
    }

    fn is_subtype_of(
        self: Type<'heap, Self>,
        supertype: Type<'heap, Self>,
        env: &mut TypeAnalysisEnvironment<'_, 'heap>,
    ) -> bool {
        self.kind.name == supertype.kind.name
            && env.is_subtype_of(self.kind.repr, supertype.kind.repr)
    }

    fn is_equivalent(
        self: Type<'heap, Self>,
        other: Type<'heap, Self>,
        env: &mut TypeAnalysisEnvironment<'_, 'heap>,
    ) -> bool {
        self.kind.name == other.kind.name && env.is_equivalent(self.kind.repr, other.kind.repr)
    }

    fn simplify(self: Type<'heap, Self>, env: &mut SimplifyEnvironment<'_, 'heap>) -> TypeId {
        let repr = env.simplify(self.kind.repr);

        if repr == self.kind.repr {
            return self.id;
        }

        env.alloc(|id| Type {
            id,
            span: self.span,
            kind: env.intern_kind(TypeKind::Opaque(OpaqueType {
                name: self.kind.name,
                repr,
                arguments: self.kind.arguments,
            })),
        })
    }
}

impl PrettyPrint for OpaqueType<'_> {
    fn pretty<'env>(
        &self,
        env: &'env Environment,
        limit: RecursionDepthBoundary,
    ) -> pretty::RcDoc<'env, anstyle::Style> {
        RcDoc::text(self.name.as_str().to_owned())
            .append(self.arguments.pretty(env, limit))
            .append(RcDoc::text("["))
            .append(limit.pretty(env, self.repr).nest(1).group())
            .append(RcDoc::text("]"))
            .group()
    }
}

#[cfg(test)]
mod test {
    #![expect(clippy::min_ident_chars)]
    use super::OpaqueType;
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
                test::{assert_equiv, opaque, primitive, union},
                union::UnionType,
            },
            lattice::{Lattice as _, test::assert_lattice_laws},
            pretty_print::PrettyPrint as _,
            test::instantiate,
        },
    };

    #[test]
    fn join_same_name_different_repr() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Create two opaque types with the same name but different representations
        let a_repr = primitive!(env, PrimitiveType::Number);
        let b_repr = primitive!(env, PrimitiveType::String);

        opaque!(env, a, "MyType", a_repr, []);
        opaque!(env, b, "MyType", b_repr, []);

        let mut lattice_env = LatticeEnvironment::new(&env);

        // Joining should result in an opaque type with the same name but representation
        // that is the join of the two representations (a union in this case)
        // Should have two variants: number and string
        assert_equiv!(env, a.join(b, &mut lattice_env), [a.id, b.id]);
    }

    #[test]
    fn join_same_name_subtype() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        opaque!(env, a, "MyType", primitive!(env, PrimitiveType::Number), []);
        opaque!(
            env,
            b,
            "MyType",
            primitive!(env, PrimitiveType::Integer),
            []
        );

        let mut lattice_env = LatticeEnvironment::new(&env);

        assert_equiv!(env, a.join(b, &mut lattice_env), [a.id]);
    }

    #[test]
    fn join_different_names() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Create two opaque types with different names
        let a_repr = primitive!(env, PrimitiveType::Number);
        let b_repr = primitive!(env, PrimitiveType::Number); // Same representation, different name

        opaque!(env, a, "TypeA", a_repr, []);
        opaque!(env, b, "TypeB", b_repr, []);

        let mut lattice_env = LatticeEnvironment::new(&env);

        // Joining opaque types with different names should result in a union of both
        assert_equiv!(env, a.join(b, &mut lattice_env), [a.id, b.id]);
    }

    #[test]
    fn meet_same_name_different_repr() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        opaque!(env, a, "MyType", primitive!(env, PrimitiveType::Number), []);
        opaque!(
            env,
            b,
            "MyType",
            union!(
                env,
                [
                    primitive!(env, PrimitiveType::Number),
                    primitive!(env, PrimitiveType::String)
                ]
            ),
            []
        );

        let mut lattice_env = LatticeEnvironment::new(&env);

        // Meeting should result in an opaque type with the same name but representation
        // that is the meet of the two representations (just Number in this case)
        assert_equiv!(
            env,
            a.meet(b, &mut lattice_env),
            [opaque!(
                env,
                "MyType",
                union!(
                    env,
                    [
                        primitive!(env, PrimitiveType::Number),
                        instantiate(&env, TypeKind::Never)
                    ]
                ),
                []
            )]
        );
    }

    #[test]
    fn meet_different_names() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Create two opaque types with different names
        let a_repr = primitive!(env, PrimitiveType::Number);
        let b_repr = primitive!(env, PrimitiveType::Number);

        opaque!(env, a, "TypeA", a_repr, []);
        opaque!(env, b, "TypeB", b_repr, []);

        let mut lattice_env = LatticeEnvironment::new(&env);

        // Meeting opaque types with different names should return `Never`
        assert_equiv!(env, a.meet(b, &mut lattice_env), []);
    }

    #[test]
    fn is_subtype_of_test() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Create an opaque type for numbers
        let a_repr = primitive!(env, PrimitiveType::Number);
        // Create an opaque type for the union of numbers and strings
        let b_repr = union!(
            env,
            [
                primitive!(env, PrimitiveType::Number),
                primitive!(env, PrimitiveType::String)
            ]
        );

        // Number variant is a subtype of Number|String
        opaque!(env, a, "MyType", a_repr, []);
        opaque!(env, b, "MyType", b_repr, []);

        // Different name with same representation
        opaque!(env, c, "DifferentType", a_repr, []);

        let mut analysis_env = TypeAnalysisEnvironment::new(&env);

        // a should be a subtype of b (Number is a subtype of Number|String)
        assert!(a.is_subtype_of(b, &mut analysis_env));

        // b should not be a subtype of a (Number|String is not a subtype of Number)
        assert!(!b.is_subtype_of(a, &mut analysis_env));

        // c should not be a subtype of a (different names)
        assert!(!c.is_subtype_of(a, &mut analysis_env));
    }

    #[test]
    fn is_equivalent_test() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Create two identical opaque types
        let a_repr = primitive!(env, PrimitiveType::Number);
        let b_repr = primitive!(env, PrimitiveType::Number);

        opaque!(env, a, "MyType", a_repr, []);
        opaque!(env, b, "MyType", b_repr, []);

        // Different name with same representation
        opaque!(env, c, "DifferentType", a_repr, []);

        // Same name but different representation
        opaque!(env, d, "MyType", primitive!(env, PrimitiveType::String), []);

        let mut analysis_env = TypeAnalysisEnvironment::new(&env);

        // a and b should be equivalent (same name, equivalent representations)
        assert!(a.is_equivalent(b, &mut analysis_env));

        // a and c should not be equivalent (different names)
        assert!(!a.is_equivalent(c, &mut analysis_env));

        // a and d should not be equivalent (same name but different representations)
        assert!(!a.is_equivalent(d, &mut analysis_env));
    }

    #[test]
    fn simplify() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Create an opaque type with a union that contains duplicates
        let repr = union!(
            env,
            [
                primitive!(env, PrimitiveType::Number),
                primitive!(env, PrimitiveType::Number)
            ]
        );

        opaque!(env, a, "MyType", repr, []);

        let mut simplify_env = SimplifyEnvironment::new(&env);

        assert_equiv!(
            env,
            [a.simplify(&mut simplify_env)],
            [opaque!(
                env,
                "MyType",
                primitive!(env, PrimitiveType::Number),
                []
            )]
        );
    }

    #[test]
    fn nested_opaque_types() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        opaque!(
            env,
            a,
            "Outer",
            opaque!(env, "Inner", primitive!(env, PrimitiveType::Number), []),
            []
        );

        opaque!(
            env,
            b,
            "Outer",
            opaque!(env, "Inner", primitive!(env, PrimitiveType::String), []),
            []
        );

        let mut lattice_env = LatticeEnvironment::new(&env);

        assert_equiv!(
            env,
            a.join(b, &mut lattice_env),
            [
                opaque!(
                    env,
                    "Outer",
                    opaque!(env, "Inner", primitive!(env, PrimitiveType::Number), []),
                    []
                ),
                opaque!(
                    env,
                    "Outer",
                    opaque!(env, "Inner", primitive!(env, PrimitiveType::String), []),
                    []
                )
            ]
        );
    }

    #[test]
    fn lattice_laws() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Create various opaque types for testing lattice laws
        let number_repr = primitive!(env, PrimitiveType::Number);
        let string_repr = primitive!(env, PrimitiveType::String);
        let bool_repr = primitive!(env, PrimitiveType::Boolean);

        let a = opaque!(env, "Type", number_repr, []);
        let b = opaque!(env, "Type", string_repr, []);
        let c = opaque!(env, "Type", bool_repr, []);

        // Test lattice laws on these opaque types
        assert_lattice_laws(&env, a, b, c);
    }
}
