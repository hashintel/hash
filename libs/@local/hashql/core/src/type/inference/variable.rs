use alloc::rc::Rc;
use core::ops::Index;

use ena::unify::UnifyKey;

use crate::{
    span::SpanId,
    r#type::{
        collection::FastHashMap,
        kind::{Infer, Param, TypeKind, generic_argument::GenericArgumentId, infer::HoleId},
    },
};

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct Variable {
    pub span: SpanId,
    pub kind: VariableKind,
}

impl Variable {
    #[cfg(test)]
    pub(crate) const fn synthetic(kind: VariableKind) -> Self {
        Self {
            span: SpanId::SYNTHETIC,
            kind,
        }
    }
}

/// Represents an inference variable in the type system.
///
/// During type inference, the system works with both concrete types and variables that
/// need to be solved through constraint satisfaction. These variables can represent
/// either unknown types or generic parameters.
#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum VariableKind {
    /// A type variable that needs to be solved through constraint satisfaction.
    Hole(HoleId),

    /// A generic argument variable, typically from a generic parameter.
    Generic(GenericArgumentId),
}

impl VariableKind {
    #[must_use]
    pub const fn into_type_kind<'heap>(self) -> TypeKind<'heap> {
        match self {
            Self::Hole(hole) => TypeKind::Infer(Infer { hole }),
            Self::Generic(argument) => TypeKind::Param(Param { argument }),
        }
    }
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
pub(crate) struct VariableLookup(Rc<FastHashMap<VariableKind, VariableKind>>);

impl VariableLookup {
    pub(crate) fn new(lookup: FastHashMap<VariableKind, VariableKind>) -> Self {
        Self(Rc::new(lookup))
    }

    pub(crate) fn get(&self, key: VariableKind) -> Option<VariableKind> {
        self.0.get(&key).copied()
    }
}

impl Index<VariableKind> for VariableLookup {
    type Output = VariableKind;

    fn index(&self, index: VariableKind) -> &Self::Output {
        &self.0[&index]
    }
}
