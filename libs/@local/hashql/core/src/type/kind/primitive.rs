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
    use test_case::test_case;

    use super::PrimitiveType;
    use crate::{
        arena::TransactionalArena,
        span::SpanId,
        r#type::{
            environment::{Environment, LatticeEnvironment},
            kind::TypeKind,
            lattice::Lattice as _,
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

        assert_kind!(
            lattice_env,
            a.meet(b, &mut lattice_env),
            [primitive.clone()]
        );
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
        let mut env = Environment::new();
        let string_id = create_primitive(&mut env, PrimitiveType::String);
        let boolean_id = create_primitive(&mut env, PrimitiveType::Boolean);
        let null_id = create_primitive(&mut env, PrimitiveType::Null);

        let mut lattice_env = LatticeEnvironment::new(&mut env);

        // Join of unrelated types should return both types (union)
        let string = extract_primitive(&lattice_env, string_id);
        let boolean = extract_primitive(&lattice_env, boolean_id);
        let null = extract_primitive(&lattice_env, null_id);

        // String ⊔ Boolean = String | Boolean
        let result = string.join(boolean, &mut lattice_env);
        assert_eq!(result.len(), 2);
        assert!(result.contains(&string_id));
        assert!(result.contains(&boolean_id));

        // Boolean ⊔ Null = Boolean | Null
        let result = boolean.join(null, &mut lattice_env);
        assert_eq!(result.len(), 2);
        assert!(result.contains(&boolean_id));
        assert!(result.contains(&null_id));

        // String ⊔ Null = String | Null
        let result = string.join(null, &mut lattice_env);
        assert_eq!(result.len(), 2);
        assert!(result.contains(&string_id));
        assert!(result.contains(&null_id));
    }

    #[test]
    fn meet_unrelated_primitives() {
        let mut env = Environment::new();
        let string_id = create_primitive(&mut env, PrimitiveType::String);
        let boolean_id = create_primitive(&mut env, PrimitiveType::Boolean);
        let null_id = create_primitive(&mut env, PrimitiveType::Null);

        let mut lattice_env = LatticeEnvironment::new(&mut env);

        // Meet of unrelated types should return both types (intersection)
        let string = extract_primitive(&lattice_env, string_id);
        let boolean = extract_primitive(&lattice_env, boolean_id);
        let null = extract_primitive(&lattice_env, null_id);

        // String ⊓ Boolean = String & Boolean
        let result = string.meet(boolean, &mut lattice_env);
        assert_eq!(result.len(), 2);
        assert!(result.contains(&string_id));
        assert!(result.contains(&boolean_id));

        // Boolean ⊓ Null = Boolean & Null
        let result = boolean.meet(null, &mut lattice_env);
        assert_eq!(result.len(), 2);
        assert!(result.contains(&boolean_id));
        assert!(result.contains(&null_id));

        // String ⊓ Null = String & Null
        let result = string.meet(null, &mut lattice_env);
        assert_eq!(result.len(), 2);
        assert!(result.contains(&string_id));
        assert!(result.contains(&null_id));
    }

    #[test]
    fn uninhabited() {
        let mut env = Environment::new();
        let number_id = create_primitive(&mut env, PrimitiveType::Number);
        let string_id = create_primitive(&mut env, PrimitiveType::String);
        let boolean_id = create_primitive(&mut env, PrimitiveType::Boolean);
        let null_id = create_primitive(&mut env, PrimitiveType::Null);
        let integer_id = create_primitive(&mut env, PrimitiveType::Integer);

        let mut analysis_env = TypeAnalysisEnvironment::new(&mut env);

        // No primitive types are uninhabited
        for &id in &[number_id, string_id, boolean_id, null_id, integer_id] {
            let prim = extract_primitive(&analysis_env, id);
            assert!(!prim.uninhabited(&mut analysis_env));
        }
    }

    #[test]
    fn semantic_equivalence() {
        let mut env = Environment::new();
        let number_id = create_primitive(&mut env, PrimitiveType::Number);
        let number_id2 = create_primitive(&mut env, PrimitiveType::Number); // Second Number type
        let string_id = create_primitive(&mut env, PrimitiveType::String);
        let boolean_id = create_primitive(&mut env, PrimitiveType::Boolean);
        let null_id = create_primitive(&mut env, PrimitiveType::Null);
        let integer_id = create_primitive(&mut env, PrimitiveType::Integer);

        let mut equiv_env = EquivalenceEnvironment::new(&mut env);

        // Same primitive types should be equivalent
        let number = extract_primitive(&equiv_env, number_id);
        let number2 = extract_primitive(&equiv_env, number_id2);
        assert!(number.semantically_equivalent(number2, &mut equiv_env));

        // Different primitive types should not be equivalent
        let string = extract_primitive(&equiv_env, string_id);
        let boolean = extract_primitive(&equiv_env, boolean_id);
        let null = extract_primitive(&equiv_env, null_id);
        let integer = extract_primitive(&equiv_env, integer_id);

        assert!(!number.semantically_equivalent(string, &mut equiv_env));
        assert!(!number.semantically_equivalent(boolean, &mut equiv_env));
        assert!(!number.semantically_equivalent(null, &mut equiv_env));
        assert!(!number.semantically_equivalent(integer, &mut equiv_env));
        assert!(!string.semantically_equivalent(boolean, &mut equiv_env));
    }

    #[test]
    fn unification_same_type() {
        let mut env = Environment::new();
        let number_id = create_primitive(&mut env, PrimitiveType::Number);
        let string_id = create_primitive(&mut env, PrimitiveType::String);
        let boolean_id = create_primitive(&mut env, PrimitiveType::Boolean);
        let null_id = create_primitive(&mut env, PrimitiveType::Null);

        let mut unif_env = UnificationEnvironment::new(&mut env);

        // Unifying same types should succeed without errors
        for &id in &[number_id, string_id, boolean_id, null_id] {
            let prim = extract_primitive(&unif_env, id);
            prim.unify(prim, &mut unif_env);
            assert!(unif_env.diagnostics.is_empty());
        }
    }

    #[test]
    fn unification_integer_number() {
        let mut env = Environment::new();
        let number_id = create_primitive(&mut env, PrimitiveType::Number);
        let integer_id = create_primitive(&mut env, PrimitiveType::Integer);

        // Case 1: Number <-- Integer (should succeed)
        {
            let mut unif_env = UnificationEnvironment::new(&mut env);
            let number = extract_primitive(&unif_env, number_id);
            let integer = extract_primitive(&unif_env, integer_id);

            number.unify(integer, &mut unif_env);
            assert!(
                unif_env.diagnostics.is_empty(),
                "Number <-- Integer should succeed"
            );
        }

        // Case 2: Integer <-- Number (should fail)
        {
            let mut unif_env = UnificationEnvironment::new(&mut env);
            let integer = extract_primitive(&unif_env, integer_id);
            let number = extract_primitive(&unif_env, number_id);

            integer.unify(number, &mut unif_env);
            assert!(
                !unif_env.diagnostics.is_empty(),
                "Integer <-- Number should fail"
            );

            // Verify error contains helpful message
            let error = &unif_env.diagnostics[0];
            if let TypeErrorData::TypeMismatch {
                expected,
                found,
                help,
            } = &error.data
            {
                assert_eq!(expected.id, integer_id);
                assert_eq!(found.id, number_id);
                assert!(
                    help.as_ref()
                        .unwrap()
                        .contains("Expected an Integer but found a Number")
                );
            } else {
                panic!("Expected TypeMismatch error, got: {:?}", error);
            }
        }
    }

    #[test]
    fn unification_unrelated_types() {
        let mut env = Environment::new();
        let number_id = create_primitive(&mut env, PrimitiveType::Number);
        let string_id = create_primitive(&mut env, PrimitiveType::String);
        let boolean_id = create_primitive(&mut env, PrimitiveType::Boolean);
        let null_id = create_primitive(&mut env, PrimitiveType::Null);

        // Test unification failures with conversion suggestions
        let test_cases = [
            // (lhs, rhs, expected help message substring)
            (number_id, string_id, "convert the number to a string"),
            (string_id, number_id, "convert the string to a number"),
            (boolean_id, string_id, "convert the boolean to a string"),
            (string_id, boolean_id, "convert the string to a boolean"),
            (boolean_id, number_id, "convert the boolean to a number"),
            (number_id, boolean_id, "convert the number to a boolean"),
            (null_id, number_id, "Null cannot be combined"),
            (number_id, null_id, "Null cannot be combined"),
        ];

        for (lhs_id, rhs_id, expected_help) in test_cases {
            let mut unif_env = UnificationEnvironment::new(&mut env);
            let lhs = extract_primitive(&unif_env, lhs_id);
            let rhs = extract_primitive(&unif_env, rhs_id);

            lhs.unify(rhs, &mut unif_env);
            assert!(!unif_env.diagnostics.is_empty(), "Unification should fail");

            // Verify error contains helpful message
            let error = &unif_env.diagnostics[0];
            if let TypeErrorData::TypeMismatch {
                expected,
                found,
                help,
            } = &error.data
            {
                assert_eq!(expected.id, lhs_id);
                assert_eq!(found.id, rhs_id);
                assert!(
                    help.as_ref().unwrap().contains(expected_help),
                    "Expected help message to contain '{}', but got: {:?}",
                    expected_help,
                    help
                );
            } else {
                panic!("Expected TypeMismatch error, got: {:?}", error);
            }
        }
    }

    #[test]
    fn simplify() {
        let mut env = Environment::new();
        let number_id = create_primitive(&mut env, PrimitiveType::Number);
        let string_id = create_primitive(&mut env, PrimitiveType::String);
        let boolean_id = create_primitive(&mut env, PrimitiveType::Boolean);
        let null_id = create_primitive(&mut env, PrimitiveType::Null);
        let integer_id = create_primitive(&mut env, PrimitiveType::Integer);

        let mut simplify_env = SimplifyEnvironment::new(&mut env);

        // Primitive types should simplify to themselves
        for &id in &[number_id, string_id, boolean_id, null_id, integer_id] {
            let prim = extract_primitive(&simplify_env, id);
            let result = prim.simplify(&mut simplify_env);
            assert_eq!(result, id);
        }
    }

    #[test]
    fn lattice_laws() {
        let mut env = Environment::new();
        let number_id = create_primitive(&mut env, PrimitiveType::Number);
        let string_id = create_primitive(&mut env, PrimitiveType::String);
        let boolean_id = create_primitive(&mut env, PrimitiveType::Boolean);

        // Test that primitive types follow lattice laws
        assert_lattice_laws(&mut env, as_primitive, number_id, string_id, boolean_id);
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
