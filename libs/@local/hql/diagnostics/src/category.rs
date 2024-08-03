use core::fmt::Display;

use ariadne::Color;

pub struct Severity {
    id: &'static str,
    name: &'static str,

    priority: i32,

    color: Color,
}

impl Severity {
    pub const CRITICAL: Self = Self {
        id: "critical",
        name: "Critical",
        priority: 0,

        color: Color::Red,
    };
    pub const ERROR: Self = Self {
        id: "error",
        name: "Error",
        priority: 1,

        color: Color::Red,
    };
    pub const WARNING: Self = Self {
        id: "warning",
        name: "Warning",
        priority: 2,

        color: Color::Yellow,
    };
}

impl Severity {
    pub const ADVICE: Self = Self {
        id: "note",
        name: "Note",
        priority: 400,

        color: Color::Fixed(147),
    };
}

impl Severity {
    #[must_use]
    pub const fn id(&self) -> &str {
        self.id
    }

    #[must_use]
    pub const fn name(&self) -> &str {
        self.name
    }

    #[must_use]
    pub const fn code(&self) -> i32 {
        self.priority
    }
}

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
