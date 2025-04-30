pub(crate) mod solver;
mod variable;

pub(crate) use self::variable::VariableLookup;
pub use self::{
    solver::InferenceSolver,
    variable::{Variable, VariableKind},
};
use super::{
    Type, TypeId,
    environment::{InferenceEnvironment, instantiate::InstantiateEnvironment},
    kind::{generic_argument::GenericArgumentId, infer::HoleId},
};
use crate::collection::FastHashMap;

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum PartialStructuralEdge {
    Source(Variable),
    Target(Variable),
}

impl PartialStructuralEdge {
    #[must_use]
    pub const fn invert(self) -> Self {
        match self {
            Self::Source(variable) => Self::Target(variable),
            Self::Target(variable) => Self::Source(variable),
        }
    }

    #[must_use]
    pub const fn is_source(&self) -> bool {
        matches!(self, Self::Source(_))
    }

    #[must_use]
    pub const fn is_target(&self) -> bool {
        matches!(self, Self::Target(_))
    }
}

/// Represents a constraint between types in the type inference system.
///
/// During type checking, constraints are collected to determine if types are compatible
/// and to infer unknown types. These constraints form a system of equations that the
/// inference engine solves to determine concrete types for all variables.
///
/// The subtyping relation (`<:`) indicates that the left type is a subtype of the right type,
/// meaning the left type can be used wherever the right type is expected.
#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum Constraint {
    /// Constraints a variable with an upper bound (`variable <: bound`)
    UpperBound { variable: Variable, bound: TypeId },

    /// Constraints a variable with a lower bound (`bound <: variable`)
    LowerBound { variable: Variable, bound: TypeId },

    /// Constraints a variable to be equal to another type (`variable ≡ type`)
    Equals { variable: Variable, r#type: TypeId },

    /// Establishes an ordering between two variables (`lower <: upper`)
    Ordering { lower: Variable, upper: Variable },

    /// Establishes a structural edge between two variables (`source -> target`)
    ///
    /// A structural edge is an edge, which explains that `source` flows into `target`, for example
    /// given: `_1 <: (name: _2)`, `_1` flows into `_2`.
    StructuralEdge { source: Variable, target: Variable },
}

impl Constraint {
    pub(crate) fn variables(self) -> impl IntoIterator<Item = Variable> {
        let array = match self {
            Self::LowerBound { variable, bound: _ }
            | Self::UpperBound { variable, bound: _ }
            | Self::Equals {
                variable,
                r#type: _,
            } => [Some(variable), None],
            Self::Ordering { lower, upper } => [Some(lower), Some(upper)],
            Self::StructuralEdge { source, target } => [Some(source), Some(target)],
        };

        array.into_iter().flatten()
    }
}

#[derive(Debug, Clone, Default)]
pub struct Substitution {
    variables: VariableLookup,
    substitutions: FastHashMap<VariableKind, TypeId>,
}

impl Substitution {
    #[must_use]
    pub(crate) const fn new(
        variables: VariableLookup,
        substitutions: FastHashMap<VariableKind, TypeId>,
    ) -> Self {
        Self {
            variables,
            substitutions,
        }
    }

    pub(crate) fn insert(&mut self, key: VariableKind, value: TypeId) {
        self.substitutions.insert(key, value);
    }

    pub(crate) fn contains(&self, kind: VariableKind) -> bool {
        self.substitutions.contains_key(&kind)
    }

    #[must_use]
    pub fn argument(&self, id: GenericArgumentId) -> Option<TypeId> {
        let root = self.variables.get(VariableKind::Generic(id))?;

        self.substitutions.get(&root).copied()
    }

    #[must_use]
    pub fn infer(&self, id: HoleId) -> Option<TypeId> {
        let root = self.variables.get(VariableKind::Hole(id))?;

        self.substitutions.get(&root).copied()
    }
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
        supertype: Type<'heap, Self>,
        env: &mut InferenceEnvironment<'_, 'heap>,
    );

    /// Collects structural edges between this type and inference variables.
    ///
    /// This method tracks the propagation of type information through structural
    /// relationships in types. It establishes directed flow connections between
    /// types and their constituent parts, allowing the inference engine to
    /// understand how type information should flow through complex nested structures.
    ///
    /// For example, when processing a record type with fields, this method would
    /// track the relationship between the record variable and its field variables,
    /// creating appropriate edges to represent these structural dependencies.
    ///
    /// The `variable` parameter specifies whether this type is the source or target
    /// of the structural relationship, determining the direction of type flow during
    /// inference.
    fn collect_structural_edges(
        self: Type<'heap, Self>,
        variable: PartialStructuralEdge,
        env: &mut InferenceEnvironment<'_, 'heap>,
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
    fn instantiate(self: Type<'heap, Self>, env: &mut InstantiateEnvironment<'_, 'heap>) -> TypeId;
}
