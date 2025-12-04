pub(crate) mod solver;
mod variable;
mod visit;

pub use self::{
    solver::InferenceSolver,
    variable::{Variable, VariableKind},
    visit::VariableCollector,
};
pub(crate) use self::{variable::VariableLookup, visit::VariableDependencyCollector};
use super::{
    Type, TypeId,
    environment::{Environment, InferenceEnvironment, instantiate::InstantiateEnvironment},
    kind::{generic::GenericArgumentId, infer::HoleId},
};
use crate::{collections::FastHashMap, symbol::Ident};

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum Subject {
    Variable(Variable),
    Type(TypeId),
}

impl Subject {
    const fn variable(self) -> Option<Variable> {
        match self {
            Self::Variable(variable) => Some(variable),
            Self::Type(_) => None,
        }
    }

    fn specialize(&mut self, env: &Environment) {
        let Self::Type(id) = *self else { return };

        let r#type = env.r#type(id);

        let Some(kind) = r#type.kind.into_variable() else {
            // There's nothing we can specialize, because it's not a variable
            return;
        };

        *self = Self::Variable(Variable {
            span: r#type.span,
            kind,
        });
    }

    pub(crate) fn r#type<'heap>(self, env: &Environment<'heap>) -> Type<'heap> {
        match self {
            Self::Type(id) => env.r#type(id),
            Self::Variable(variable) => variable.into_type(env),
        }
    }
}

/// Controls how selection constraints are resolved during type inference.
///
/// Selection constraints arise from field projections and subscript operations where
/// the result type must be inferred. This strategy determines the trade-off between
/// type precision and resolution capability when attempting to resolve constraints.
#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, Default)]
pub enum ResolutionStrategy {
    /// Simplify types before attempting resolution.
    ///
    /// This strategy removes unnecessary complexity from types (like unused union
    /// variants) to improve the chances of successful constraint resolution. While
    /// this trades some type precision for resolution capability, it can resolve
    /// constraints that would otherwise remain stuck.
    Simplify,

    /// Preserve original type structure during resolution.
    ///
    /// This is the default strategy that maintains the full precision of type
    /// information during constraint resolution. It keeps all type details intact,
    /// allowing for more accurate inference but potentially failing to resolve
    /// constraints that could succeed with simplified types.
    #[default]
    Preserve,
}

impl ResolutionStrategy {
    /// Degenerates the resolution strategy to trade precision for resolution capability.
    ///
    /// This method implements a fallback mechanism used when constraint resolution
    /// encounters errors. If the current strategy is `Preserve`, it degenerates to
    /// `Simplify` and returns `true`, indicating that the constraint should be retried
    /// with the more aggressive strategy. If already `Simplify`, returns `false`
    /// indicating no further fallback options exist.
    ///
    /// This progressive degradation allows the inference engine to first attempt
    /// precise resolution, then fall back to simplified resolution when necessary.
    ///
    /// # Returns
    ///
    /// `true` if the strategy was degenerated and retry is warranted, `false` otherwise.
    pub const fn degenerate(&mut self) -> bool {
        match self {
            Self::Preserve => {
                *self = Self::Simplify;
                true
            }
            Self::Simplify => false,
        }
    }
}

/// Tracks how many times resolution of a selection constraint has been deferred.
///
/// During constraint-based type inference, selection constraints may need to be
/// deferred multiple times until sufficient type information becomes available.
/// This depth counter serves several critical functions:
///
/// - **Progress tracking**: Helps detect when the inference engine is making forward progress.
/// - **Loop prevention**: Guards against infinite constraint generation on repeated attempts.
/// - **Error reporting**: Provides context for unresolved constraints in diagnostics.
/// - **Constraint management**: Controls when new sub-constraints can be generated.
///
/// The inference engine uses a depth of zero as a special marker for first-time resolution
/// attempts, during which new constraints may be generated. Subsequent attempts (depth > 0) focus
/// purely on resolution without generating additional constraints, preventing infinite loops.
#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, Default)]
pub struct DeferralDepth(usize);

impl DeferralDepth {
    /// Creates a new deferral depth one level deeper.
    ///
    /// This method is called each time a selection constraint cannot be resolved
    /// and must be placed back in the constraint queue for the next iteration.
    /// The incremented depth helps track how many resolution attempts have been
    /// made and prevents infinite constraint generation.
    #[must_use]
    pub const fn increment(self) -> Self {
        Self(self.0 + 1)
    }

    /// Checks if this is a first-time resolution attempt.
    ///
    /// Returns `true` if the deferral depth is zero, indicating this constraint
    /// has never been deferred before. The inference engine uses this as a guard
    /// to allow new constraint generation only on first attempts, preventing
    /// infinite loops during subscript resolution.
    #[must_use]
    pub const fn is_zero(self) -> bool {
        self.0 == 0
    }

    /// Returns the raw deferral depth value.
    ///
    /// This provides access to the underlying depth counter, which can be useful
    /// for debugging constraint resolution patterns, implementing deferral limits,
    /// or providing detailed error diagnostics about constraint resolution attempts.
    #[must_use]
    pub const fn depth(self) -> usize {
        self.0
    }
}

/// Represents constraints for component selection operations in type inference.
///
/// Selection constraints arise from field projection (`record.field`) and subscript
/// operations (`array[index]`) where the type of the selected component must be
/// inferred. These constraints defer the resolution of the selection operation
/// until sufficient type information is available.
///
/// The constraint specifies that given a source (variable or concrete type) and
/// a selection operation (field label or index), the result type should be
/// unified with the specified output variable.
#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum SelectionConstraint<'heap> {
    /// Field projection constraint (`source.label`).
    ///
    /// This constraint represents accessing a field from either an inference variable
    /// or a concrete type. When the source is a variable, the constraint will be
    /// resolved once the variable's type is known to have the specified field.
    /// When the source is a concrete type, the constraint can typically be resolved
    /// immediately if the type structure is known.
    Projection {
        subject: Subject,
        field: Ident<'heap>,
        output: Variable,
    },

    /// Subscript operation constraint (`source[index]`).
    ///
    /// This constraint represents indexing into either an inference variable or
    /// a concrete type. When the source is a variable, the constraint will be
    /// resolved once the variable's type is known to support indexing with the
    /// given index type. When the source is a concrete type, the constraint can
    /// typically be resolved immediately if the type structure supports indexing.
    Subscript {
        subject: Subject,
        index: Subject,
        output: Variable,
    },
}

impl<'heap> SelectionConstraint<'heap> {
    fn subjects_mut(&mut self) -> impl Iterator<Item = &mut Subject> {
        match self {
            SelectionConstraint::Projection {
                subject,
                field: _,
                output: _,
            } => [Some(subject), None],
            SelectionConstraint::Subscript {
                subject,
                index,
                output: _,
            } => [Some(subject), Some(index)],
        }
        .into_iter()
        .flatten()
    }

    fn specialize(&mut self, env: &Environment<'heap>) {
        for subject in self.subjects_mut() {
            subject.specialize(env);
        }
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
pub enum Constraint<'heap> {
    /// Unifies two variables (`lhs ≡ rhs`).
    Unify { lhs: Variable, rhs: Variable },

    /// Constraints a variable with an upper bound (`variable <: bound`).
    UpperBound { variable: Variable, bound: TypeId },

    /// Constraints a variable with a lower bound (`bound <: variable`).
    LowerBound { variable: Variable, bound: TypeId },

    /// Constraints a variable to be equal to another type (`variable ≡ type`).
    Equals { variable: Variable, r#type: TypeId },

    /// Establishes an ordering between two variables (`lower <: upper`).
    Ordering { lower: Variable, upper: Variable },

    /// Establishes a structural edge between two variables (`source -> target`).
    ///
    /// A structural edge is an edge, which explains that `source` flows into `target`, for example
    /// given: `_1 <: (name: _2)`, `_1` flows into `_2`.
    Dependency { source: Variable, target: Variable },

    /// Constraints for component selection operations (`subject.field` or `subject[index]`).
    ///
    /// Selection constraints handle field projection and subscript operations where the
    /// result type must be inferred. These constraints are deferred until sufficient
    /// type information is available to resolve the selection operation.
    Selection(
        SelectionConstraint<'heap>,
        ResolutionStrategy,
        DeferralDepth,
    ),
}

impl Constraint<'_> {
    pub(crate) fn variables(self) -> impl IntoIterator<Item = Variable> {
        let array = match self {
            Self::Unify { lhs, rhs } => [Some(lhs), Some(rhs), None],
            Self::LowerBound { variable, bound: _ }
            | Self::UpperBound { variable, bound: _ }
            | Self::Equals {
                variable,
                r#type: _,
            } => [Some(variable), None, None],
            Self::Ordering { lower, upper } => [Some(lower), Some(upper), None],
            Self::Dependency { source, target } => [Some(source), Some(target), None],
            Self::Selection(
                SelectionConstraint::Projection {
                    subject,
                    field: _,
                    output,
                },
                _,
                _,
            ) => [subject.variable(), Some(output), None],
            Self::Selection(
                SelectionConstraint::Subscript {
                    subject,
                    index,
                    output,
                },
                _,
                _,
            ) => [subject.variable(), index.variable(), Some(output)],
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
        let root = self.variables[key];

        self.substitutions.insert(root, value);
    }

    pub(crate) fn contains(&self, kind: VariableKind) -> bool {
        let Some(root) = self.variables.get(kind) else {
            return false;
        };

        self.substitutions.contains_key(&root)
    }

    #[must_use]
    pub fn representative(&self, kind: VariableKind) -> VariableKind {
        self.variables[kind]
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
