#![cfg_attr(not(test), no_std)]
// Not required, reason: code quality
#![feature(lint_reasons)]
// Used to canonicalize intervals
#![cfg_attr(feature = "canonicalize", feature(step_trait))]
#![warn(
    clippy::pedantic,
    clippy::nursery,
    // Encountering a lot of false positives appearing on things like `derive` macros. We should revisit
    // periodically in case the bug gets fixed
    // clippy::allow_attributes_without_reason,
    clippy::as_underscore,
    clippy::clone_on_ref_ptr,
    clippy::create_dir,
    clippy::dbg_macro,
    clippy::default_union_representation,
    clippy::deref_by_slicing,
    clippy::empty_structs_with_brackets,
    clippy::filetype_is_file,
    clippy::get_unwrap,
    clippy::print_stdout,
    clippy::print_stderr,
    clippy::same_name_method,
    clippy::try_err,
    clippy::undocumented_unsafe_blocks,
    clippy::unnecessary_self_imports,
    clippy::unwrap_used,
    clippy::use_debug,
    clippy::verbose_file_reads
)]
// Until we do optimization work, there is unlikely to be any reason to use unsafe code. When it
// becomes necessary/desirable to allow for unsafe code, we should:
// - enable miri checks in the CI for the relevant code
// - swap this lint with `#![deny(unsafe_code)]` and only allow it in a few places unless, or until,
//   it gets very verbose to do so.
#![forbid(
    unsafe_code,
    reason = "Unsafe code has been disabled until a good argument has been put forward for its \
              usage"
)]
#![allow(
    clippy::module_name_repetitions,
    reason = "This encourages importing `as` which breaks IDEs"
)]

mod bounds;
#[cfg(feature = "canonical")]
mod canonical;
#[cfg(feature = "continuous")]
mod continuous;
mod interval;

#[cfg(feature = "canonical")]
pub use self::canonical::CanonicalInterval;
#[cfg(feature = "continuous")]
pub use self::continuous::ContinuousInterval;
pub use self::{
    bounds::{LowerBound, UpperBound},
    interval::Interval,
};

#[inline(never)]
fn invalid_bounds() -> ! {
    panic!("interval lower bound must be less than or equal to its upper bound")
}

#[cfg(all(test, feature = "canonicalize"))]
mod tests {
    use core::ops::Bound;

    use crate::{CanonicalInterval, ContinuousInterval, Interval};

    #[test]
    fn new() {
        assert_eq!(
            ContinuousInterval::from_range(1..=2).canonicalize(),
            CanonicalInterval::from_range(1..3)
        );
        assert_eq!(
            ContinuousInterval::from_range((Bound::Excluded(0), Bound::Excluded(3))).canonicalize(),
            CanonicalInterval::from_range(1..3)
        );
        assert_eq!(
            ContinuousInterval::from_range(i32::MIN..=i32::MAX).canonicalize(),
            CanonicalInterval::from_range(i32::MIN..)
        );
        assert_eq!(
            ContinuousInterval::from_range(..=i32::MAX).canonicalize(),
            CanonicalInterval::from_range(..)
        );
        assert!(ContinuousInterval::from_range(1..1).is_empty());
        assert!(
            !ContinuousInterval::from_range((Bound::Excluded(i32::MAX), Bound::Unbounded))
                .is_empty()
        );
        assert!(
            ContinuousInterval::from_range((Bound::Excluded(i32::MAX), Bound::Unbounded))
                .canonicalize()
                .is_empty()
        );
        assert!(
            ContinuousInterval::from_range((Bound::Excluded(i32::MAX), Bound::Excluded(i32::MAX)))
                .is_empty()
        );
        assert!(
            ContinuousInterval::from_range((Bound::Excluded(i32::MAX), Bound::Excluded(i32::MAX)))
                .canonicalize()
                .is_empty()
        );
    }

    #[test]
    #[rustfmt::skip]
    fn test_merge() {
        assert_eq!(ContinuousInterval::from_range(1..3) + ContinuousInterval::from_range(0..5), ContinuousInterval::from_range(0..5));
        assert_eq!(ContinuousInterval::from_range(1..3) + ContinuousInterval::from_range(1..5), ContinuousInterval::from_range(1..5));
        assert_eq!(ContinuousInterval::from_range(1..3) + ContinuousInterval::from_range(2..5), ContinuousInterval::from_range(1..5));
        assert_eq!(ContinuousInterval::from_range(1..3) + ContinuousInterval::from_range(3..5), ContinuousInterval::from_range(1..5));
        // ContinuousIntervals are disjoint
        assert_eq!(ContinuousInterval::from_range(1..3).union(ContinuousInterval::from_range(4..5)), None);
        assert_eq!(ContinuousInterval::from_range(1..3).canonicalize() + ContinuousInterval::from_range(5..5).canonicalize(), CanonicalInterval::from_range(1..3));

        assert_eq!(ContinuousInterval::from_range(3..5).canonicalize() + ContinuousInterval::from_range(1..1).canonicalize(), CanonicalInterval::from_range(3..5));
        assert_eq!(ContinuousInterval::from_range(3..5).union(ContinuousInterval::from_range(1..2)), None);
        assert_eq!(ContinuousInterval::from_range(3..5) + ContinuousInterval::from_range(1..3), ContinuousInterval::from_range(1..5));
        assert_eq!(ContinuousInterval::from_range(3..5) + ContinuousInterval::from_range(1..4), ContinuousInterval::from_range(1..5));
        assert_eq!(ContinuousInterval::from_range(3..5) + ContinuousInterval::from_range(1..5), ContinuousInterval::from_range(1..5));
        assert_eq!(ContinuousInterval::from_range(3..5) + ContinuousInterval::from_range(1..6), ContinuousInterval::from_range(1..6));

        assert_eq!(ContinuousInterval::from_range(1..) + ContinuousInterval::from_range(0..4), ContinuousInterval::from_range(0..));
        assert_eq!(ContinuousInterval::from_range(1..) + ContinuousInterval::from_range(2..4), ContinuousInterval::from_range(1..));
        assert_eq!(ContinuousInterval::from_range(..5) + ContinuousInterval::from_range(0..3), ContinuousInterval::from_range(..5));
        assert_eq!(ContinuousInterval::from_range(..5) + ContinuousInterval::from_range(0..4), ContinuousInterval::from_range(..5));
        assert_eq!(ContinuousInterval::from_range(..5) + ContinuousInterval::from_range(0..5), ContinuousInterval::from_range(..5));
        assert_eq!(ContinuousInterval::from_range(..5) + ContinuousInterval::from_range(0..6), ContinuousInterval::from_range(..6));

        assert_eq!(ContinuousInterval::from_range(..5) + ContinuousInterval::from_range(2..), ContinuousInterval::from_range(..));
    }

    #[test]
    #[rustfmt::skip]
    fn test_difference() {
        assert_eq!(ContinuousInterval::from_range(1..3) - ContinuousInterval::from_range(2..4), ContinuousInterval::from_range(1..2));
        assert_eq!(ContinuousInterval::from_range(1..3) - ContinuousInterval::from_range(3..4), ContinuousInterval::from_range(1..3));
        assert_eq!(ContinuousInterval::from_range(1..2) - ContinuousInterval::from_range(3..4), ContinuousInterval::from_range(1..2));
        assert_eq!(ContinuousInterval::from_range(1..3) - ContinuousInterval::from_range(1..3), ContinuousInterval::empty());
        assert_eq!(ContinuousInterval::from_range(1..3) - ContinuousInterval::from_range(1..2), ContinuousInterval::from_range(2..3));
        assert_eq!(ContinuousInterval::from_range(1..3) - ContinuousInterval::from_range(2..3), ContinuousInterval::from_range(1..2));
        assert_eq!(ContinuousInterval::from_range(1..3) - ContinuousInterval::from_range(1..), ContinuousInterval::empty());
        assert_eq!(ContinuousInterval::from_range(1..3) - ContinuousInterval::from_range(..3), ContinuousInterval::empty());
        assert_eq!(ContinuousInterval::from_range(1..3) - ContinuousInterval::from_range(..), ContinuousInterval::empty());
        assert_eq!(ContinuousInterval::from_range(1..3) - ContinuousInterval::from_range(..2), ContinuousInterval::from_range(2..3));
        assert_eq!(ContinuousInterval::from_range(1..) - ContinuousInterval::from_range(0..4), ContinuousInterval::from_range(4..));
        assert_eq!(ContinuousInterval::from_range(1..).difference(ContinuousInterval::from_range(3..4)), None);
        assert_eq!(ContinuousInterval::from_range(..) - ContinuousInterval::from_range(..4), ContinuousInterval::from_range(4..));
        assert_eq!(ContinuousInterval::from_range(..) - ContinuousInterval::from_range(4..), ContinuousInterval::from_range(..4));
    }

    #[test]
    #[rustfmt::skip]
    fn test_intersection() {
        assert_eq!(ContinuousInterval::from_range(1..3) * ContinuousInterval::from_range(2..4), ContinuousInterval::from_range(2..3));
        assert_eq!(ContinuousInterval::from_range(1..3) * ContinuousInterval::from_range(3..4), ContinuousInterval::empty());
        assert_eq!(ContinuousInterval::from_range(1..2) * ContinuousInterval::from_range(3..4), ContinuousInterval::empty());
        assert_eq!(ContinuousInterval::from_range(1..) * ContinuousInterval::from_range(3..4), ContinuousInterval::from_range(3..4));
    }

    #[test]
    fn adjacency() {
        assert!(
            ContinuousInterval::from_range(1..3)
                .is_adjacent_to(&ContinuousInterval::from_range(3..4))
        );
        assert!(
            !ContinuousInterval::from_range(1..=2)
                .is_adjacent_to(&ContinuousInterval::from_range(3..4))
        );
        assert!(
            CanonicalInterval::from_range(1..=2)
                .is_adjacent_to(&CanonicalInterval::from_range(3..4))
        );
    }
}
