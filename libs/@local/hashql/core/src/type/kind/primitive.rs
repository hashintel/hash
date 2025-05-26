use core::ops::ControlFlow;

use pretty::RcDoc;
use smallvec::SmallVec;

use crate::{
    pretty::{BLUE, PrettyPrint, PrettyRecursionBoundary},
    symbol::Ident,
    r#type::{
        Type, TypeId,
        environment::{
            AnalysisEnvironment, Environment, InferenceEnvironment, LatticeEnvironment,
            SimplifyEnvironment, instantiate::InstantiateEnvironment,
        },
        error::{UnsupportedProjectionCategory, type_mismatch, unsupported_projection},
        inference::{Inference, PartialStructuralEdge},
        lattice::{Lattice, Projection},
    },
};

// TODO: in the future we should support refinements
#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum PrimitiveType {
    Number,
    Integer,
    String,
    Null,
    Boolean,
}

impl<'heap> Lattice<'heap> for PrimitiveType {
    fn join(
        self: Type<'heap, Self>,
        other: Type<'heap, Self>,
        _: &mut LatticeEnvironment<'_, 'heap>,
    ) -> SmallVec<TypeId, 4> {
        if self.kind == other.kind {
            return SmallVec::from_slice(&[self.id]);
        }

        match (*self.kind, *other.kind) {
            // `Integer <: Number`
            (Self::Number, Self::Integer) => SmallVec::from_slice(&[self.id]),
            (Self::Integer, Self::Number) => SmallVec::from_slice(&[other.id]),

            _ => SmallVec::from_slice(&[self.id, other.id]),
        }
    }

    fn meet(
        self: Type<'heap, Self>,
        other: Type<'heap, Self>,
        _: &mut LatticeEnvironment<'_, 'heap>,
    ) -> SmallVec<TypeId, 4> {
        if self.kind == other.kind {
            return SmallVec::from_slice(&[self.id]);
        }

        match (*self.kind, *other.kind) {
            // `Integer <: Number`
            (Self::Number, Self::Integer) => SmallVec::from_slice(&[other.id]),
            (Self::Integer, Self::Number) => SmallVec::from_slice(&[self.id]),

            _ => SmallVec::from_slice(&[self.id, other.id]),
        }
    }

    fn projection(
        self: Type<'heap, Self>,
        field: Ident<'heap>,
        env: &mut LatticeEnvironment<'_, 'heap>,
    ) -> Projection {
        env.diagnostics.push(unsupported_projection(
            self,
            field,
            UnsupportedProjectionCategory::Primitive,
            env,
        ));

        Projection::Error
    }

    fn is_bottom(self: Type<'heap, Self>, _: &mut AnalysisEnvironment<'_, 'heap>) -> bool {
        false
    }

    fn is_top(self: Type<'heap, Self>, _: &mut AnalysisEnvironment<'_, 'heap>) -> bool {
        false
    }

    fn is_concrete(self: Type<'heap, Self>, _: &mut AnalysisEnvironment<'_, 'heap>) -> bool {
        true
    }

    fn is_recursive(self: Type<'heap, Self>, _: &mut AnalysisEnvironment<'_, 'heap>) -> bool {
        false
    }

    fn distribute_union(
        self: Type<'heap, Self>,
        _: &mut AnalysisEnvironment<'_, 'heap>,
    ) -> SmallVec<TypeId, 16> {
        SmallVec::from_slice(&[self.id])
    }

    fn distribute_intersection(
        self: Type<'heap, Self>,
        _: &mut AnalysisEnvironment<'_, 'heap>,
    ) -> SmallVec<TypeId, 16> {
        SmallVec::from_slice(&[self.id])
    }

    fn is_subtype_of(
        self: Type<'heap, Self>,
        supertype: Type<'heap, Self>,
        env: &mut AnalysisEnvironment<'_, 'heap>,
    ) -> bool {
        // If types are identical, they are always subtypes of each other
        if self.kind == supertype.kind {
            return true;
        }

        // Handle known subtyping relationships
        match (*self.kind, *supertype.kind) {
            // `Integer <: Number`
            (Self::Integer, Self::Number) => true,
            (Self::Number, Self::Integer) => {
                let _: ControlFlow<()> = env.record_diagnostic(|env| {
                    type_mismatch(
                        env,
                        self,
                        supertype,
                        Some(
                            "Expected an Integer but found a Number. While all Integers are \
                             Numbers, not all Numbers are Integers (e.g., decimals like 3.14).",
                        ),
                    )
                });

                false
            }

            // No other subtyping relationships exist between primitive types
            _ => {
                let _: ControlFlow<()> = env.record_diagnostic(|env| {
                    // In covariant context: These primitive types have no subtyping relationship
                    // Provide helpful conversion suggestions based on the specific type mismatch
                    let help_message = match (self.kind, supertype.kind) {
                        (Self::Number | Self::Integer, Self::String) => Some(
                            "You can convert the number to a string using the \
                             `::core::number::to_string/1` or `::core::number::to_string/2` \
                             function",
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
                            "Null cannot be combined with other types. Consider using optional \
                             types or a null check.",
                        ),
                        _ => None,
                    };

                    // Record a type mismatch diagnostic with helpful conversion suggestions
                    type_mismatch(env, self, supertype, help_message)
                });

                false
            }
        }
    }

    fn is_equivalent(
        self: Type<'heap, Self>,
        other: Type<'heap, Self>,
        _: &mut AnalysisEnvironment<'_, 'heap>,
    ) -> bool {
        self.kind == other.kind
    }

    fn simplify(self: Type<'heap, Self>, _: &mut SimplifyEnvironment<'_, 'heap>) -> TypeId {
        self.id
    }
}

impl<'heap> Inference<'heap> for PrimitiveType {
    fn collect_constraints(
        self: Type<'heap, Self>,
        _: Type<'heap, Self>,
        _: &mut InferenceEnvironment<'_, 'heap>,
    ) {
    }

    fn collect_structural_edges(
        self: Type<'heap, Self>,
        _: PartialStructuralEdge,
        _: &mut InferenceEnvironment<'_, 'heap>,
    ) {
    }

    fn instantiate(self: Type<'heap, Self>, _: &mut InstantiateEnvironment<'_, 'heap>) -> TypeId {
        self.id
    }
}

impl PrimitiveType {
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

impl<'heap> PrettyPrint<'heap> for PrimitiveType {
    fn pretty(
        &self,
        _: &Environment<'heap>,
        _: &mut PrettyRecursionBoundary,
    ) -> RcDoc<'heap, anstyle::Style> {
        RcDoc::text(self.as_str()).annotate(BLUE)
    }
}

#[cfg(test)]
mod test {
    #![expect(clippy::min_ident_chars)]
    use test_case::test_case;

    use super::PrimitiveType;
    use crate::{
        heap::Heap,
        span::SpanId,
        r#type::{
            environment::{
                AnalysisEnvironment, Environment, LatticeEnvironment, SimplifyEnvironment,
            },
            kind::{
                TypeKind,
                test::{assert_kind, primitive},
            },
            lattice::{Lattice as _, test::assert_lattice_laws},
            test::instantiate,
        },
    };

    #[test_case(PrimitiveType::Number)]
    #[test_case(PrimitiveType::Integer)]
    #[test_case(PrimitiveType::String)]
    #[test_case(PrimitiveType::Boolean)]
    #[test_case(PrimitiveType::Null)]
    fn join_identical_primitives(primitive: PrimitiveType) {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        primitive!(env, a, primitive);
        primitive!(env, b, primitive);

        let mut lattice_env = LatticeEnvironment::new(&env);

        let output = a.join(b, &mut lattice_env);
        assert_eq!(output.len(), 1);

        let id = output[0];
        let r#type = env.r#type(id);

        assert_eq!(*r#type.kind, TypeKind::Primitive(primitive));
    }

    #[test_case(PrimitiveType::Number)]
    #[test_case(PrimitiveType::Integer)]
    #[test_case(PrimitiveType::String)]
    #[test_case(PrimitiveType::Boolean)]
    #[test_case(PrimitiveType::Null)]
    fn meet_identical_primitives(primitive: PrimitiveType) {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        primitive!(env, a, primitive);
        primitive!(env, b, primitive);

        let mut lattice_env = LatticeEnvironment::new(&env);

        let output = a.meet(b, &mut lattice_env);
        assert_eq!(output.len(), 1);

        let id = output[0];
        let r#type = env.r#type(id);

        assert_eq!(*r#type.kind, TypeKind::Primitive(primitive));
    }

    #[test]
    fn join_integer_number_subtyping() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        primitive!(env, number, PrimitiveType::Number);
        primitive!(env, integer, PrimitiveType::Integer);

        let mut lattice_env = LatticeEnvironment::new(&env);

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
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        primitive!(env, number, PrimitiveType::Number);
        primitive!(env, integer, PrimitiveType::Integer);

        let mut lattice_env = LatticeEnvironment::new(&env);

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
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        primitive!(env, string, PrimitiveType::String);
        primitive!(env, boolean, PrimitiveType::Boolean);
        primitive!(env, null, PrimitiveType::Null);

        let mut lattice_env = LatticeEnvironment::new(&env);

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
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        primitive!(env, string, PrimitiveType::String);
        primitive!(env, boolean, PrimitiveType::Boolean);
        primitive!(env, null, PrimitiveType::Null);

        let mut lattice_env = LatticeEnvironment::new(&env);

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
    fn bottom() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        primitive!(env, number, PrimitiveType::Number);
        primitive!(env, string, PrimitiveType::String);
        primitive!(env, boolean, PrimitiveType::Boolean);
        primitive!(env, null, PrimitiveType::Null);
        primitive!(env, integer, PrimitiveType::Integer);

        let mut analysis_env = AnalysisEnvironment::new(&env);

        // No primitive types are uninhabited
        assert!(!number.is_bottom(&mut analysis_env));
        assert!(!string.is_bottom(&mut analysis_env));
        assert!(!boolean.is_bottom(&mut analysis_env));
        assert!(!null.is_bottom(&mut analysis_env));
        assert!(!integer.is_bottom(&mut analysis_env));
    }

    #[test]
    fn top() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        primitive!(env, number, PrimitiveType::Number);
        primitive!(env, string, PrimitiveType::String);
        primitive!(env, boolean, PrimitiveType::Boolean);
        primitive!(env, null, PrimitiveType::Null);
        primitive!(env, integer, PrimitiveType::Integer);

        let mut analysis_env = AnalysisEnvironment::new(&env);

        // No primitive types are uninhabited
        assert!(!number.is_top(&mut analysis_env));
        assert!(!string.is_top(&mut analysis_env));
        assert!(!boolean.is_top(&mut analysis_env));
        assert!(!null.is_top(&mut analysis_env));
        assert!(!integer.is_top(&mut analysis_env));
    }

    #[test]
    fn equivalent() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        primitive!(env, number, PrimitiveType::Number);
        primitive!(env, number2, PrimitiveType::Number); // Second Number type
        primitive!(env, string, PrimitiveType::String);
        primitive!(env, boolean, PrimitiveType::Boolean);
        primitive!(env, null, PrimitiveType::Null);
        primitive!(env, integer, PrimitiveType::Integer);

        let mut analysis_env = AnalysisEnvironment::new(&env);

        // Same primitive types should be equivalent
        assert!(number.is_equivalent(number2, &mut analysis_env));

        // Different primitive types should not be equivalent
        assert!(!number.is_equivalent(string, &mut analysis_env));
        assert!(!number.is_equivalent(boolean, &mut analysis_env));
        assert!(!number.is_equivalent(null, &mut analysis_env));
        assert!(!number.is_equivalent(integer, &mut analysis_env));
        assert!(!string.is_equivalent(boolean, &mut analysis_env));
    }

    #[test]
    fn subtype_relationship() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        primitive!(env, number, PrimitiveType::Number);
        primitive!(env, integer, PrimitiveType::Integer);
        primitive!(env, string, PrimitiveType::String);
        primitive!(env, boolean, PrimitiveType::Boolean);
        primitive!(env, null, PrimitiveType::Null);

        let mut analysis_env = AnalysisEnvironment::new(&env);

        // Every type is a subtype of itself (reflexivity)
        assert!(number.is_subtype_of(number, &mut analysis_env));
        assert!(integer.is_subtype_of(integer, &mut analysis_env));
        assert!(string.is_subtype_of(string, &mut analysis_env));
        assert!(boolean.is_subtype_of(boolean, &mut analysis_env));
        assert!(null.is_subtype_of(null, &mut analysis_env));

        // Integer is a subtype of Number (Integer <: Number)
        assert!(integer.is_subtype_of(number, &mut analysis_env));

        // Number is not a subtype of Integer (!(Number <: Integer))
        assert!(!number.is_subtype_of(integer, &mut analysis_env));

        // No other subtyping relationships between primitive types
        assert!(!number.is_subtype_of(string, &mut analysis_env));
        assert!(!number.is_subtype_of(boolean, &mut analysis_env));
        assert!(!number.is_subtype_of(null, &mut analysis_env));

        assert!(!string.is_subtype_of(number, &mut analysis_env));
        assert!(!string.is_subtype_of(boolean, &mut analysis_env));
        assert!(!string.is_subtype_of(null, &mut analysis_env));

        assert!(!boolean.is_subtype_of(number, &mut analysis_env));
        assert!(!boolean.is_subtype_of(string, &mut analysis_env));
        assert!(!boolean.is_subtype_of(null, &mut analysis_env));

        assert!(!null.is_subtype_of(number, &mut analysis_env));
        assert!(!null.is_subtype_of(string, &mut analysis_env));
        assert!(!null.is_subtype_of(boolean, &mut analysis_env));
    }

    #[test_case(PrimitiveType::Number)]
    #[test_case(PrimitiveType::Integer)]
    #[test_case(PrimitiveType::String)]
    #[test_case(PrimitiveType::Boolean)]
    #[test_case(PrimitiveType::Null)]
    fn simplify(primitive: PrimitiveType) {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        primitive!(env, a, primitive);

        let mut simplify_env = SimplifyEnvironment::new(&env);

        // Primitive types should simplify to themselves
        let result = a.simplify(&mut simplify_env);
        let result_type = env.r#type(result);

        assert_eq!(*result_type.kind, TypeKind::Primitive(primitive));
    }

    #[test]
    fn lattice_laws() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        primitive!(env, number, PrimitiveType::Number);
        primitive!(env, string, PrimitiveType::String);
        primitive!(env, boolean, PrimitiveType::Boolean);

        assert_lattice_laws(&env, number.id, string.id, boolean.id);
    }

    #[test]
    fn is_concrete() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);
        let mut analysis_env = AnalysisEnvironment::new(&env);

        // All primitive types should be concrete
        primitive!(env, number, PrimitiveType::Number);
        primitive!(env, string, PrimitiveType::String);
        primitive!(env, boolean, PrimitiveType::Boolean);
        primitive!(env, null, PrimitiveType::Null);

        assert!(number.is_concrete(&mut analysis_env));
        assert!(string.is_concrete(&mut analysis_env));
        assert!(boolean.is_concrete(&mut analysis_env));
        assert!(null.is_concrete(&mut analysis_env));
    }
}
