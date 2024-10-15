use core::fmt::{self, Display, Write};

use hql_span::SpanId;

use super::ExprKind;
use crate::{Spanned, arena, symbol::Symbol, r#type::Type};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct List<'arena, T> {
    pub items: arena::Box<'arena, [T]>,
    pub span: SpanId,
}

impl<'arena, T> List<'arena, T> {
    #[must_use]
    pub const fn len(&self) -> usize {
        self.items.len()
    }

    #[must_use]
    pub const fn is_empty(&self) -> bool {
        self.items.is_empty()
    }

    pub fn iter(&self) -> impl Iterator<Item = &T> {
        self.items.iter()
    }
}

impl<T> Spanned for List<'_, T> {
    fn span(&self) -> SpanId {
        self.span
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Signature<'arena> {
    pub generics: List<'arena, Generic<'arena>>,
    pub arguments: List<'arena, Argument<'arena>>,
    pub r#return: Return<'arena>,

    pub span: SpanId,
}

impl Spanned for Signature<'_> {
    fn span(&self) -> SpanId {
        self.span
    }
}

impl Display for Signature<'_> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        if !self.generics.is_empty() {
            fmt.write_char('<')?;
            for (index, generic) in self.generics.iter().enumerate() {
                if index > 0 {
                    fmt.write_str(", ")?;
                }

                Display::fmt(generic, fmt)?;
            }
            fmt.write_char('>')?;
        }

        fmt.write_char('(')?;

        for (index, argument) in self.arguments.iter().enumerate() {
            if index > 0 {
                fmt.write_str(", ")?;
            }

            Display::fmt(argument, fmt)?;
        }

        fmt.write_str(") -> ")?;

        Display::fmt(&self.r#return, fmt)
    }
}

impl<'arena> From<Signature<'arena>> for ExprKind<'arena, '_> {
    fn from(signature: Signature<'arena>) -> Self {
        Self::Signature(signature)
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Generic<'arena> {
    pub name: Symbol,
    pub bound: Option<Type<'arena>>,

    pub span: SpanId,
}

impl Spanned for Generic<'_> {
    fn span(&self) -> SpanId {
        self.span
    }
}

impl Display for Generic<'_> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        Display::fmt(&self.name, fmt)?;

        if let Some(bound) = &self.bound {
            fmt.write_str(": ")?;
            Display::fmt(bound, fmt)
        } else {
            Ok(())
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Argument<'arena> {
    pub name: Symbol,
    pub r#type: Type<'arena>,

    pub span: SpanId,
}

impl Spanned for Argument<'_> {
    fn span(&self) -> SpanId {
        self.span
    }
}

impl Display for Argument<'_> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        Display::fmt(&self.name, fmt)?;
        fmt.write_str(": ")?;
        Display::fmt(&self.r#type, fmt)
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Return<'arena> {
    pub r#type: Type<'arena>,

    pub span: SpanId,
}

impl Spanned for Return<'_> {
    fn span(&self) -> SpanId {
        self.span
    }
}

impl Display for Return<'_> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        Display::fmt(&self.r#type, fmt)
    }
}
