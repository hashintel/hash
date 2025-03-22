use alloc::borrow::Cow;
use core::fmt::Display;

pub(crate) struct CanonicalCategoryId<C>(C);

impl<C> CanonicalCategoryId<C> {
    pub(crate) const fn new(category: C) -> Self {
        Self(category)
    }
}

impl<C> Display for CanonicalCategoryId<C>
where
    C: Category,
{
    fn fmt(&self, fmt: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        Display::fmt(&self.0.id(), fmt)?;

        let mut child = self.0.subcategory();
        while let Some(category) = child {
            fmt.write_str("::")?;
            CanonicalCategoryId(category).fmt(fmt)?;

            child = category.subcategory();
        }

        Ok(())
    }
}

pub(crate) struct CanonicalCategoryName<C>(C);

impl<C> CanonicalCategoryName<C> {
    pub(crate) const fn new(category: C) -> Self {
        Self(category)
    }
}

impl<C> Display for CanonicalCategoryName<C>
where
    C: Category,
{
    fn fmt(&self, fmt: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        Display::fmt(&self.0.name(), fmt)?;

        let mut child = self.0.subcategory();
        while let Some(category) = child {
            fmt.write_str(" / ")?;
            CanonicalCategoryName(category).fmt(fmt)?;

            child = category.subcategory();
        }

        Ok(())
    }
}

pub trait Category {
    fn id(&self) -> Cow<'_, str>;
    fn name(&self) -> Cow<'_, str>;

    fn subcategory(&self) -> Option<&dyn Category>;
}

impl Category for &dyn Category {
    fn id(&self) -> Cow<'_, str> {
        (**self).id()
    }

    fn name(&self) -> Cow<'_, str> {
        (**self).name()
    }

    fn subcategory(&self) -> Option<&dyn Category> {
        (**self).subcategory()
    }
}

impl<C: Category> Category for &C {
    fn id(&self) -> Cow<'_, str> {
        (**self).id()
    }

    fn name(&self) -> Cow<'_, str> {
        (**self).name()
    }

    fn subcategory(&self) -> Option<&dyn Category> {
        (**self).subcategory()
    }
}

#[cfg(test)]
mod tests {
    use alloc::string::ToString as _;
    use core::fmt::Debug;

    use super::*;

    trait DebugCategory: Category + Debug {}
    impl<T: Category + Debug> DebugCategory for T {}

    #[derive(Debug)]
    struct TestCategory {
        id: &'static str,
        name: &'static str,
        child: Option<Box<dyn DebugCategory>>,
    }

    impl Category for TestCategory {
        fn id(&self) -> Cow<'_, str> {
            Cow::Borrowed(self.id)
        }

        fn name(&self) -> Cow<'_, str> {
            Cow::Borrowed(self.name)
        }

        fn subcategory(&self) -> Option<&dyn Category> {
            self.child.as_deref().map(|child| child as &dyn Category)
        }
    }

    #[test]
    fn canonical_id_single_category() {
        let category = TestCategory {
            id: "parser",
            name: "Parser",
            child: None,
        };

        let canonical = CanonicalCategoryId::new(&category);
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

        let canonical = CanonicalCategoryId::new(&category);
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

        let canonical = CanonicalCategoryId::new(&category);
        assert_eq!(canonical.to_string(), "parser::syntax::unexpected");
    }

    #[test]
    fn canonical_name_single_category() {
        let category = TestCategory {
            id: "parser",
            name: "Parser",
            child: None,
        };

        let canonical = CanonicalCategoryName::new(&category);
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

        let canonical = CanonicalCategoryName::new(&category);
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

        let canonical = CanonicalCategoryName::new(&category);
        assert_eq!(canonical.to_string(), "Parser / Syntax / Unexpected Token");
    }
}
