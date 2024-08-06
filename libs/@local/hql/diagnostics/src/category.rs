use core::fmt::Display;

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
#[cfg_attr(feature = "serde", derive(serde::Serialize))]
pub struct Category {
    pub id: &'static str,
    pub name: &'static str,
    pub parent: Option<&'static Category>,
}

impl Category {
    #[must_use]
    pub fn canonical_id(&self) -> impl Display + '_ {
        struct DisplayCategoryId<'a>(&'a Category);

        impl<'a> Display for DisplayCategoryId<'a> {
            fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
                if let Some(parent) = self.0.parent {
                    DisplayCategoryId(parent).fmt(f)?;
                    f.write_str("::")?;
                };
                Display::fmt(&self.0.id, f)
            }
        }

        DisplayCategoryId(self)
    }

    #[must_use]
    pub fn canonical_name(&self) -> impl Display + '_ {
        struct DisplayCategoryName<'a>(&'a Category);

        impl<'a> Display for DisplayCategoryName<'a> {
            fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
                if let Some(parent) = self.0.parent {
                    DisplayCategoryName(parent).fmt(f)?;
                    f.write_str(" / ")?;
                }
                Display::fmt(&self.0.name, f)
            }
        }

        DisplayCategoryName(self)
    }
}
