use core::{
    error::Error,
    num::NonZeroUsize,
    ops::{Deref, DerefMut},
};

/// A [`Vec`] that is guaranteed to hold at least one element.
///
/// The field is private: construction goes through `From<T>` (a single element) or
/// `TryFrom<Vec<T>>`, and no operation can empty it — mutable access is only handed out as a slice,
/// which cannot change the length.
///
/// # Builder convention
///
/// [`bon`] builder members of this type use the plain generated setter with `#[builder(into)]`:
/// a single element and a ready-made `NonEmptyVec` convert infallibly, so setters never return
/// [`Result`]. A [`Vec`] is parsed visibly at the call site via `NonEmptyVec::try_from` — the
/// one place where emptiness can fail.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct NonEmptyVec<T>(Vec<T>);

#[derive(Debug, PartialEq, Eq, derive_more::Display)]
#[display("the vector must not be empty")]
pub struct EmptyVec;

impl Error for EmptyVec {}

impl<T> NonEmptyVec<T> {
    pub fn push(&mut self, value: T) {
        self.0.push(value);
    }

    #[must_use]
    pub fn first(&self) -> &T {
        self.0
            .first()
            .unwrap_or_else(|| unreachable!("the vector is never empty"))
    }

    #[must_use]
    pub fn last(&self) -> &T {
        self.0
            .last()
            .unwrap_or_else(|| unreachable!("the vector is never empty"))
    }

    #[must_use]
    pub fn len(&self) -> NonZeroUsize {
        NonZeroUsize::new(self.0.len()).unwrap_or_else(|| unreachable!("the vector is never empty"))
    }

    pub fn iter(&self) -> core::slice::Iter<'_, T> {
        self.0.iter()
    }
}

impl<T> From<T> for NonEmptyVec<T> {
    fn from(value: T) -> Self {
        Self(vec![value])
    }
}

impl<T> TryFrom<Vec<T>> for NonEmptyVec<T> {
    type Error = EmptyVec;

    fn try_from(values: Vec<T>) -> Result<Self, Self::Error> {
        if values.is_empty() {
            return Err(EmptyVec);
        }
        Ok(Self(values))
    }
}

impl<T> Deref for NonEmptyVec<T> {
    type Target = [T];

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

impl<T> DerefMut for NonEmptyVec<T> {
    fn deref_mut(&mut self) -> &mut Self::Target {
        &mut self.0
    }
}

impl<T> AsRef<[T]> for NonEmptyVec<T> {
    fn as_ref(&self) -> &[T] {
        &self.0
    }
}

impl<T> AsMut<[T]> for NonEmptyVec<T> {
    fn as_mut(&mut self) -> &mut [T] {
        &mut self.0
    }
}

impl<T> From<NonEmptyVec<T>> for Vec<T> {
    fn from(values: NonEmptyVec<T>) -> Self {
        values.0
    }
}

impl<'v, T> IntoIterator for &'v NonEmptyVec<T> {
    type IntoIter = core::slice::Iter<'v, T>;
    type Item = &'v T;

    fn into_iter(self) -> Self::IntoIter {
        self.0.iter()
    }
}

impl<T> IntoIterator for NonEmptyVec<T> {
    type IntoIter = alloc::vec::IntoIter<T>;
    type Item = T;

    fn into_iter(self) -> Self::IntoIter {
        self.0.into_iter()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn construction_enforces_at_least_one_element() {
        assert_eq!(
            NonEmptyVec::<u32>::try_from(Vec::new())
                .expect_err("an empty vector should be rejected"),
            EmptyVec
        );

        let mut values = NonEmptyVec::from(1);
        values.push(2);
        assert_eq!(values.as_ref(), [1, 2]);
        assert_eq!(values.len().get(), 2);
        assert_eq!(*values.first(), 1);
        assert_eq!(*values.last(), 2);
        assert_eq!(Vec::from(values), vec![1, 2]);
    }
}
