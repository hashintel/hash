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
                let mut category = Some(self.0);

                while let Some(current) = category {
                    Display::fmt(&current.id, f)?;

                    if current.parent.is_some() {
                        f.write_str("::")?;
                    }

                    category = current.parent;
                }

                Ok(())
            }
        }

        DisplayCategoryId(self)
    }

    #[must_use]
    pub fn canonical_name(&self) -> impl Display + '_ {
        struct DisplayCategoryName<'a>(&'a Category);

        impl<'a> Display for DisplayCategoryName<'a> {
            fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
                let mut category = Some(self.0);

                while let Some(current) = category {
                    Display::fmt(&current.name, f)?;

                    if current.parent.is_some() {
                        f.write_str(" / ")?;
                    }

                    category = current.parent;
                }

                Ok(())
            }
        }

        DisplayCategoryName(self)
    }
}
