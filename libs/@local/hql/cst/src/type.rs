use core::fmt::{self, Display, Write};

use hql_span::SpanId;

use crate::{Spanned, arena, expr::path::Path};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TypeKind<'arena> {
    Path(Path<'arena>),

    Union(arena::Box<'arena, [Type<'arena>]>),
    Intersection(arena::Box<'arena, [Type<'arena>]>),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Type<'arena> {
    pub kind: TypeKind<'arena>,
    pub span: SpanId,
}

impl Spanned for Type<'_> {
    fn span(&self) -> SpanId {
        self.span
    }
}

impl Display for TypeKind<'_> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Path(path) => Display::fmt(path, fmt),
            Self::Union(types) => {
                if types.len() > 1 {
                    fmt.write_char('(')?;
                }

                for (index, ty) in types.into_iter().enumerate() {
                    if index > 0 {
                        fmt.write_str(" | ")?;
                    }

                    Display::fmt(ty, fmt)?;
                }

                if types.len() > 1 {
                    fmt.write_char(')')?;
                }

                Ok(())
            }
            Self::Intersection(types) => {
                if types.len() > 1 {
                    fmt.write_char('(')?;
                }

                for (index, ty) in types.into_iter().enumerate() {
                    if index > 0 {
                        fmt.write_str(" & ")?;
                    }

                    Display::fmt(ty, fmt)?;
                }

                if types.len() > 1 {
                    fmt.write_char(')')?;
                }

                Ok(())
            }
        }
    }
}

impl Display for Type<'_> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        Display::fmt(&self.kind, fmt)
    }
}
