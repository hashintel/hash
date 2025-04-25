use ena::unify::UnifyKey;

use crate::r#type::{
    collection::FastHashMap,
    kind::{generic_argument::GenericArgumentId, infer::HoleId},
};

/// Represents an inference variable in the type system.
///
/// During type inference, the system works with both concrete types and variables that
/// need to be solved through constraint satisfaction. These variables can represent
/// either unknown types or generic parameters.
#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum Variable {
    /// A type variable that needs to be solved through constraint satisfaction.
    Hole(HoleId),

    /// A generic argument variable, typically from a generic parameter.
    Generic(GenericArgumentId),
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub(crate) struct VariableId(u32);

impl VariableId {
    pub(crate) const fn into_usize(self) -> usize {
        self.0 as usize
    }
}

impl UnifyKey for VariableId {
    type Value = ();

    fn index(&self) -> u32 {
        self.0
    }

    #[expect(clippy::renamed_function_params)]
    fn from_index(index: u32) -> Self {
        Self(index)
    }

    fn tag() -> &'static str {
        "VariableId"
    }
}

pub(crate) struct VariableLookup(FastHashMap<Variable, Variable>);

impl VariableLookup {}
