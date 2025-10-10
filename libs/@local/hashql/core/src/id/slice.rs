use core::{
    fmt::{self, Debug},
    marker::PhantomData,
    ops::{Index, IndexMut},
    ptr,
    slice::{self, GetDisjointMutError, GetDisjointMutIndex, SliceIndex},
};

use super::{Id, index::IntoSliceIndex, vec::IdVec};

#[derive(PartialEq, Eq, PartialOrd, Ord, Hash)]
#[repr(transparent)]
pub struct IdSlice<I, T> {
    _marker: PhantomData<fn(&I)>,
    raw: [T],
}

impl<I, T> IdSlice<I, T>
where
    I: Id,
{
    #[inline]
    #[must_use]
    pub const fn empty<'this>() -> &'this Self {
        Self::from_raw(&[])
    }

    #[inline]
    #[expect(unsafe_code, reason = "repr(transparent)")]
    pub const fn from_raw(raw: &[T]) -> &Self {
        // SAFETY: `IdSlice` is repr(transparent) and has the same layout as `[T]`.
        unsafe { &*(ptr::from_ref::<[T]>(raw) as *const Self) }
    }

    #[inline]
    #[expect(unsafe_code, reason = "repr(transparent)")]
    pub const fn from_raw_mut(raw: &mut [T]) -> &mut Self {
        // SAFETY: `IdSlice` is repr(transparent) and has the same layout as `[T]`.
        unsafe { &mut *(ptr::from_mut(raw) as *mut Self) }
    }

    #[inline]
    pub fn get<R>(&self, index: R) -> Option<&<R::SliceIndex as SliceIndex<[T]>>::Output>
    where
        R: IntoSliceIndex<I, [T]>,
    {
        self.raw.get(index.into_slice_index())
    }

    #[inline]
    pub fn get_mut<R>(
        &mut self,
        index: R,
    ) -> Option<&mut <R::SliceIndex as SliceIndex<[T]>>::Output>
    where
        R: IntoSliceIndex<I, [T]>,
    {
        self.raw.get_mut(index.into_slice_index())
    }

    #[inline]
    pub fn get_disjoint_mut<R, const N: usize>(
        &mut self,
        index: [R; N],
    ) -> Result<[&mut <R::SliceIndex as SliceIndex<[T]>>::Output; N], GetDisjointMutError>
    where
        R: IntoSliceIndex<I, [T], SliceIndex: GetDisjointMutIndex>,
    {
        self.raw
            .get_disjoint_mut(index.map(IntoSliceIndex::into_slice_index))
    }

    pub fn len(&self) -> usize {
        self.raw.len()
    }

    pub fn is_empty(&self) -> bool {
        self.raw.is_empty()
    }

    pub fn ids(&self) -> impl DoubleEndedIterator<Item = I> + ExactSizeIterator + Clone + 'static {
        (0..self.len()).map(I::from_usize)
    }

    pub fn next_id(&self) -> I {
        I::from_usize(self.len())
    }

    #[inline]
    pub fn iter(&self) -> slice::Iter<'_, T> {
        self.raw.iter()
    }

    pub fn iter_enumerated(
        &self,
    ) -> impl DoubleEndedIterator<Item = (I, &T)> + ExactSizeIterator + Clone {
        self.raw
            .iter()
            .enumerate()
            .map(|(index, value)| (I::from_usize(index), value))
    }

    #[inline]
    pub fn iter_mut(&mut self) -> slice::IterMut<'_, T> {
        self.raw.iter_mut()
    }

    pub fn iter_enumerated_mut(
        &mut self,
    ) -> impl DoubleEndedIterator<Item = (I, &mut T)> + ExactSizeIterator {
        self.raw
            .iter_mut()
            .enumerate()
            .map(|(index, value)| (I::from_usize(index), value))
    }

    // Additional methods are added as needed
}

impl<I, T> Debug for IdSlice<I, T>
where
    I: Id,
    T: Debug,
{
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        Debug::fmt(&self.raw, fmt)
    }
}

impl<I, T, R> Index<R> for IdSlice<I, T>
where
    R: IntoSliceIndex<I, [T]>,
{
    type Output = <R::SliceIndex as SliceIndex<[T]>>::Output;

    fn index(&self, index: R) -> &Self::Output {
        self.raw.index(index.into_slice_index())
    }
}

impl<I, T, R> IndexMut<R> for IdSlice<I, T>
where
    R: IntoSliceIndex<I, [T]>,
{
    fn index_mut(&mut self, index: R) -> &mut Self::Output {
        self.raw.index_mut(index.into_slice_index())
    }
}

impl<'this, I, T> IntoIterator for &'this IdSlice<I, T> {
    type IntoIter = slice::Iter<'this, T>;
    type Item = &'this T;

    fn into_iter(self) -> Self::IntoIter {
        self.raw.iter()
    }
}

impl<'this, I, T> IntoIterator for &'this mut IdSlice<I, T> {
    type IntoIter = slice::IterMut<'this, T>;
    type Item = &'this mut T;

    fn into_iter(self) -> Self::IntoIter {
        self.raw.iter_mut()
    }
}

impl<I, T> ToOwned for IdSlice<I, T>
where
    I: Id,
    T: Clone,
{
    type Owned = IdVec<I, T>;

    fn to_owned(&self) -> Self::Owned {
        IdVec::from_raw(self.raw.to_owned())
    }

    fn clone_into(&self, target: &mut Self::Owned) {
        self.raw.clone_into(&mut target.raw);
    }
}

impl<I, T> Default for &IdSlice<I, T>
where
    I: Id,
{
    fn default() -> Self {
        IdSlice::from_raw(Default::default())
    }
}

impl<I, T> Default for &mut IdSlice<I, T>
where
    I: Id,
{
    fn default() -> Self {
        IdSlice::from_raw_mut(Default::default())
    }
}
