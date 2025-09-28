/// Sorts two slices in tandem based on the ordering of the first slice.
///
/// This function performs a coordinated sort where elements in both slices are rearranged
/// such that the first slice (`lhs`) becomes sorted, while maintaining the correspondence
/// between elements at the same indices in both slices.
///
/// The algorithm is inspired by the [`co_sort`](https://docs.rs/co_sort/latest/co_sort/) crate
/// and uses an in-place permutation approach to minimize memory allocations.
///
/// # Arguments
///
/// * `lhs` - The slice to sort by. Must implement [`Ord`] for comparison.
/// * `rhs` - The slice to be permuted alongside `lhs`. Can be any type.
///
/// Both slices must have the same length.
///
/// # Panics
///
/// Panics if the slices have different lengths.
///
/// # Examples
///
/// ```rust,ignore
/// // Example usage within the module
/// let mut keys = [3, 1, 4, 1, 5];
/// let mut values = ['c', 'a', 'd', 'b', 'e'];
///
/// co_sort(&mut keys, &mut values);
///
/// assert_eq!(keys, [1, 1, 3, 4, 5]);
/// assert_eq!(values, ['a', 'b', 'c', 'd', 'e']);
/// ```
#[expect(unsafe_code)]
#[inline]
pub fn co_sort<T: Ord, U>(lhs: &mut [T], rhs: &mut [U]) {
    let n = lhs.len();
    assert_eq!(n, rhs.len(), "lhs and rhs must have the same length");

    // permutation[i] == original index of the i-th smallest element
    let mut permutation: Vec<usize> = (0..n).collect();
    permutation.sort_unstable_by_key(|&index| {
        // SAFETY: 0 ≤ index < n by construction
        unsafe { lhs.get_unchecked(index) }
    });

    assert_eq!(permutation.len(), n); // guides LLVM to remove bounds checks

    let mut position;
    for index in 0..n {
        position = permutation[index];

        while position < index {
            // SAFETY: 0 ≤ position < n by construction
            position = unsafe { *permutation.get_unchecked(position) };
        }

        // SAFETY: both indices < n
        unsafe {
            lhs.swap_unchecked(index, position);
            rhs.swap_unchecked(index, position);
        }
    }
}

#[cfg(test)]
mod tests {
    use proptest::{collection::size_range, prop_assert, prop_assert_eq, test_runner::Config};
    use test_strategy::proptest;

    use crate::algorithms::co_sort;

    #[proptest(
        if cfg!(miri) {
            Config { failure_persistence: None, cases: 40, ..Config::default() }
        } else {
            Config::default()
        }
    )]
    fn co_sort_sorted_and_permuted(#[any(size_range(0..64).lift())] mut input: Vec<(u16, i32)>) {
        let mut lhs: Vec<_> = input.iter().map(|&(lhs, _)| lhs).collect();
        let mut rhs: Vec<_> = input.iter().map(|&(_, rhs)| rhs).collect();

        co_sort(&mut lhs, &mut rhs);

        // lhs is non-decreasing
        prop_assert!(lhs.array_windows().all(|[left, right]| left <= right));

        // The lhs-rhs pairs are unchanged
        let mut after: Vec<_> = lhs.into_iter().zip(rhs.into_iter()).collect();

        input.sort_unstable();
        after.sort_unstable();

        prop_assert_eq!(input, after);
    }

    #[test]
    #[should_panic(expected = "must have the same length")]
    fn co_sort_length_mismatch() {
        let mut lhs = [1, 2, 3];
        let mut rhs = [42_i8; 2];
        co_sort(&mut lhs, &mut rhs);
    }

    #[test]
    fn co_sort_empty() {
        let mut lhs: [u8; 0] = [];
        let mut rhs: [(); 0] = [];
        co_sort(&mut lhs, &mut rhs);
    }
}
