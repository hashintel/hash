use super::{Type, TypeId, environment::AnalysisEnvironment};

pub enum Constraint {}

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
