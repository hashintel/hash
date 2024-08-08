use core::fmt::{self, Display};

use crate::{arena, expr::path::Path};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Type<'arena> {
    Path(Path<'arena>),

    Union(arena::Box<'arena, [Type<'arena>]>),
    Intersection(arena::Box<'arena, [Type<'arena>]>),
}

impl Display for Type<'_> {
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
