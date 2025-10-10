use core::{
    ops::{Bound, Range, RangeFrom, RangeFull, RangeInclusive, RangeTo, RangeToInclusive},
    slice::SliceIndex,
};

use super::Id;

pub trait IntoSliceIndex<I, T: ?Sized> {
    type SliceIndex: SliceIndex<T>;

    fn into_slice_index(self) -> Self::SliceIndex;
}

impl<I, T> IntoSliceIndex<I, [T]> for I
where
    I: Id,
{
    type SliceIndex = usize;

    #[inline]
    fn into_slice_index(self) -> Self::SliceIndex {
        self.as_usize()
    }
}

impl<I, T> IntoSliceIndex<I, [T]> for (Bound<I>, Bound<I>)
where
    I: Id,
{
    type SliceIndex = (Bound<usize>, Bound<usize>);

    #[inline]
    fn into_slice_index(self) -> Self::SliceIndex {
        (self.0.map(Id::as_usize), self.1.map(Id::as_usize))
    }
}

impl<I, T> IntoSliceIndex<I, [T]> for Range<I>
where
    I: Id,
{
    type SliceIndex = Range<usize>;

    #[inline]
    fn into_slice_index(self) -> Self::SliceIndex {
        Range {
            start: self.start.as_usize(),
            end: self.end.as_usize(),
        }
    }
}

impl<I, T> IntoSliceIndex<I, [T]> for RangeFrom<I>
where
    I: Id,
{
    type SliceIndex = RangeFrom<usize>;

    #[inline]
    fn into_slice_index(self) -> Self::SliceIndex {
        RangeFrom {
            start: self.start.as_usize(),
        }
    }
}

impl<I, T> IntoSliceIndex<I, [T]> for RangeFull
where
    I: Id,
{
    type SliceIndex = Self;

    #[inline]
    fn into_slice_index(self) -> Self::SliceIndex {
        self
    }
}

impl<I, T> IntoSliceIndex<I, [T]> for RangeInclusive<I>
where
    I: Id,
{
    type SliceIndex = RangeInclusive<usize>;

    #[inline]
    fn into_slice_index(self) -> Self::SliceIndex {
        let (start, end) = self.into_inner();

        RangeInclusive::new(start.as_usize(), end.as_usize())
    }
}

impl<I, T> IntoSliceIndex<I, [T]> for RangeTo<I>
where
    I: Id,
{
    type SliceIndex = RangeTo<usize>;

    #[inline]
    fn into_slice_index(self) -> Self::SliceIndex {
        RangeTo {
            end: self.end.as_usize(),
        }
    }
}

impl<I, T> IntoSliceIndex<I, [T]> for RangeToInclusive<I>
where
    I: Id,
{
    type SliceIndex = RangeToInclusive<usize>;

    #[inline]
    fn into_slice_index(self) -> Self::SliceIndex {
        RangeToInclusive {
            end: self.end.as_usize(),
        }
    }
}
