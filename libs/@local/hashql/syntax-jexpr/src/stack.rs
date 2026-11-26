//! Stack growth for the recursive parsers and tree walks of this crate.

/// Bytes of stack that must be free before a recursive call runs on the current stack segment.
const RED_ZONE: usize = 128 * 1024;

/// Size in bytes of each stack segment allocated once less than [`RED_ZONE`] is free.
const SEGMENT_SIZE: usize = 1024 * 1024;

/// Runs `callback` with at least [`RED_ZONE`] bytes of stack free.
///
/// The recursion still needs a depth bound of its own, because each segment is allocated on the
/// heap and unbounded recursion would exhaust memory in place of the stack.
#[inline]
pub(crate) fn ensure_sufficient_stack<T>(callback: impl FnOnce() -> T) -> T {
    stacker::maybe_grow(RED_ZONE, SEGMENT_SIZE, callback)
}
