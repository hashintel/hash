use core::ops::ControlFlow;

use smallvec::SmallVec;

use crate::{
    symbol::Ident,
    r#type::{
        Type, TypeId,
        environment::{
            AnalysisEnvironment, InferenceEnvironment, LatticeEnvironment, SimplifyEnvironment,
            instantiate::InstantiateEnvironment,
        },
        error::{
            UnsupportedProjectionCategory, UnsupportedSubscriptCategory, type_mismatch,
            unsupported_projection, unsupported_subscript,
        },
        inference::Inference,
        lattice::{Lattice, Projection, Subscript},
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
            return SmallVec::from_slice_copy(&[self.id]);
        }

        match (*self.kind, *other.kind) {
            // `Integer <: Number`
            (Self::Number, Self::Integer) => SmallVec::from_slice_copy(&[self.id]),
            (Self::Integer, Self::Number) => SmallVec::from_slice_copy(&[other.id]),

            _ => SmallVec::from_slice_copy(&[self.id, other.id]),
        }
    }

    fn meet(
        self: Type<'heap, Self>,
        other: Type<'heap, Self>,
        _: &mut LatticeEnvironment<'_, 'heap>,
    ) -> SmallVec<TypeId, 4> {
        if self.kind == other.kind {
            return SmallVec::from_slice_copy(&[self.id]);
        }

        match (*self.kind, *other.kind) {
            // `Integer <: Number`
            (Self::Number, Self::Integer) => SmallVec::from_slice_copy(&[other.id]),
            (Self::Integer, Self::Number) => SmallVec::from_slice_copy(&[self.id]),

            _ => SmallVec::from_slice_copy(&[self.id, other.id]),
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

    fn subscript(
        self: Type<'heap, Self>,
        index: TypeId,
        env: &mut LatticeEnvironment<'_, 'heap>,
        _: &mut InferenceEnvironment<'_, 'heap>,
    ) -> Subscript {
        env.diagnostics.push(unsupported_subscript(
            self,
            index,
            UnsupportedSubscriptCategory::Primitive,
            env,
        ));

        Subscript::Error
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
        SmallVec::from_slice_copy(&[self.id])
    }

    fn distribute_intersection(
        self: Type<'heap, Self>,
        _: &mut AnalysisEnvironment<'_, 'heap>,
    ) -> SmallVec<TypeId, 16> {
        SmallVec::from_slice_copy(&[self.id])
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

    fn instantiate(self: Type<'heap, Self>, _: &mut InstantiateEnvironment<'_, 'heap>) -> TypeId {
        self.id
    }
}
