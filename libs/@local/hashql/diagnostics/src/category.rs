use alloc::borrow::Cow;
use core::fmt::Display;

pub(crate) struct CanonicalDiagnosticCategoryId<C>(C);

impl<C> CanonicalDiagnosticCategoryId<C> {
    #[cfg(feature = "render")]
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
            fmt.write_str(&category.id())?;

            child = category.subcategory();
        }

        Ok(())
    }
}

pub fn canonical_category_id<C>(category: &C) -> impl Display
where
    C: DiagnosticCategory,
{
    CanonicalDiagnosticCategoryId(category)
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
            fmt.write_str(&category.name())?;

            child = category.subcategory();
        }

        Ok(())
    }
}

pub fn canonical_category_name<C>(category: &C) -> impl Display
where
    C: DiagnosticCategory,
{
    CanonicalDiagnosticCategoryName(category)
}

#[cfg(feature = "render")]
pub(crate) fn category_display_name(mut category: &dyn DiagnosticCategory) -> Cow<'_, str> {
    while let Some(child) = category.subcategory() {
        category = child;
    }

    category.name()
}

pub trait DiagnosticCategory {
    fn id(&self) -> Cow<'_, str>;
    fn name(&self) -> Cow<'_, str>;

    fn subcategory(&self) -> Option<&dyn DiagnosticCategory>;

    fn is_category_equivalent(&self, other: &dyn DiagnosticCategory) -> bool {
        if self.id() != other.id() {
            return false;
        }

        let self_child = self.subcategory();
        let other_child = other.subcategory();

        match (self_child, other_child) {
            (Some(self_child), Some(other_child)) => self_child.is_category_equivalent(other_child),
            (None, None) => true,
            _ => false,
        }
    }
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

impl<C: DiagnosticCategory + ?Sized> DiagnosticCategory for Box<C> {
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
    #[cfg(feature = "render")]
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
    #[cfg(feature = "render")]
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
    #[cfg(feature = "render")]
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

    #[test]
    fn is_category_equivalent_identical_categories() {
        let category1 = TestCategory {
            id: "parser",
            name: "Parser",
            child: None,
        };

        let category2 = TestCategory {
            id: "parser",
            name: "Different Name", // Names don't matter for matching
            child: None,
        };

        assert!(category1.is_category_equivalent(&category2));
    }

    #[test]
    fn is_category_equivalent_different_categories() {
        let category1 = TestCategory {
            id: "parser",
            name: "Parser",
            child: None,
        };

        let category2 = TestCategory {
            id: "lexer",
            name: "Lexer",
            child: None,
        };

        assert!(!category1.is_category_equivalent(&category2));
    }

    #[test]
    fn is_category_equivalent_nested_categories_identical() {
        let nested_category1 = TestCategory {
            id: "syntax",
            name: "Syntax",
            child: None,
        };

        let category1 = TestCategory {
            id: "parser",
            name: "Parser",
            child: Some(Box::new(nested_category1)),
        };

        let nested_category2 = TestCategory {
            id: "syntax",
            name: "Syntax Error", // Different name shouldn't matter
            child: None,
        };

        let category2 = TestCategory {
            id: "parser",
            name: "Parser Module", // Different name shouldn't matter
            child: Some(Box::new(nested_category2)),
        };

        assert!(category1.is_category_equivalent(&category2));
    }

    #[test]
    fn is_category_equivalent_nested_categories_different() {
        let nested_category1 = TestCategory {
            id: "syntax",
            name: "Syntax",
            child: None,
        };

        let category1 = TestCategory {
            id: "parser",
            name: "Parser",
            child: Some(Box::new(nested_category1)),
        };

        let nested_category2 = TestCategory {
            id: "semantic", // Different ID
            name: "Semantic",
            child: None,
        };

        let category2 = TestCategory {
            id: "parser",
            name: "Parser",
            child: Some(Box::new(nested_category2)),
        };

        assert!(!category1.is_category_equivalent(&category2));
    }

    #[test]
    fn is_category_equivalent_different_hierarchy_depth() {
        let category1 = TestCategory {
            id: "parser",
            name: "Parser",
            child: None,
        };

        let nested_category = TestCategory {
            id: "syntax",
            name: "Syntax",
            child: None,
        };

        let category2 = TestCategory {
            id: "parser",
            name: "Parser",
            child: Some(Box::new(nested_category)),
        };

        // Different hierarchy depths should not match
        assert!(!category1.is_category_equivalent(&category2));
        assert!(!category2.is_category_equivalent(&category1));
    }

    #[test]
    fn is_category_equivalent_deeply_nested_categories() {
        let inner_category1 = TestCategory {
            id: "unexpected",
            name: "Unexpected Token",
            child: None,
        };

        let middle_category1 = TestCategory {
            id: "syntax",
            name: "Syntax",
            child: Some(Box::new(inner_category1)),
        };

        let category1 = TestCategory {
            id: "parser",
            name: "Parser",
            child: Some(Box::new(middle_category1)),
        };

        let inner_category2 = TestCategory {
            id: "unexpected",
            name: "Unexpected Symbol", // Different name shouldn't matter
            child: None,
        };

        let middle_category2 = TestCategory {
            id: "syntax",
            name: "Syntax Error", // Different name shouldn't matter
            child: Some(Box::new(inner_category2)),
        };

        let category2 = TestCategory {
            id: "parser",
            name: "Parser Module", // Different name shouldn't matter
            child: Some(Box::new(middle_category2)),
        };

        assert!(category1.is_category_equivalent(&category2));
    }

    #[test]
    fn is_category_equivalent_terminal_categories() {
        let terminal1 = TerminalDiagnosticCategory {
            id: "syntax-error",
            name: "Syntax Error",
        };

        let terminal2 = TerminalDiagnosticCategory {
            id: "syntax-error",
            name: "Different Name", // Name doesn't matter for matching
        };

        let terminal3 = TerminalDiagnosticCategory {
            id: "type-error", // Different ID
            name: "Type Error",
        };

        assert!(terminal1.is_category_equivalent(&terminal2));
        assert!(!terminal1.is_category_equivalent(&terminal3));
    }
}
