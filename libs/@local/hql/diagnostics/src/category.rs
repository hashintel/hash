use alloc::borrow::Cow;
use core::fmt::Display;

use crate::rob::RefOrBox;

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct Category<'a> {
    pub id: Cow<'a, str>,
    pub name: Cow<'a, str>,
    pub parent: Option<RefOrBox<'a, Category<'a>>>,
}

impl Category<'_> {
    #[must_use]
    pub fn canonical_id(&self) -> impl Display + '_ {
        struct DisplayCategoryId<'a, 'b>(&'a Category<'b>);

        impl<'a, 'b> Display for DisplayCategoryId<'a, 'b> {
            fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
                if let Some(parent) = &self.0.parent {
                    DisplayCategoryId(parent.as_ref()).fmt(f)?;
                    f.write_str("::")?;
                };

                Display::fmt(&self.0.id, f)
            }
        }

        DisplayCategoryId(self)
    }

    #[must_use]
    pub fn canonical_name(&self) -> impl Display + '_ {
        struct DisplayCategoryName<'a, 'b>(&'a Category<'b>);

        impl<'a, 'b> Display for DisplayCategoryName<'a, 'b> {
            fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
                if let Some(parent) = &self.0.parent {
                    DisplayCategoryName(parent.as_ref()).fmt(f)?;
                    f.write_str(" / ")?;
                }

                Display::fmt(&self.0.name, f)
            }
        }

        DisplayCategoryName(self)
    }
}
