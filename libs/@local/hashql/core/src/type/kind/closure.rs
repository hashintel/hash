use core::ops::ControlFlow;

use pretty::RcDoc;
use smallvec::SmallVec;

use super::{TypeKind, generic_argument::GenericArguments};
use crate::r#type::{
    Type, TypeId,
    environment::{Environment, LatticeEnvironment, SimplifyEnvironment, TypeAnalysisEnvironment},
    error::function_parameter_count_mismatch,
    lattice::Lattice,
    pretty_print::PrettyPrint,
    recursion::RecursionDepthBoundary,
};

/// Represents a function or closure type in the type system.
///
/// # Variance Properties
///
/// Closure types have specific variance characteristics that affect subtyping relationships:
///
/// - **Parameter count**: Invariant - two closure types must have exactly the same number of
///   parameters to be comparable.
///
/// - **Parameter types**: Contravariant - if type `A` is a subtype of `B`, then a function
///   accepting `B` is a subtype of a function accepting `A`.
///
/// - **Return type**: Covariant - if type `A` is a subtype of `B`, then a function returning `A` is
///   a subtype of a function returning `B`.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct ClosureType<'heap> {
    pub params: &'heap [TypeId],
    pub returns: TypeId,

    pub arguments: GenericArguments<'heap>,
}

impl<'heap> ClosureType<'heap> {
    fn postprocess_lattice(
        self: Type<'heap, Self>,
        other: Type<'heap, Self>,
        env: &Environment<'heap>,
        params: &[TypeId],
        returns: TypeId,
    ) -> SmallVec<TypeId, 4> {
        // Try to re-use one of the closures
        if *self.kind.params == *params && self.kind.returns == returns {
            return SmallVec::from_slice(&[self.id]);
        }

        if *other.kind.params == *params && other.kind.returns == returns {
            return SmallVec::from_slice(&[other.id]);
        }

        SmallVec::from_slice(&[env.alloc(|id| Type {
            id,
            span: self.span,
            kind: env.intern_kind(TypeKind::Closure(Self {
                params: env.intern_type_ids(params),
                returns,
                // merge the two arguments together, as some of the fields may refer to either
                arguments: self.kind.arguments.merge(&other.kind.arguments, env),
            })),
        })])
    }
}

impl<'heap> Lattice<'heap> for ClosureType<'heap> {
    fn join(
        self: Type<'heap, Self>,
        other: Type<'heap, Self>,
        env: &mut LatticeEnvironment<'_, 'heap>,
    ) -> SmallVec<TypeId, 4> {
        // invariant over width
        if self.kind.params.len() != other.kind.params.len() {
            return SmallVec::from_slice(&[self.id, other.id]);
        }

        let mut params = SmallVec::<_, 16>::new();
        for (&lhs_param, &rhs_param) in self.kind.params.iter().zip(other.kind.params.iter()) {
            // Important: Parameters are contravariant, therefore we switch the `join` to `meet`.
            params.push(env.meet(lhs_param, rhs_param));
        }

        let returns = env.join(self.kind.returns, other.kind.returns);

        self.postprocess_lattice(other, env, &params, returns)
    }

    fn meet(
        self: Type<'heap, Self>,
        other: Type<'heap, Self>,
        env: &mut LatticeEnvironment<'_, 'heap>,
    ) -> SmallVec<TypeId, 4> {
        // invariant over width
        if self.kind.params.len() != other.kind.params.len() {
            return SmallVec::new();
        }

        let mut params = SmallVec::<_, 16>::new();
        for (&lhs_param, &rhs_param) in self.kind.params.iter().zip(other.kind.params.iter()) {
            // Important: Parameters are contravariant, therefore we switch the `meet` to `join`.
            params.push(env.join(lhs_param, rhs_param));
        }

        let returns = env.meet(self.kind.returns, other.kind.returns);

        self.postprocess_lattice(other, env, &params, returns)
    }

    fn is_bottom(self: Type<'heap, Self>, _: &mut TypeAnalysisEnvironment<'_, 'heap>) -> bool {
        // Never a bottom type, if params is `Never`, then that just means that the function cannot
        // be invoked, but doesn't mean that it's uninhabited. The same applies to the return type.
        false
    }

    fn is_top(self: Type<'heap, Self>, _: &mut TypeAnalysisEnvironment<'_, 'heap>) -> bool {
        false
    }

    fn is_concrete(self: Type<'heap, Self>, env: &mut TypeAnalysisEnvironment<'_, 'heap>) -> bool {
        self.kind.params.iter().all(|&param| env.is_concrete(param))
            && env.is_concrete(self.kind.returns)
    }

    fn distribute_union(
        self: Type<'heap, Self>,
        _: &mut TypeAnalysisEnvironment<'_, 'heap>,
    ) -> SmallVec<TypeId, 16> {
        SmallVec::from_slice(&[self.id])
    }

    fn distribute_intersection(
        self: Type<'heap, Self>,
        _: &mut TypeAnalysisEnvironment<'_, 'heap>,
    ) -> SmallVec<TypeId, 16> {
        // We do not distribute over closures, as we cannot show that `(A & B) -> R` is equivalent
        // to `(A -> R) | (B -> R)`. In general distribution only works with covariant arguments,
        // not with contravariant arguments, as we can only prove one direction, but not
        // necessarily the other. For example, we can prove that `(a: A) & (a: B)` is
        // equivalent to `(a: A & B)`, and vice-verse, as it is covariant, this is not
        // necessarily the case for contravariant arguments.
        //
        // In *theory* one can distribute over closures that are of type `(A | B) -> R` to `(A -> R)
        // & (B -> R)`, this makes logically sense, as a function that handles either `A` or `B`
        // must be a function that handles `A` and one that handles `B`.
        //
        // As this is quite counter intuitive and breaks function selection down the line, we do not
        // distribute over closures.
        SmallVec::from_slice(&[self.id])
    }

    fn is_subtype_of(
        self: Type<'heap, Self>,
        supertype: Type<'heap, Self>,
        env: &mut TypeAnalysisEnvironment<'_, 'heap>,
    ) -> bool {
        // Functions are contravariant over the params and covariant over the return type
        // This mirrors the behaviour of Rust.

        // Invariant over the param-width
        if self.kind.params.len() != supertype.kind.params.len() {
            let _: ControlFlow<()> = env.record_diagnostic(|env| {
                function_parameter_count_mismatch(
                    env.source,
                    self,
                    supertype,
                    self.kind.params.len(),
                    supertype.kind.params.len(),
                )
            });

            return false;
        }

        let mut compatible = true;

        // Parameters are contravariant
        for (&self_param, &super_param) in self.kind.params.iter().zip(supertype.kind.params.iter())
        {
            compatible &= env.in_contravariant(|env| env.is_subtype_of(self_param, super_param));

            if !compatible && env.is_fail_fast() {
                return false;
            }
        }

        // Return type is covariant
        compatible &=
            env.in_covariant(|env| env.is_subtype_of(self.kind.returns, supertype.kind.returns));

        compatible
    }

    fn simplify(self: Type<'heap, Self>, env: &mut SimplifyEnvironment<'_, 'heap>) -> TypeId {
        let mut params = SmallVec::<_, 16>::with_capacity(16);
        for &param in self.kind.params {
            params.push(env.simplify(param));
        }

        let r#return = env.simplify(self.kind.returns);

        // We can reuse the type if it's already simplified
        if *params == *self.kind.params && r#return == self.kind.returns {
            return self.id;
        }

        env.alloc(|id| Type {
            id,
            span: self.span,
            kind: env.intern_kind(TypeKind::Closure(Self {
                params: env.intern_type_ids(&params),
                returns: r#return,
                arguments: self.kind.arguments,
            })),
        })
    }
}

impl PrettyPrint for ClosureType<'_> {
    fn pretty<'env>(
        &self,
        env: &'env Environment,
        limit: RecursionDepthBoundary,
    ) -> pretty::RcDoc<'env, anstyle::Style> {
        RcDoc::text("fn")
            .append(self.arguments.pretty(env, limit))
            .append("(")
            .append(RcDoc::intersperse(
                self.params.iter().map(|&param| limit.pretty(env, param)),
                RcDoc::text(",").append(RcDoc::line()),
            ))
            .append(")")
            .append(RcDoc::line())
            .append("->")
            .append(RcDoc::line())
            .append(limit.pretty(env, self.returns))
            .group()
    }
}

#[cfg(test)]
mod test {
    #![expect(clippy::min_ident_chars)]
    use super::ClosureType;
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
                test::{assert_equiv, closure, intersection, primitive, union},
                union::UnionType,
            },
            lattice::{Lattice as _, test::assert_lattice_laws},
            pretty_print::PrettyPrint as _,
            test::instantiate,
        },
    };

    #[test]
    fn join_identical_closures() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Create two identical closures: fn(Number) -> String
        closure!(
            env,
            a,
            [],
            [primitive!(env, PrimitiveType::Number)],
            primitive!(env, PrimitiveType::String)
        );

        closure!(
            env,
            b,
            [],
            [primitive!(env, PrimitiveType::Number)],
            primitive!(env, PrimitiveType::String)
        );

        let mut lattice_env = LatticeEnvironment::new(&env);

        // Join identical closures should result in the same closure
        assert_equiv!(
            env,
            a.join(b, &mut lattice_env),
            [closure!(
                env,
                [],
                [primitive!(env, PrimitiveType::Number)],
                primitive!(env, PrimitiveType::String)
            )]
        );
    }

    #[test]
    fn join_closures_with_different_param_types() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Create a closure accepting Integer: fn(Integer) -> String
        closure!(
            env,
            a,
            [],
            [primitive!(env, PrimitiveType::Integer)],
            primitive!(env, PrimitiveType::String)
        );

        // Create a closure accepting Number: fn(Number) -> String
        closure!(
            env,
            b,
            [],
            [primitive!(env, PrimitiveType::Number)],
            primitive!(env, PrimitiveType::String)
        );

        let mut lattice_env = LatticeEnvironment::new(&env);

        // Join closures with different parameter types
        // Parameter types are contravariant, so we use meet on them
        // Since Integer <: Number, meet(Integer, Number) = Integer
        assert_equiv!(
            env,
            a.join(b, &mut lattice_env),
            [closure!(
                env,
                [],
                [primitive!(env, PrimitiveType::Integer)],
                primitive!(env, PrimitiveType::String)
            )]
        );
    }

    #[test]
    fn join_closures_with_different_return_types() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Create a closure returning Integer: fn(Number) -> Integer
        closure!(
            env,
            a,
            [],
            [primitive!(env, PrimitiveType::Number)],
            primitive!(env, PrimitiveType::Integer)
        );

        // Create a closure returning Number: fn(Number) -> Number
        closure!(
            env,
            b,
            [],
            [primitive!(env, PrimitiveType::Number)],
            primitive!(env, PrimitiveType::Number)
        );

        let mut lattice_env = LatticeEnvironment::new(&env);

        // Join closures with different return types
        // Return types are covariant, so we use join on them
        // Since Integer <: Number, join(Integer, Number) = Number
        assert_equiv!(
            env,
            a.join(b, &mut lattice_env),
            [closure!(
                env,
                [],
                [primitive!(env, PrimitiveType::Number)],
                primitive!(env, PrimitiveType::Number)
            )]
        );
    }

    #[test]
    fn join_closures_different_param_count() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Create closures with different parameter counts
        closure!(
            env,
            a,
            [],
            [primitive!(env, PrimitiveType::Number)],
            primitive!(env, PrimitiveType::String)
        );

        closure!(
            env,
            b,
            [],
            [
                primitive!(env, PrimitiveType::Number),
                primitive!(env, PrimitiveType::Boolean)
            ],
            primitive!(env, PrimitiveType::String)
        );

        let mut lattice_env = LatticeEnvironment::new(&env);

        // Join closures with different parameter counts should return both types
        // Since closures are invariant over parameter count
        let result = a.join(b, &mut lattice_env);
        assert_eq!(result.len(), 2);
        assert!(result.contains(&a.id));
        assert!(result.contains(&b.id));
    }

    #[test]
    fn meet_identical_closures() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Create two identical closures
        closure!(
            env,
            a,
            [],
            [primitive!(env, PrimitiveType::Number)],
            primitive!(env, PrimitiveType::String)
        );

        closure!(
            env,
            b,
            [],
            [primitive!(env, PrimitiveType::Number)],
            primitive!(env, PrimitiveType::String)
        );

        let mut lattice_env = LatticeEnvironment::new(&env);

        // Meet identical closures should result in the same closure
        assert_equiv!(
            env,
            a.meet(b, &mut lattice_env),
            [closure!(
                env,
                [],
                [primitive!(env, PrimitiveType::Number)],
                primitive!(env, PrimitiveType::String)
            )]
        );
    }

    #[test]
    fn meet_closures_with_different_param_types() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Create closures with different parameter types
        closure!(
            env,
            a,
            [],
            [primitive!(env, PrimitiveType::Integer)],
            primitive!(env, PrimitiveType::String)
        );

        closure!(
            env,
            b,
            [],
            [primitive!(env, PrimitiveType::Number)],
            primitive!(env, PrimitiveType::String)
        );

        let mut lattice_env = LatticeEnvironment::new(&env);

        // Meet closures with different parameter types
        // Parameters are contravariant, so we use join on them
        // Since Integer <: Number, join(Integer, Number) = Number
        assert_equiv!(
            env,
            a.meet(b, &mut lattice_env),
            [closure!(
                env,
                [],
                [primitive!(env, PrimitiveType::Number)],
                primitive!(env, PrimitiveType::String)
            )]
        );
    }

    #[test]
    fn meet_closures_with_different_return_types() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Create closures with different return types
        closure!(
            env,
            a,
            [],
            [primitive!(env, PrimitiveType::Number)],
            primitive!(env, PrimitiveType::Integer)
        );

        closure!(
            env,
            b,
            [],
            [primitive!(env, PrimitiveType::Number)],
            primitive!(env, PrimitiveType::Number)
        );

        let mut lattice_env = LatticeEnvironment::new(&env);

        // Meet closures with different return types
        // Return types are covariant, so we use meet on them
        // Since Integer <: Number, meet(Integer, Number) = Integer
        assert_equiv!(
            env,
            a.meet(b, &mut lattice_env),
            [closure!(
                env,
                [],
                [primitive!(env, PrimitiveType::Number)],
                primitive!(env, PrimitiveType::Integer)
            )]
        );
    }

    #[test]
    fn meet_closures_different_param_count() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Create closures with different parameter counts
        closure!(
            env,
            a,
            [],
            [primitive!(env, PrimitiveType::Number)],
            primitive!(env, PrimitiveType::String)
        );

        closure!(
            env,
            b,
            [],
            [
                primitive!(env, PrimitiveType::Number),
                primitive!(env, PrimitiveType::Boolean)
            ],
            primitive!(env, PrimitiveType::String)
        );

        let mut lattice_env = LatticeEnvironment::new(&env);

        // Meet closures with different parameter counts should return empty
        // Since closures are invariant over parameter count
        let result = a.meet(b, &mut lattice_env);
        assert_eq!(result.len(), 0);
    }

    #[test]
    fn is_bottom_and_is_top() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);
        let mut analysis_env = TypeAnalysisEnvironment::new(&env);

        // Create a normal closure
        closure!(
            env,
            normal_closure,
            [],
            [primitive!(env, PrimitiveType::Number)],
            primitive!(env, PrimitiveType::String)
        );

        // Create a closure with Never parameter type
        closure!(
            env,
            never_param_closure,
            [],
            [instantiate(&env, TypeKind::Never)],
            primitive!(env, PrimitiveType::String)
        );

        // Create a closure with Never return type
        closure!(
            env,
            never_return_closure,
            [],
            [primitive!(env, PrimitiveType::Number)],
            instantiate(&env, TypeKind::Never)
        );

        // Closures are never bottom types, even with Never parameters or return type
        assert!(!normal_closure.is_bottom(&mut analysis_env));
        assert!(!never_param_closure.is_bottom(&mut analysis_env));
        assert!(!never_return_closure.is_bottom(&mut analysis_env));

        // Closures are never top types
        assert!(!normal_closure.is_top(&mut analysis_env));
    }

    #[test]
    fn is_concrete() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);
        let mut analysis_env = TypeAnalysisEnvironment::new(&env);

        // Create a concrete closure
        closure!(
            env,
            concrete_closure,
            [],
            [primitive!(env, PrimitiveType::Number)],
            primitive!(env, PrimitiveType::String)
        );

        // Create a closure with a non-concrete parameter
        let infer_var = instantiate(&env, TypeKind::Infer);
        closure!(
            env,
            non_concrete_param,
            [],
            [infer_var],
            primitive!(env, PrimitiveType::String)
        );

        // Create a closure with a non-concrete return type
        closure!(
            env,
            non_concrete_return,
            [],
            [primitive!(env, PrimitiveType::Number)],
            infer_var
        );

        // Concrete closure should be concrete
        assert!(concrete_closure.is_concrete(&mut analysis_env));

        // Closures with non-concrete parameters or returns should not be concrete
        assert!(!non_concrete_param.is_concrete(&mut analysis_env));
        assert!(!non_concrete_return.is_concrete(&mut analysis_env));
    }

    #[test]
    fn subtype_relationship() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);
        let mut analysis_env = TypeAnalysisEnvironment::new(&env);

        let number = primitive!(env, PrimitiveType::Number);
        let integer = primitive!(env, PrimitiveType::Integer);
        let string = primitive!(env, PrimitiveType::String);

        // Create various closures for testing subtyping
        closure!(
            env,
            closure_a,
            [],
            [number], // fn(Number) -> Integer
            integer
        );

        closure!(
            env,
            closure_b,
            [],
            [integer], // fn(Integer) -> Integer
            integer
        );

        closure!(
            env,
            closure_c,
            [],
            [integer], // fn(Integer) -> Number
            number
        );

        closure!(
            env,
            closure_d,
            [],
            [number], // fn(Number) -> Number
            number
        );

        // Test parameter contravariance:
        // fn(Number) -> Integer <: fn(Integer) -> Integer
        // Because Number >: Integer (contravariant!)
        assert!(closure_a.is_subtype_of(closure_b, &mut analysis_env));

        // Test return type covariance:
        // fn(Integer) -> Integer <: fn(Integer) -> Number
        // Because Integer <: Number (covariant)
        assert!(closure_b.is_subtype_of(closure_c, &mut analysis_env));

        // Test combined effects:
        // fn(Number) -> Integer <: fn(Integer) -> Number
        // Parameter: Number >: Integer
        // Return: Integer <: Number
        assert!(closure_a.is_subtype_of(closure_c, &mut analysis_env));

        // Test parameter contravariance (opposite direction):
        // fn(Integer) -> Integer is NOT a subtype of fn(Number) -> Integer
        // Because Integer <: Number (wrong direction for contravariance)
        assert!(!closure_b.is_subtype_of(closure_a, &mut analysis_env));

        // Subtyping with different parameter counts
        closure!(
            env,
            closure_e,
            [],
            [number, string], // fn(Number, String) -> Integer
            integer
        );

        // Different parameter count means they're not in a subtyping relationship
        assert!(!closure_a.is_subtype_of(closure_e, &mut analysis_env));
        assert!(!closure_e.is_subtype_of(closure_a, &mut analysis_env));

        // Test return type covariance with same parameter types:
        // fn(Number) -> Integer <: fn(Number) -> Number
        // Because Integer <: Number (covariant return type)
        assert!(closure_a.is_subtype_of(closure_d, &mut analysis_env));

        // Test reflexivity: all closures are subtypes of themselves
        assert!(closure_d.is_subtype_of(closure_d, &mut analysis_env));
    }

    #[test]
    fn equivalence_relationship() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);
        let mut analysis_env = TypeAnalysisEnvironment::new(&env);

        // Create identical closures semantically
        closure!(
            env,
            a,
            [],
            [primitive!(env, PrimitiveType::Number)],
            primitive!(env, PrimitiveType::String)
        );

        closure!(
            env,
            b,
            [],
            [primitive!(env, PrimitiveType::Number)],
            primitive!(env, PrimitiveType::String)
        );

        // Create a closure with different return type
        closure!(
            env,
            c,
            [],
            [primitive!(env, PrimitiveType::Number)],
            primitive!(env, PrimitiveType::Boolean)
        );

        // Create a closure with different parameter type
        closure!(
            env,
            d,
            [],
            [primitive!(env, PrimitiveType::Integer)],
            primitive!(env, PrimitiveType::String)
        );

        // Test equivalence properties
        assert!(a.is_equivalent(b, &mut analysis_env));
        assert!(!a.is_equivalent(c, &mut analysis_env));
        assert!(!a.is_equivalent(d, &mut analysis_env));

        // Self-equivalence check
        assert!(a.is_equivalent(a, &mut analysis_env));
    }

    #[test]
    fn distribute_union() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);
        let mut analysis_env = TypeAnalysisEnvironment::new(&env);

        // Create primitive types
        let number = primitive!(env, PrimitiveType::Number);
        let string = primitive!(env, PrimitiveType::String);
        let boolean = primitive!(env, PrimitiveType::Boolean);

        // Create a union type for the return type
        let union_type = union!(env, [string, boolean]);

        // Create a closure with union return type
        closure!(env, closure_with_union_return, [], [number], union_type);

        // Distribute union across the return type (covariant position)
        let result = closure_with_union_return.distribute_union(&mut analysis_env);

        // Should result in the same type
        assert_equiv!(env, result, [closure_with_union_return.id]);
    }

    #[test]
    fn distribute_intersection() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);
        let mut analysis_env = TypeAnalysisEnvironment::new(&env);

        // Create primitive types
        let number = primitive!(env, PrimitiveType::Number);
        let string = primitive!(env, PrimitiveType::String);
        let integer = primitive!(env, PrimitiveType::Integer);

        // Create an intersection type for parameter (contravariant position)
        let intersect_type = intersection!(env, [number, string]);

        // Create a closure with intersection parameter
        closure!(
            env,
            closure_with_intersect_param,
            [],
            [intersect_type],
            integer
        );

        let result = closure_with_intersect_param.distribute_intersection(&mut analysis_env);

        // Should result in no change
        assert_equiv!(env, result, [closure_with_intersect_param.id]);
    }

    #[test]
    fn simplify_closure() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Create a normal closure
        closure!(
            env,
            normal_closure,
            [],
            [primitive!(env, PrimitiveType::Number)],
            primitive!(env, PrimitiveType::String)
        );

        let mut simplify_env = SimplifyEnvironment::new(&env);

        // Simplifying an already simplified closure should return the same closure
        let result = normal_closure.simplify(&mut simplify_env);
        assert_eq!(result, normal_closure.id);
    }

    #[test]
    fn lattice_laws() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Create three distinct closures for testing lattice laws
        let a = closure!(
            env,
            [],
            [primitive!(env, PrimitiveType::Number)],
            primitive!(env, PrimitiveType::String)
        );

        let b = closure!(
            env,
            [],
            [primitive!(env, PrimitiveType::Integer)],
            primitive!(env, PrimitiveType::Boolean)
        );

        let c = closure!(
            env,
            [],
            [primitive!(env, PrimitiveType::String)],
            primitive!(env, PrimitiveType::Number)
        );

        // Test lattice laws (commutativity, associativity, absorption, etc.)
        assert_lattice_laws(&env, a, b, c);
    }
}
