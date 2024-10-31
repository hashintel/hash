use core::fmt::Display;

/// Reference Or Box (rob)
///
/// Similar to a [`Cow`], but instead of requiring [`ToOwned`] it has no requirements on `T`.
///
/// Very similar to a Maybe Owned Object (moo), which requires `T` to be [`Sized`].
///
/// [`Cow`]: alloc::borrow::Cow
#[derive(Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum RefOrBox<'a, T: ?Sized> {
    Ref(&'a T),
    Box(Box<T>),
}

impl<T: ?Sized> RefOrBox<'_, T> {
    #[must_use]
    pub fn into_owned(self) -> T
    where
        T: Clone,
    {
        match self {
            Self::Ref(reference) => reference.clone(),
            Self::Box(boxed) => *boxed,
        }
    }
}

impl<T> AsRef<T> for RefOrBox<'_, T> {
    fn as_ref(&self) -> &T {
        match self {
            Self::Ref(reference) => reference,
            Self::Box(boxed) => boxed,
        }
    }
}

impl<T> Clone for RefOrBox<'_, T>
where
    T: Clone,
{
    fn clone(&self) -> Self {
        match self {
            Self::Ref(reference) => Self::Ref(*reference),
            Self::Box(boxed) => Self::Box(boxed.clone()),
        }
    }

    fn clone_from(&mut self, source: &Self) {
        match (self, source) {
            (Self::Ref(this_ref), Self::Ref(source_ref)) => *this_ref = *source_ref,
            (Self::Box(this_box), Self::Box(source_box)) => this_box.clone_from(source_box),
            (lhs, rhs) => *lhs = rhs.clone(),
        }
    }
}

impl<T: Display + ?Sized> Display for RefOrBox<'_, T> {
    fn fmt(&self, fmt: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        match self {
            Self::Ref(reference) => reference.fmt(fmt),
            Self::Box(boxed) => boxed.fmt(fmt),
        }
    }
}

impl<'a, T: ?Sized> From<&'a T> for RefOrBox<'a, T> {
    fn from(reference: &'a T) -> Self {
        Self::Ref(reference)
    }
}

impl<T> From<T> for RefOrBox<'_, T> {
    fn from(boxed: T) -> Self {
        Self::Box(Box::new(boxed))
    }
}

#[cfg(feature = "serde")]
impl<T> serde::Serialize for RefOrBox<'_, T>
where
    T: serde::Serialize,
{
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        match self {
            RefOrBox::Ref(reference) => reference.serialize(serializer),
            RefOrBox::Box(boxed) => boxed.serialize(serializer),
        }
    }
}

#[cfg(feature = "serde")]
impl<'de, T> serde::Deserialize<'de> for RefOrBox<'_, T>
where
    T: serde::Deserialize<'de>,
{
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        Box::<T>::deserialize(deserializer).map(Self::Box)
    }
}
