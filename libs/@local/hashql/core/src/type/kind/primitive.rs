use core::ops::Index;

use pretty::RcDoc;
use smallvec::SmallVec;

use crate::r#type::{
    Type, TypeId,
    environment::{
        EquivalenceEnvironment, LatticeEnvironment, SimplifyEnvironment, TypeAnalysisEnvironment,
        UnificationEnvironment,
    },
    error::type_mismatch,
    lattice::Lattice,
    pretty_print::{BLUE, PrettyPrint},
    recursion::RecursionDepthBoundary,
};

// TODO: in the future we should support refinements
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum PrimitiveType {
    Number,
    Integer,
    String,
    Null,
    Boolean,
}

impl Lattice for PrimitiveType {
    fn join(
        self: Type<&Self>,
        other: Type<&Self>,
        _: &mut LatticeEnvironment,
    ) -> SmallVec<TypeId, 4> {
        if self.kind == other.kind {
            return SmallVec::from_slice(&[self.id]);
        }

        match (*self.kind, *other.kind) {
            // `integer <: number`
            (Self::Number, Self::Integer) => SmallVec::from_slice(&[self.id]),
            (Self::Integer, Self::Number) => SmallVec::from_slice(&[other.id]),

            _ => SmallVec::from_slice(&[self.id, other.id]),
        }
    }

    fn meet(
        self: Type<&Self>,
        other: Type<&Self>,
        _: &mut LatticeEnvironment,
    ) -> SmallVec<TypeId, 4> {
        if self.kind == other.kind {
            return SmallVec::from_slice(&[self.id]);
        }

        match (*self.kind, *other.kind) {
            // `integer <: number`
            (Self::Number, Self::Integer) => SmallVec::from_slice(&[other.id]),
            (Self::Integer, Self::Number) => SmallVec::from_slice(&[self.id]),

            _ => SmallVec::from_slice(&[self.id, other.id]),
        }
    }

    fn uninhabited(self: Type<&Self>, _: &mut TypeAnalysisEnvironment) -> bool {
        false
    }

    fn semantically_equivalent(
        self: Type<&Self>,
        other: Type<&Self>,
        _: &mut EquivalenceEnvironment,
    ) -> bool {
        self.kind == other.kind
    }

    fn unify(self: Type<&Self>, other: Type<&Self>, env: &mut UnificationEnvironment) {
        if self.kind == other.kind {
            return;
        }

        match (self.kind, other.kind) {
            // Handle the Integer <: Number subtyping relationship
            (Self::Number, Self::Integer) => {
                // In covariant context: Integer (rhs) is a subtype of Number (lhs).
                // This is valid - Integer can be used where Number is expected
            }

            (Self::Integer, Self::Number) => {
                // In covariant context: Number (rhs) is NOT a subtype of Integer (lhs)
                // This is an error - Number cannot be used where Integer is expected
                let diagnostic = type_mismatch(
                    env,
                    &self,
                    &other,
                    Some(
                        "Expected an Integer but found a Number. While all Integers are Numbers, \
                         not all Numbers are Integers (e.g., decimals like 3.14).",
                    ),
                );

                env.record_diagnostic(diagnostic);
            }

            _ => {
                // In covariant context: These primitive types have no subtyping relationship
                // Provide helpful conversion suggestions based on the specific type mismatch
                let help_message = match (self.kind, other.kind) {
                    (Self::Number | Self::Integer, Self::String) => Some(
                        "You can convert the number to a string using the \
                         `::core::number::to_string/1` or `::core::number::to_string/2` function",
                    ),
                    (Self::String, Self::Number | Self::Integer) => Some(
                        "You can convert the string to a number using the \
                         `::core::number::parse/1` or `::core::number::parse/2` function",
                    ),
                    (Self::Boolean, Self::String) => Some(
                        "You can convert the boolean to a string using the \
                         `::core::boolean::to_string/1` function",
                    ),
                    (Self::String, Self::Boolean) => Some(
                        "You can convert the string to a boolean using the \
                         `::core::boolean::parse/1` function",
                    ),
                    (Self::Boolean, Self::Number | Self::Integer) => Some(
                        "You can convert the boolean to a number using the \
                         `::core::number::from_boolean/1` function",
                    ),
                    (Self::Number | Self::Integer, Self::Boolean) => Some(
                        "You can convert the number to a boolean using the \
                         `::core::boolean::from_number/1` function",
                    ),
                    (Self::Null, _) | (_, Self::Null) => Some(
                        "Null cannot be combined with other types. Consider using optional types \
                         or a null check.",
                    ),
                    _ => None,
                };

                // Record a type mismatch diagnostic with helpful conversion suggestions
                let diagnostic = type_mismatch(env, &self, &other, help_message);
                env.record_diagnostic(diagnostic);
            }
        }
    }

    fn simplify(self: Type<&Self>, _: &mut SimplifyEnvironment) -> TypeId {
        self.id
    }
}

impl PrimitiveType {
    #[must_use]
    pub(crate) fn structurally_equivalent(self, other: Self) -> bool {
        self == other
    }

    const fn as_str(self) -> &'static str {
        match self {
            Self::Number => "Number",
            Self::Integer => "Integer",
            Self::String => "String",
            Self::Null => "Null",
            Self::Boolean => "Boolean",
        }
    }
}

impl PrettyPrint for PrimitiveType {
    fn pretty(
        &self,
        _: &impl Index<TypeId, Output = Type>,
        _: RecursionDepthBoundary,
    ) -> pretty::RcDoc<anstyle::Style> {
        RcDoc::text(self.as_str()).annotate(BLUE)
    }
}

/// Unifies primitive types
///
/// In a covariant context, this checks if `rhs` is a subtype of `lhs`.
/// For primitives, the main subtyping relationship is Integer <: Number
/// (Integer is a subtype of Number).
pub(crate) fn unify_primitive(
    env: &mut UnificationEnvironment,
    lhs: Type<PrimitiveType>,
    rhs: Type<PrimitiveType>,
) {
    unimplemented!("use Lattice::unify instead")
}

pub(crate) fn intersection_primitive(
    lhs: PrimitiveType,
    rhs: PrimitiveType,
) -> Option<PrimitiveType> {
    unimplemented!("use Latice::meet instead")
}

#[cfg(test)]
mod test {
    #![expect(clippy::min_ident_chars, clippy::needless_pass_by_value)]
    use hashql_diagnostics::help::Help;
    use test_case::test_case;

    use super::PrimitiveType;
    use crate::{
        arena::TransactionalArena,
        span::SpanId,
        r#type::{
            environment::{
                Environment, EquivalenceEnvironment, LatticeEnvironment, SimplifyEnvironment,
                TypeAnalysisEnvironment, UnificationEnvironment,
            },
            kind::TypeKind,
            lattice::{Lattice as _, test::assert_lattice_laws},
            test::instantiate,
        },
    };

    macro_rules! primitive {
        ($env:expr, $name:ident, $primitive:expr) => {
            let $name = instantiate(&mut $env, $primitive);
            let $name = $env.arena[$name].clone();
            let $name = $name.map(|kind| kind.as_primitive().expect("should be a primitive"));
            let $name = $name.as_ref();
        };
    }

    macro_rules! assert_kind {
        ($env:expr, $actual:expr, $expected:expr) => {
            assert_eq!($actual.len(), $expected.len());

            for (actual, expected) in $actual.into_iter().zip($expected.iter()) {
                let actual = &$env.arena[actual];
                assert_eq!(actual.kind, *expected);
            }
        };
    }

    #[test_case(TypeKind::Primitive(PrimitiveType::Number))]
    #[test_case(TypeKind::Primitive(PrimitiveType::Integer))]
    #[test_case(TypeKind::Primitive(PrimitiveType::String))]
    #[test_case(TypeKind::Primitive(PrimitiveType::Boolean))]
    #[test_case(TypeKind::Primitive(PrimitiveType::Null))]
    fn join_identical_primitives(primitive: TypeKind) {
        let mut env = Environment::new(SpanId::SYNTHETIC, TransactionalArena::new());

        primitive!(env, a, primitive.clone());
        primitive!(env, b, primitive.clone());

        let mut lattice_env = LatticeEnvironment::new(&mut env);

        let output = a.join(b, &mut lattice_env);
        assert_eq!(output.len(), 1);

        let id = output[0];
        let r#type = env.arena[id].clone();

        assert_eq!(r#type.kind, primitive);
    }

    #[test_case(TypeKind::Primitive(PrimitiveType::Number))]
    #[test_case(TypeKind::Primitive(PrimitiveType::Integer))]
    #[test_case(TypeKind::Primitive(PrimitiveType::String))]
    #[test_case(TypeKind::Primitive(PrimitiveType::Boolean))]
    #[test_case(TypeKind::Primitive(PrimitiveType::Null))]
    fn meet_identical_primitives(primitive: TypeKind) {
        let mut env = Environment::new(SpanId::SYNTHETIC, TransactionalArena::new());

        primitive!(env, a, primitive.clone());
        primitive!(env, b, primitive.clone());

        let mut lattice_env = LatticeEnvironment::new(&mut env);

        let output = a.meet(b, &mut lattice_env);
        assert_eq!(output.len(), 1);

        let id = output[0];
        let r#type = env.arena[id].clone();

        assert_eq!(r#type.kind, primitive);
    }

    #[test]
    fn join_integer_number_subtyping() {
        let mut env = Environment::new(SpanId::SYNTHETIC, TransactionalArena::new());

        primitive!(env, number, TypeKind::Primitive(PrimitiveType::Number));
        primitive!(env, integer, TypeKind::Primitive(PrimitiveType::Integer));

        let mut lattice_env = LatticeEnvironment::new(&mut env);

        // Number ⊔ Integer = Number
        assert_kind!(
            lattice_env,
            number.join(integer, &mut lattice_env),
            [TypeKind::Primitive(PrimitiveType::Number)]
        );

        // Integer ⊔ Number = Number
        assert_kind!(
            lattice_env,
            integer.join(number, &mut lattice_env),
            [TypeKind::Primitive(PrimitiveType::Number)]
        );
    }

    #[test]
    fn meet_integer_number_subtyping() {
        let mut env = Environment::new(SpanId::SYNTHETIC, TransactionalArena::new());

        primitive!(env, number, TypeKind::Primitive(PrimitiveType::Number));
        primitive!(env, integer, TypeKind::Primitive(PrimitiveType::Integer));

        let mut lattice_env = LatticeEnvironment::new(&mut env);

        // Number ⊓ Integer = Integer
        assert_kind!(
            lattice_env,
            number.meet(integer, &mut lattice_env),
            [TypeKind::Primitive(PrimitiveType::Integer)]
        );

        // Integer ⊓ Number = Integer
        assert_kind!(
            lattice_env,
            integer.meet(number, &mut lattice_env),
            [TypeKind::Primitive(PrimitiveType::Integer)]
        );
    }

    #[test]
    fn join_unrelated_primitives() {
        let mut env = Environment::new(SpanId::SYNTHETIC, TransactionalArena::new());

        primitive!(env, string, TypeKind::Primitive(PrimitiveType::String));
        primitive!(env, boolean, TypeKind::Primitive(PrimitiveType::Boolean));
        primitive!(env, null, TypeKind::Primitive(PrimitiveType::Null));

        let mut lattice_env = LatticeEnvironment::new(&mut env);

        // String ⊔ Boolean = String | Boolean
        assert_kind!(
            lattice_env,
            string.join(boolean, &mut lattice_env),
            [
                TypeKind::Primitive(PrimitiveType::String),
                TypeKind::Primitive(PrimitiveType::Boolean)
            ]
        );

        // Boolean ⊔ Null = Boolean | Null
        assert_kind!(
            lattice_env,
            boolean.join(null, &mut lattice_env),
            [
                TypeKind::Primitive(PrimitiveType::Boolean),
                TypeKind::Primitive(PrimitiveType::Null)
            ]
        );

        // String ⊔ Null = String | Null
        assert_kind!(
            lattice_env,
            string.join(null, &mut lattice_env),
            [
                TypeKind::Primitive(PrimitiveType::String),
                TypeKind::Primitive(PrimitiveType::Null)
            ]
        );
    }

    #[test]
    fn meet_unrelated_primitives() {
        let mut env = Environment::new(SpanId::SYNTHETIC, TransactionalArena::new());

        primitive!(env, string, TypeKind::Primitive(PrimitiveType::String));
        primitive!(env, boolean, TypeKind::Primitive(PrimitiveType::Boolean));
        primitive!(env, null, TypeKind::Primitive(PrimitiveType::Null));

        let mut lattice_env = LatticeEnvironment::new(&mut env);

        // String ⊓ Boolean = String & Boolean
        assert_kind!(
            lattice_env,
            string.meet(boolean, &mut lattice_env),
            [
                TypeKind::Primitive(PrimitiveType::String),
                TypeKind::Primitive(PrimitiveType::Boolean)
            ]
        );

        // Boolean ⊓ Null = Boolean & Null
        assert_kind!(
            lattice_env,
            boolean.meet(null, &mut lattice_env),
            [
                TypeKind::Primitive(PrimitiveType::Boolean),
                TypeKind::Primitive(PrimitiveType::Null)
            ]
        );

        // String ⊓ Null = String & Null
        assert_kind!(
            lattice_env,
            string.meet(null, &mut lattice_env),
            [
                TypeKind::Primitive(PrimitiveType::String),
                TypeKind::Primitive(PrimitiveType::Null)
            ]
        );
    }

    #[test]
    fn uninhabited() {
        let mut env = Environment::new(SpanId::SYNTHETIC, TransactionalArena::new());

        primitive!(env, number, TypeKind::Primitive(PrimitiveType::Number));
        primitive!(env, string, TypeKind::Primitive(PrimitiveType::String));
        primitive!(env, boolean, TypeKind::Primitive(PrimitiveType::Boolean));
        primitive!(env, null, TypeKind::Primitive(PrimitiveType::Null));
        primitive!(env, integer, TypeKind::Primitive(PrimitiveType::Integer));

        let mut analysis_env = TypeAnalysisEnvironment::new(&env);

        // No primitive types are uninhabited
        assert!(!number.uninhabited(&mut analysis_env));
        assert!(!string.uninhabited(&mut analysis_env));
        assert!(!boolean.uninhabited(&mut analysis_env));
        assert!(!null.uninhabited(&mut analysis_env));
        assert!(!integer.uninhabited(&mut analysis_env));
    }

    #[test]
    fn semantic_equivalence() {
        let mut env = Environment::new(SpanId::SYNTHETIC, TransactionalArena::new());

        primitive!(env, number, TypeKind::Primitive(PrimitiveType::Number));
        primitive!(env, number2, TypeKind::Primitive(PrimitiveType::Number)); // Second Number type
        primitive!(env, string, TypeKind::Primitive(PrimitiveType::String));
        primitive!(env, boolean, TypeKind::Primitive(PrimitiveType::Boolean));
        primitive!(env, null, TypeKind::Primitive(PrimitiveType::Null));
        primitive!(env, integer, TypeKind::Primitive(PrimitiveType::Integer));

        let mut equiv_env = EquivalenceEnvironment::new(&env);

        // Same primitive types should be equivalent
        assert!(number.semantically_equivalent(number2, &mut equiv_env));

        // Different primitive types should not be equivalent
        assert!(!number.semantically_equivalent(string, &mut equiv_env));
        assert!(!number.semantically_equivalent(boolean, &mut equiv_env));
        assert!(!number.semantically_equivalent(null, &mut equiv_env));
        assert!(!number.semantically_equivalent(integer, &mut equiv_env));
        assert!(!string.semantically_equivalent(boolean, &mut equiv_env));
    }

    #[test_case(TypeKind::Primitive(PrimitiveType::Number))]
    #[test_case(TypeKind::Primitive(PrimitiveType::Integer))]
    #[test_case(TypeKind::Primitive(PrimitiveType::String))]
    #[test_case(TypeKind::Primitive(PrimitiveType::Boolean))]
    #[test_case(TypeKind::Primitive(PrimitiveType::Null))]
    fn unification_same_type(primitive: TypeKind) {
        let mut env = Environment::new(SpanId::SYNTHETIC, TransactionalArena::new());

        primitive!(env, a, primitive.clone());
        primitive!(env, b, primitive);

        let mut unif_env = UnificationEnvironment::new(&mut env);

        // Unifying same types should succeed without errors
        a.unify(b, &mut unif_env);
        assert!(unif_env.take_diagnostics().is_empty());
    }

    #[test]
    fn unification_integer_number() {
        let mut env = Environment::new(SpanId::SYNTHETIC, TransactionalArena::new());

        primitive!(env, number, TypeKind::Primitive(PrimitiveType::Number));
        primitive!(env, integer, TypeKind::Primitive(PrimitiveType::Integer));

        let mut unif_env = UnificationEnvironment::new(&mut env);

        number.unify(integer, &mut unif_env);
        assert!(
            unif_env.take_diagnostics().is_empty(),
            "Number <-- Integer should succeed"
        );
    }

    #[test]
    fn unification_number_integer() {
        let mut env = Environment::new(SpanId::SYNTHETIC, TransactionalArena::new());

        primitive!(env, integer, TypeKind::Primitive(PrimitiveType::Integer));
        primitive!(env, number, TypeKind::Primitive(PrimitiveType::Number));

        let mut unif_env = UnificationEnvironment::new(&mut env);

        integer.unify(number, &mut unif_env);

        let diagnostics = unif_env.take_diagnostics();

        assert!(!diagnostics.is_empty(), "Integer <-- Number should fail");

        // Verify error contains helpful message
        let diagnostic = &diagnostics[0];
        assert_eq!(
            diagnostic.help.as_ref().map(Help::message),
            Some(
                "Expected an Integer but found a Number. While all Integers are Numbers, not all \
                 Numbers are Integers (e.g., decimals like 3.14)."
            )
        );
    }

    #[test_case(
        PrimitiveType::Number,
        PrimitiveType::String;
        "convert the number to a string"
    )]
    #[test_case(
        PrimitiveType::String,
        PrimitiveType::Number;
        "convert the string to a number"
    )]
    #[test_case(
        PrimitiveType::String,
        PrimitiveType::Boolean;
        "convert the string to a boolean"
    )]
    #[test_case(
        PrimitiveType::Boolean,
        PrimitiveType::String;
        "convert the boolean to a string"
    )]
    #[test_case(
        PrimitiveType::Boolean,
        PrimitiveType::Number;
        "convert the boolean to a number"
    )]
    #[test_case(
        PrimitiveType::Number,
        PrimitiveType::Boolean;
        "convert the number to a boolean"
    )]
    #[test_case(
        PrimitiveType::Null,
        PrimitiveType::String;
        "convert the null to a string"
    )]
    #[test_case(
        PrimitiveType::String,
        PrimitiveType::Null;
        "convert the string to a null"
    )]
    #[test_case(
        PrimitiveType::Null,
        PrimitiveType::Number;
        "convert the null to a number"
    )]
    #[test_case(
        PrimitiveType::Number,
        PrimitiveType::Null;
        "convert the number to a null"
    )]
    fn unification_unrelated_types(lhs: PrimitiveType, rhs: PrimitiveType) {
        let mut env = Environment::new(SpanId::SYNTHETIC, TransactionalArena::new());

        primitive!(env, lhs, TypeKind::Primitive(lhs));
        primitive!(env, rhs, TypeKind::Primitive(rhs));

        let mut unif_env = UnificationEnvironment::new(&mut env);

        lhs.unify(rhs, &mut unif_env);

        let diagnostics = unif_env.take_diagnostics();

        assert!(!diagnostics.is_empty(), "Unification should fail");
    }

    #[test_case(TypeKind::Primitive(PrimitiveType::Number))]
    #[test_case(TypeKind::Primitive(PrimitiveType::Integer))]
    #[test_case(TypeKind::Primitive(PrimitiveType::String))]
    #[test_case(TypeKind::Primitive(PrimitiveType::Boolean))]
    #[test_case(TypeKind::Primitive(PrimitiveType::Null))]
    fn simplify(primitive: TypeKind) {
        let mut env = Environment::new(SpanId::SYNTHETIC, TransactionalArena::new());

        primitive!(env, a, primitive.clone());

        let mut simplify_env = SimplifyEnvironment::new(&mut env);

        // Primitive types should simplify to themselves
        let result = a.simplify(&mut simplify_env);
        let result_type = &env.arena[result];

        assert_eq!(result_type.kind, primitive);
    }

    #[test]
    fn lattice_laws() {
        let mut env = Environment::new(SpanId::SYNTHETIC, TransactionalArena::new());

        primitive!(env, number, TypeKind::Primitive(PrimitiveType::Number));
        primitive!(env, string, TypeKind::Primitive(PrimitiveType::String));
        primitive!(env, boolean, TypeKind::Primitive(PrimitiveType::Boolean));

        assert_lattice_laws(
            &mut env,
            |r#type| {
                r#type.map(|kind| {
                    let TypeKind::Primitive(primitive) = kind else {
                        unreachable!()
                    };

                    primitive
                })
            },
            number.id,
            string.id,
            boolean.id,
        );
    }

    #[test]
    fn structurally_equivalent() {
        // Test the structurally_equivalent method directly
        assert!(PrimitiveType::Number.structurally_equivalent(PrimitiveType::Number));
        assert!(PrimitiveType::String.structurally_equivalent(PrimitiveType::String));
        assert!(PrimitiveType::Boolean.structurally_equivalent(PrimitiveType::Boolean));
        assert!(PrimitiveType::Null.structurally_equivalent(PrimitiveType::Null));
        assert!(PrimitiveType::Integer.structurally_equivalent(PrimitiveType::Integer));

        assert!(!PrimitiveType::Number.structurally_equivalent(PrimitiveType::String));
        assert!(!PrimitiveType::Number.structurally_equivalent(PrimitiveType::Integer));
        assert!(!PrimitiveType::String.structurally_equivalent(PrimitiveType::Boolean));
        assert!(!PrimitiveType::Null.structurally_equivalent(PrimitiveType::Boolean));
    }
}
