// pub mod anonymous;
pub mod local;
pub mod qualified;

use core::fmt::{self, Display};

use hashql_core::{span::Spanned, r#type::TypeId};

pub use self::{local::LocalVariable, qualified::QualifiedVariable};
use crate::context::SymbolRegistry;

/// A variable reference node in the HashQL HIR.
///
/// Represents any reference to a named value, which could be a local binding,
/// module import, function parameter, or other named entity. Variables form the
/// basic building blocks for expressions, allowing previously computed values
/// to be referenced by name.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum Variable<'heap> {
    Local(LocalVariable<'heap>),
    Qualified(QualifiedVariable<'heap>),
}

impl<'heap> Variable<'heap> {
    #[must_use]
    pub fn name(&self, symbols: &SymbolRegistry<'heap>) -> impl Display {
        enum DisplayName<L, Q> {
            Local(L),
            Qualified(Q),
        }

        impl<L, Q> Display for DisplayName<L, Q>
        where
            L: Display,
            Q: Display,
        {
            fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
                match self {
                    Self::Local(local) => local.fmt(fmt),
                    Self::Qualified(qualified) => qualified.fmt(fmt),
                }
            }
        }

        match self {
            Self::Local(local) => DisplayName::Local(local.name(symbols)),
            Self::Qualified(qualified) => DisplayName::Qualified(qualified.name()),
        }
    }

    #[must_use]
    pub const fn arguments(&self) -> &'heap [Spanned<TypeId>] {
        match self {
            Self::Local(local) => local.arguments.0,
            Self::Qualified(qualified) => qualified.arguments.0,
        }
    }

    /// Transfer the arguments from one variable to another.
    pub const fn set_arguments_from(&mut self, donor: &Self) {
        let target = match self {
            Self::Local(local_variable) => &mut local_variable.arguments,
            Self::Qualified(qualified_variable) => &mut qualified_variable.arguments,
        };

        let source = match donor {
            Self::Local(local_variable) => local_variable.arguments,
            Self::Qualified(qualified_variable) => qualified_variable.arguments,
        };

        *target = source;
    }
}
