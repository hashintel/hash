use alloc::rc::Rc;
use core::ops::Index;

use ena::unify::{NoError, UnifyKey, UnifyValue};

use crate::{
    collections::FastHashMap,
    span::SpanId,
    r#type::{
        PartialType, Type,
        environment::Environment,
        kind::{Infer, Param, TypeKind, generic::GenericArgumentId, infer::HoleId},
    },
};

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct Variable {
    pub span: SpanId,
    pub kind: VariableKind,
}

impl Variable {
    pub const fn synthetic(kind: VariableKind) -> Self {
        Self {
            span: SpanId::SYNTHETIC,
            kind,
        }
    }

    pub fn into_type<'heap>(self, env: &Environment<'heap>) -> Type<'heap> {
        let kind = self.kind.into_type_kind();

        env.types.intern_partial(PartialType {
            span: self.span,
            kind: env.intern_kind(kind),
        })
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub(crate) enum VariableProvenance {
    Hole,
    Generic,
}

/// Represents an inference variable in the type system.
///
/// During type inference, the system works with both concrete types and variables that
/// need to be solved through constraint satisfaction. These variables can represent
/// either unknown types or generic parameters.
#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, derive_more::From)]
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

    #[must_use]
    pub const fn hole(self) -> Option<HoleId> {
        match self {
            Self::Hole(hole) => Some(hole),
            Self::Generic(_) => None,
        }
    }

    #[must_use]
    pub const fn generic(self) -> Option<GenericArgumentId> {
        match self {
            Self::Hole(_) => None,
            Self::Generic(argument) => Some(argument),
        }
    }

    pub(crate) const fn provenance(self) -> VariableProvenance {
        match self {
            Self::Hole(_) => VariableProvenance::Hole,
            Self::Generic(_) => VariableProvenance::Generic,
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
    type Value = VariableProvenance;

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

impl UnifyValue for VariableProvenance {
    type Error = NoError;

    fn unify_values(value1: &Self, value2: &Self) -> Result<Self, Self::Error> {
        // Generic is "infectious" - if either variable is Generic, the result should be Generic
        // This ensures that if a Hole unifies with a Generic, we don't erroneously
        // report unconstrained type variable errors for generics.
        match (value1, value2) {
            (Self::Hole, Self::Hole) => Ok(Self::Hole),
            _ => Ok(Self::Generic),
        }
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
