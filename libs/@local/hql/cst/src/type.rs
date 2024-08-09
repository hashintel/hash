use core::fmt::{self, Display};

use hql_span::SpanId;

use crate::{arena, expr::path::Path, Spanned};

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
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Path(path) => Display::fmt(path, f),
            Self::Union(types) => {
                if types.len() > 1 {
                    f.write_str("(")?;
                }

                for (index, ty) in types.into_iter().enumerate() {
                    if index > 0 {
                        f.write_str(" | ")?;
                    }

                    Display::fmt(ty, f)?;
                }

                if types.len() > 1 {
                    f.write_str(")")?;
                }

                Ok(())
            }
            Self::Intersection(types) => {
                if types.len() > 1 {
                    f.write_str("(")?;
                }

                for (index, ty) in types.into_iter().enumerate() {
                    if index > 0 {
                        f.write_str(" & ")?;
                    }

                    Display::fmt(ty, f)?;
                }

                if types.len() > 1 {
                    f.write_str(")")?;
                }

                Ok(())
            }
        }
    }
}

impl Display for Type<'_> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        Display::fmt(&self.kind, f)
    }
}
