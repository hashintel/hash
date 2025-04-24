use super::{
    Type, TypeId, environment::AnalysisEnvironment, kind::generic_argument::GenericArgumentId,
};

/// Represents an inference variable in the type system.
///
/// During type inference, the system works with both concrete types and variables that
/// need to be solved through constraint satisfaction. These variables can represent
/// either unknown types or generic parameters.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum Variable {
    /// A type variable that needs to be solved through constraint satisfaction.
    Type(TypeId),

    /// A generic argument variable, typically from a generic parameter.
    Generic(GenericArgumentId),
}

/// Represents a constraint between types in the type inference system.
///
/// During type checking, constraints are collected to determine if types are compatible
/// and to infer unknown types. These constraints form a system of equations that the
/// inference engine solves to determine concrete types for all variables.
///
/// The subtyping relation (`<:`) indicates that the left type is a subtype of the right type,
/// meaning the left type can be used wherever the right type is expected.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum Constraint {
    /// Constraints a variable with an upper bound (`variable <: bound`)
    UpperBound { variable: Variable, bound: TypeId },

    /// Constraints a variable with a lower bound (`bound <: variable`)
    LowerBound { variable: Variable, bound: TypeId },

    /// Constraints a variable to be equal to another type (`variable ≡ type`)
    Equals { variable: Variable, r#type: TypeId },

    /// Establishes an ordering between two variables (`lower <: upper`)
    Ordering { lower: Variable, upper: Variable },
}

/// A trait for types that can participate in type inference.
///
/// This trait defines operations specific to constraint-based type inference,
/// focusing on collecting constraints and creating fresh instances of polymorphic types.
pub trait Inference<'heap> {
    /// Collects constraints between this type and another during type inference.
    ///
    /// This method traverses both type structures in parallel, collecting constraints
    /// that must be satisfied for the types to be compatible. These constraints
    /// are then used to solve for unknown types in the program.
    fn collect_constraints(
        self: Type<'heap, Self>,
        other: Type<'heap, Self>,
        env: &mut AnalysisEnvironment<'_, 'heap>,
    );

    /// Creates a fresh instance of a polymorphic type with new inference variables.
    ///
    /// When a polymorphic type (like a generic function) is used in a specific context,
    /// this method creates a new version where all bound type variables are replaced
    /// with fresh inference variables.
    ///
    /// # Returns
    ///
    /// A new type ID representing the instantiated type.
    fn instantiate(self: Type<'heap, Self>, env: &mut AnalysisEnvironment<'_, 'heap>) -> TypeId;
}
