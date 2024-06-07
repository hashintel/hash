// From `serde::de::size_hint`

use core::{cmp, mem};

const MAX_PREALLOCATED_BYTES: usize = 1024 * 1024;

/// Converts the size hint of an iterator to a `usize`.
///
/// The bound is capped at 1 MiB to prevent excessive preallocation.
pub(crate) fn cautious<Element>(hint: Option<usize>) -> usize {
    if mem::size_of::<Element>() == 0 {
        0
    } else {
        #[expect(clippy::integer_division, clippy::integer_division_remainder_used)]
        cmp::min(
            hint.unwrap_or(0),
            MAX_PREALLOCATED_BYTES / mem::size_of::<Element>(),
        )
    }
}
