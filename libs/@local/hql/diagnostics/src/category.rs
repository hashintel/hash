use alloc::borrow::Cow;
use core::fmt::Display;

pub(crate) struct CanonicalDiagnosticCategoryId<C>(C);

impl<C> CanonicalDiagnosticCategoryId<C> {
    pub(crate) const fn new(category: C) -> Self {
        Self(category)
    }
}

impl<C> Display for CanonicalDiagnosticCategoryId<C>
where
    C: DiagnosticCategory,
{
    fn fmt(&self, fmt: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        Display::fmt(&self.0.id(), fmt)?;

        let mut child = self.0.subcategory();
        while let Some(category) = child {
            fmt.write_str("::")?;
            CanonicalDiagnosticCategoryId(category).fmt(fmt)?;

            child = category.subcategory();
        }

        Ok(())
    }
}

pub(crate) struct CanonicalDiagnosticCategoryName<C>(C);

impl<C> CanonicalDiagnosticCategoryName<C> {
    pub(crate) const fn new(category: C) -> Self {
        Self(category)
    }
}

impl<C> Display for CanonicalDiagnosticCategoryName<C>
where
    C: DiagnosticCategory,
{
    fn fmt(&self, fmt: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        Display::fmt(&self.0.name(), fmt)?;

        let mut child = self.0.subcategory();
        while let Some(category) = child {
            fmt.write_str(" / ")?;
            CanonicalDiagnosticCategoryName(category).fmt(fmt)?;

            child = category.subcategory();
        }

        Ok(())
    }
}

pub trait DiagnosticCategory {
    fn id(&self) -> Cow<'_, str>;
    fn name(&self) -> Cow<'_, str>;

    fn subcategory(&self) -> Option<&dyn DiagnosticCategory>;
}

impl DiagnosticCategory for &dyn DiagnosticCategory {
    fn id(&self) -> Cow<'_, str> {
        (**self).id()
    }

    fn name(&self) -> Cow<'_, str> {
        (**self).name()
    }

    fn subcategory(&self) -> Option<&dyn DiagnosticCategory> {
        (**self).subcategory()
    }
}

impl<C: DiagnosticCategory> DiagnosticCategory for &C {
    fn id(&self) -> Cow<'_, str> {
        (**self).id()
    }

    fn name(&self) -> Cow<'_, str> {
        (**self).name()
    }

    fn subcategory(&self) -> Option<&dyn DiagnosticCategory> {
        (**self).subcategory()
    }
}

/// A simple category implementation representing a terminal node in the category hierarchy.
///
/// Terminal categories represent the endpoints in a category hierarchy and have no subcategories.
/// They provide a lightweight way to create categories with static strings for both ID and name.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct TerminalDiagnosticCategory {
    /// The unique identifier for this category.
    pub id: &'static str,
    /// The human-readable name of this category.
    pub name: &'static str,
}

impl DiagnosticCategory for TerminalDiagnosticCategory {
    fn id(&self) -> Cow<'_, str> {
        Cow::Borrowed(self.id)
    }

    fn name(&self) -> Cow<'_, str> {
        Cow::Borrowed(self.name)
    }

    fn subcategory(&self) -> Option<&dyn DiagnosticCategory> {
        None
    }
}

#[cfg(test)]
mod tests {
    use alloc::string::ToString as _;
    use core::fmt::Debug;

    use super::*;

    trait DebugCategory: DiagnosticCategory + Debug {}
    impl<T: DiagnosticCategory + Debug> DebugCategory for T {}

    #[derive(Debug)]
    struct TestCategory {
        id: &'static str,
        name: &'static str,
        child: Option<Box<dyn DebugCategory>>,
    }

    impl DiagnosticCategory for TestCategory {
        fn id(&self) -> Cow<'_, str> {
            Cow::Borrowed(self.id)
        }

        fn name(&self) -> Cow<'_, str> {
            Cow::Borrowed(self.name)
        }

        fn subcategory(&self) -> Option<&dyn DiagnosticCategory> {
            self.child
                .as_deref()
                .map(|child| child as &dyn DiagnosticCategory)
        }
    }

    #[test]
    fn canonical_id_single_category() {
        let category = TestCategory {
            id: "parser",
            name: "Parser",
            child: None,
        };

        let canonical = CanonicalDiagnosticCategoryId::new(&category);
        assert_eq!(canonical.to_string(), "parser");
    }

    #[test]
    fn canonical_id_nested_categories() {
        let nested_category = TestCategory {
            id: "syntax",
            name: "Syntax",
            child: None,
        };

        let category = TestCategory {
            id: "parser",
            name: "Parser",
            child: Some(Box::new(nested_category)),
        };

        let canonical = CanonicalDiagnosticCategoryId::new(&category);
        assert_eq!(canonical.to_string(), "parser::syntax");
    }

    #[test]
    fn canonical_id_deeply_nested_categories() {
        let inner_category = TestCategory {
            id: "unexpected",
            name: "Unexpected Token",
            child: None,
        };

        let middle_category = TestCategory {
            id: "syntax",
            name: "Syntax",
            child: Some(Box::new(inner_category)),
        };

        let category = TestCategory {
            id: "parser",
            name: "Parser",
            child: Some(Box::new(middle_category)),
        };

        let canonical = CanonicalDiagnosticCategoryId::new(&category);
        assert_eq!(canonical.to_string(), "parser::syntax::unexpected");
    }

    #[test]
    fn canonical_name_single_category() {
        let category = TestCategory {
            id: "parser",
            name: "Parser",
            child: None,
        };

        let canonical = CanonicalDiagnosticCategoryName::new(&category);
        assert_eq!(canonical.to_string(), "Parser");
    }

    #[test]
    fn canonical_name_nested_categories() {
        let nested_category = TestCategory {
            id: "syntax",
            name: "Syntax",
            child: None,
        };

        let category = TestCategory {
            id: "parser",
            name: "Parser",
            child: Some(Box::new(nested_category)),
        };

        let canonical = CanonicalDiagnosticCategoryName::new(&category);
        assert_eq!(canonical.to_string(), "Parser / Syntax");
    }

    #[test]
    fn canonical_name_deeply_nested_categories() {
        let inner_category = TestCategory {
            id: "unexpected",
            name: "Unexpected Token",
            child: None,
        };

        let middle_category = TestCategory {
            id: "syntax",
            name: "Syntax",
            child: Some(Box::new(inner_category)),
        };

        let category = TestCategory {
            id: "parser",
            name: "Parser",
            child: Some(Box::new(middle_category)),
        };

        let canonical = CanonicalDiagnosticCategoryName::new(&category);
        assert_eq!(canonical.to_string(), "Parser / Syntax / Unexpected Token");
    }
}
