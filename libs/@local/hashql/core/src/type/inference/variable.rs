use alloc::rc::Rc;
use core::ops::Index;

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

#[derive(Debug, Clone, Default)]
pub(crate) struct VariableLookup(Rc<FastHashMap<Variable, Variable>>);

impl VariableLookup {
    pub(crate) fn new(lookup: FastHashMap<Variable, Variable>) -> Self {
        Self(Rc::new(lookup))
    }

    pub(crate) fn get(&self, key: Variable) -> Option<Variable> {
        self.0.get(&key).copied()
    }
}

impl Index<Variable> for VariableLookup {
    type Output = Variable;

    fn index(&self, index: Variable) -> &Self::Output {
        &self.0[&index]
    }
}
