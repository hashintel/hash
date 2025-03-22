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
