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

impl<'a, T: ?Sized> RefOrBox<'a, T> {
    #[must_use]
    pub fn into_owned(self) -> T
    where
        T: Clone,
    {
        match self {
            Self::Ref(r) => r.clone(),
            Self::Box(b) => *b,
        }
    }
}

impl<'a, T> AsRef<T> for RefOrBox<'a, T> {
    fn as_ref(&self) -> &T {
        match self {
            Self::Ref(r) => r,
            Self::Box(b) => b,
        }
    }
}

impl<'a, T> Clone for RefOrBox<'a, T>
where
    T: Clone,
{
    fn clone(&self) -> Self {
        match self {
            Self::Ref(r) => Self::Ref(*r),
            Self::Box(b) => Self::Box(b.clone()),
        }
    }

    fn clone_from(&mut self, source: &Self) {
        match (self, source) {
            (Self::Ref(r), Self::Ref(s)) => *r = *s,
            (Self::Box(b), Self::Box(s)) => b.clone_from(s),
            (a, b) => *a = b.clone(),
        }
    }
}

impl<'a, T: Display + ?Sized> Display for RefOrBox<'a, T> {
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        match self {
            Self::Ref(r) => r.fmt(f),
            Self::Box(b) => b.fmt(f),
        }
    }
}

impl<'a, T: ?Sized> From<&'a T> for RefOrBox<'a, T> {
    fn from(r: &'a T) -> Self {
        Self::Ref(r)
    }
}

impl<T> From<T> for RefOrBox<'_, T> {
    fn from(b: T) -> Self {
        Self::Box(Box::new(b))
    }
}

#[cfg(feature = "serde")]
impl<'a, T> serde::Serialize for RefOrBox<'a, T>
where
    T: serde::Serialize,
{
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        match self {
            RefOrBox::Ref(r) => r.serialize(serializer),
            RefOrBox::Box(b) => b.serialize(serializer),
        }
    }
}

#[cfg(feature = "serde")]
impl<'a, 'de, T> serde::Deserialize<'de> for RefOrBox<'a, T>
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
