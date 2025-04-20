use smallvec::SmallVec;

/// Compute the Cartesian product of `fields`,
/// where each `fields[k]` is a slice of variants for the kᵗʰ position.
/// Returns a Vec of `SmallVec`s, each of `length = fields.len()`.
///
/// # Example
///
/// ```
/// # use hashql_core::math::cartesian_product;
/// #
/// let a = vec!['1', '2'];
/// let b = vec!['A', 'B', 'C'];
/// let c = vec!['W', 'X', 'Y', 'Z'];
/// let product = cartesian_product::<_, _, 3>(&[&a, &b, &c]);
/// assert_eq!(product.len(), 2 * 3 * 4);
/// assert_eq!(product[0], ['1', 'A', 'W']);
/// assert_eq!(*product.last().unwrap(), ['2', 'C', 'Z']);
/// ```
#[expect(clippy::integer_division_remainder_used)]
pub fn cartesian_product<T, U, const N: usize>(fields: &[U]) -> Vec<SmallVec<T, N>>
where
    T: Clone,
    U: AsRef<[T]>,
{
    let length = fields.len();
    // Compute total number of combinations: N = Πₖ fields[k].len()
    let total: usize = fields.iter().map(|field| field.as_ref().len()).product();

    // Pre‐allocate the outer Vec
    let mut out = Vec::with_capacity(total);

    // For each index i in [0, total):
    //   treat i in mixed‐radix where radix[k] = fields[k].len()
    //   digit[k] = (i / (Πⱼ<k radix[j])) % radix[k]
    for index in 0..total {
        let mut combination = SmallVec::with_capacity(length);

        // rem will successively divide out each radix
        let mut remaining = index;

        for field in fields {
            let field = field.as_ref();
            let radix = field.len();

            // Which variant for this field?
            let index = remaining % radix;
            combination.push(field[index].clone());
            remaining /= radix;
        }

        out.push(combination);
    }

    out
}

#[cfg(test)]
mod tests {
    #![expect(clippy::min_ident_chars)]

    use crate::math::cartesian_product;

    #[test]
    fn empty_fields_list() {
        // Cartesian product of zero sequences → one empty combination
        let fields: &[&[i32]] = &[];
        let result = cartesian_product::<_, _, 8>(fields);
        assert_eq!(result.len(), 1);
        assert!(result[0].is_empty());
    }

    #[test]
    fn zero_variant_field() {
        // Any field with zero variants → no combinations
        let a = [1, 2];
        let b: [i32; 0] = [];
        let result = cartesian_product::<_, _, 8>(&[a.as_slice(), b.as_slice()]);
        assert!(result.is_empty());
    }

    #[test]
    fn single_field() {
        // Single field should return each variant as its own combo
        let letters = ['A', 'B', 'C'];
        let result = cartesian_product::<_, _, 8>(&[&letters]);
        assert_eq!(result, [['A'], ['B'], ['C']]);
    }

    #[test]
    fn two_fields() {
        // 2 × 3 = 6 combinations
        let nums = ['1', '2'];
        let chars = ['X', 'Y', 'Z'];
        let result = cartesian_product::<_, _, 8>(&[nums.as_slice(), chars.as_slice()]);

        assert_eq!(
            result,
            [
                ['1', 'X'],
                ['2', 'X'],
                ['1', 'Y'],
                ['2', 'Y'],
                ['1', 'Z'],
                ['2', 'Z'],
            ]
        );
    }

    #[expect(clippy::non_ascii_literal)]
    #[test]
    fn three_fields_strings() {
        // 2 × 2 × 2 = 8 combinations
        let a = ["foo", "bar"];
        let b = ["α", "β"];
        let c = ["🍎", "🍌"];
        let result = cartesian_product::<_, _, 8>(&[&a, &b, &c]);

        assert_eq!(
            result,
            [
                ["foo", "α", "🍎"],
                ["bar", "α", "🍎"],
                ["foo", "β", "🍎"],
                ["bar", "β", "🍎"],
                ["foo", "α", "🍌"],
                ["bar", "α", "🍌"],
                ["foo", "β", "🍌"],
                ["bar", "β", "🍌"],
            ]
        );
    }
}
