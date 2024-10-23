/// Adds two numbers together
///
/// # Example
///
/// ```rust
/// use chonky::add;
///
/// assert_eq!(add(1, 3), 4);
/// ```
#[must_use]
pub const fn add(left: u64, right: u64) -> u64 {
    left + right
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn it_works() {
        let result = add(2, 2);
        assert_eq!(result, 4);
    }
}
