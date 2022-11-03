use num::{Integer, Num};

use super::util::bit_util;

// `n_bits` 0 bits, possibly followed by more 0 bits for padding.
// todo: we can remove this by using the (less error-prone) `MutableBitmap` instead
// Asana task: https://app.asana.com/0/1199548034582004/1202829751949518/f
pub fn new_zero_bits<T: Integer + Clone>(n_bits: usize) -> Vec<T> {
    let n_bytes = bit_util::ceil(n_bits, 8);

    let mut buffer = Vec::with_capacity(bit_util::round_upto_multiple_of_64(n_bytes));
    buffer.resize(n_bytes, T::zero());
    debug_assert!(buffer.as_slice().iter().all(|v| *v == T::zero()));
    buffer
}

/// Creates a new (typed) buffer.
pub fn new_buffer<T: Clone + Num>(n_elem: usize) -> Vec<T> {
    let mut buffer = Vec::with_capacity(bit_util::round_upto_multiple_of_64(n_elem));
    // Resize so buffer.len() is the correct size
    buffer.resize(n_elem, T::zero());
    buffer
}

/// Produces a mutable buffer which contains `n_elem` + 1 zeroes.
///
/// It is required that the buffer is filled to `n_elem` + 1 offsets. All elements are zero in the
/// beginning, so there is no need to set the first offset as `0_i32`
pub fn new_offsets_buffer<T: Integer + Clone>(n_elem: usize) -> Vec<T> {
    let mut buffer = Vec::with_capacity(n_elem + 1);
    // Resize so buffer.len() is the correct size
    buffer.resize(n_elem + 1, T::zero());
    buffer
}

#[cfg(test)]
#[test]
fn test_offsets_len() {
    assert_eq!(new_offsets_buffer::<i32>(100).len(), 100 + 1);
    assert_eq!(new_offsets_buffer::<i64>(235).len(), 235 + 1);
}
