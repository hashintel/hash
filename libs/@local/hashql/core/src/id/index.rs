use core::{
    ops::{Bound, Range, RangeFrom, RangeFull, RangeInclusive, RangeTo, RangeToInclusive},
    slice::SliceIndex,
};

use super::Id;

pub const trait IntoSliceIndex<I, T: ?Sized> {
    type SliceIndex: SliceIndex<T>;

    fn into_slice_index(self) -> Self::SliceIndex;
}

const impl<I, T> IntoSliceIndex<I, [T]> for I
where
    I: [const] Id,
{
    type SliceIndex = usize;

    #[inline]
    fn into_slice_index(self) -> Self::SliceIndex {
        self.as_usize()
    }
}

const fn map_bounds<I>(bound: Bound<I>) -> Bound<usize>
where
    I: [const] Id,
{
    match bound {
        Bound::Included(index) => Bound::Included(index.as_usize()),
        Bound::Excluded(index) => Bound::Excluded(index.as_usize()),
        Bound::Unbounded => Bound::Unbounded,
    }
}

const impl<I, T> IntoSliceIndex<I, [T]> for (Bound<I>, Bound<I>)
where
    I: [const] Id,
{
    type SliceIndex = (Bound<usize>, Bound<usize>);

    #[inline]
    fn into_slice_index(self) -> Self::SliceIndex {
        (map_bounds(self.0), map_bounds(self.1))
    }
}

const impl<I, T> IntoSliceIndex<I, [T]> for Range<I>
where
    I: [const] Id,
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

const impl<I, T> IntoSliceIndex<I, [T]> for RangeFrom<I>
where
    I: [const] Id,
{
    type SliceIndex = RangeFrom<usize>;

    #[inline]
    fn into_slice_index(self) -> Self::SliceIndex {
        RangeFrom {
            start: self.start.as_usize(),
        }
    }
}

const impl<I, T> IntoSliceIndex<I, [T]> for RangeFull
where
    I: [const] Id,
{
    type SliceIndex = Self;

    #[inline]
    fn into_slice_index(self) -> Self::SliceIndex {
        self
    }
}

const impl<I, T> IntoSliceIndex<I, [T]> for RangeInclusive<I>
where
    I: [const] Id,
{
    type SliceIndex = RangeInclusive<usize>;

    #[inline]
    fn into_slice_index(self) -> Self::SliceIndex {
        let (start, end) = self.into_inner();

        RangeInclusive::new(start.as_usize(), end.as_usize())
    }
}

const impl<I, T> IntoSliceIndex<I, [T]> for RangeTo<I>
where
    I: [const] Id,
{
    type SliceIndex = RangeTo<usize>;

    #[inline]
    fn into_slice_index(self) -> Self::SliceIndex {
        RangeTo {
            end: self.end.as_usize(),
        }
    }
}

const impl<I, T> IntoSliceIndex<I, [T]> for RangeToInclusive<I>
where
    I: [const] Id,
{
    type SliceIndex = RangeToInclusive<usize>;

    #[inline]
    fn into_slice_index(self) -> Self::SliceIndex {
        RangeToInclusive {
            end: self.end.as_usize(),
        }
    }
}
