//! Fallible allocation primitives for bounded analytic working sets.

use super::AnalyticError;

pub(super) fn empty<T>(buffer: &'static str, elements: usize) -> Result<Vec<T>, AnalyticError> {
    let mut values = Vec::new();
    values
        .try_reserve_exact(elements)
        .map_err(|_error| AnalyticError::Allocation { buffer, elements })?;
    Ok(values)
}

pub(super) fn filled<T: Clone>(
    buffer: &'static str,
    elements: usize,
    value: T,
) -> Result<Vec<T>, AnalyticError> {
    let mut values = empty(buffer, elements)?;
    values.resize(elements, value);
    Ok(values)
}

pub(super) fn collect_exact<T>(
    buffer: &'static str,
    values: impl ExactSizeIterator<Item = T>,
) -> Result<Vec<T>, AnalyticError> {
    let elements = values.len();
    let mut collected = empty(buffer, elements)?;
    collected.extend(values);
    Ok(collected)
}

#[cfg(test)]
mod tests {
    use super::empty;
    use crate::salt::analytic::AnalyticError;

    #[test]
    fn impossible_allocation_fails_without_panicking() {
        assert_matches!(
            empty::<u64>("impossible", usize::MAX),
            Err(AnalyticError::Allocation {
                buffer: "impossible",
                elements: usize::MAX
            })
        ));
    }
}
