use core::fmt;

use crate::store::postgres::query::Transpile;

/// Sampling method for TABLESAMPLE clause.
///
/// PostgreSQL supports two standard sampling methods:
/// - BERNOULLI: Row-level sampling where each row has an independent probability of selection
/// - SYSTEM: Page-level sampling that selects entire table blocks (faster but less random)
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum SamplingMethod {
    /// BERNOULLI sampling: each row independently selected with given probability.
    ///
    /// More random but slower as it must scan the entire table. Each row has exactly
    /// the specified probability of being included in the sample.
    ///
    /// Use when you need true random sampling for statistical analysis.
    Bernoulli,

    /// SYSTEM sampling: selects random table blocks (8KB pages).
    ///
    /// Much faster than BERNOULLI as it samples at the block level rather than row level.
    /// Less random because all rows in a selected block are included.
    ///
    /// Use when speed is more important than perfect randomness, or for quick exploration
    /// of large tables.
    System,
}

impl Transpile for SamplingMethod {
    fn transpile(&self, fmt: &mut fmt::Formatter) -> fmt::Result {
        match self {
            Self::Bernoulli => fmt.write_str("BERNOULLI"),
            Self::System => fmt.write_str("SYSTEM"),
        }
    }
}

/// TABLESAMPLE clause for sampling a subset of table rows.
///
/// Useful for quick data exploration, testing queries on large tables, and statistical analysis.
///
/// # Examples
///
/// ```sql
/// -- Sample approximately 10% of rows using BERNOULLI method
/// SELECT * FROM users TABLESAMPLE BERNOULLI(10);
///
/// -- Sample approximately 5% of blocks using SYSTEM method (faster)
/// SELECT * FROM events TABLESAMPLE SYSTEM(5);
///
/// -- Reproducible sample with seed value
/// SELECT * FROM orders TABLESAMPLE BERNOULLI(1) REPEATABLE(42);
/// ```
///
/// # Transpilation
///
/// Transpiles to: `TABLESAMPLE method(percentage) [ REPEATABLE(seed) ]`.
#[derive(Debug, Copy, Clone, PartialEq)]
pub struct TableSample {
    /// The sampling method to use (BERNOULLI or SYSTEM).
    pub method: SamplingMethod,

    /// Percentage of rows (BERNOULLI) or blocks (SYSTEM) to sample.
    ///
    /// Valid range is 0.0 to 100.0. Note that the actual number of rows returned
    /// may vary, especially with SYSTEM sampling.
    pub percentage: f64,

    /// Optional seed for reproducible sampling.
    ///
    /// When `Some`, the same seed will produce the same sample across multiple queries.
    /// The seed is an arbitrary integer value that initializes the random number generator.
    ///
    /// Useful for:
    /// - Reproducible testing and debugging
    /// - Creating consistent train/validation splits
    /// - Comparing query results across runs
    pub repeatable_seed: Option<i64>,
}

impl Transpile for TableSample {
    fn transpile(&self, fmt: &mut fmt::Formatter) -> fmt::Result {
        fmt.write_str("TABLESAMPLE ")?;
        self.method.transpile(fmt)?;
        write!(fmt, "({})", self.percentage)?;

        if let Some(seed) = self.repeatable_seed {
            write!(fmt, " REPEATABLE({seed})")?;
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn transpile_bernoulli_sampling() {
        let sample = TableSample {
            method: SamplingMethod::Bernoulli,
            percentage: 10.0,
            repeatable_seed: None,
        };

        assert_eq!(sample.transpile_to_string(), "TABLESAMPLE BERNOULLI(10)");
    }

    #[test]
    fn transpile_system_sampling() {
        let sample = TableSample {
            method: SamplingMethod::System,
            percentage: 5.0,
            repeatable_seed: None,
        };

        assert_eq!(sample.transpile_to_string(), "TABLESAMPLE SYSTEM(5)");
    }

    #[test]
    fn transpile_with_repeatable_seed() {
        let sample = TableSample {
            method: SamplingMethod::Bernoulli,
            percentage: 1.0,
            repeatable_seed: Some(42),
        };

        assert_eq!(
            sample.transpile_to_string(),
            "TABLESAMPLE BERNOULLI(1) REPEATABLE(42)"
        );
    }

    #[test]
    fn transpile_system_with_seed() {
        let sample = TableSample {
            method: SamplingMethod::System,
            percentage: 2.5,
            repeatable_seed: Some(123),
        };

        assert_eq!(
            sample.transpile_to_string(),
            "TABLESAMPLE SYSTEM(2.5) REPEATABLE(123)"
        );
    }

    #[test]
    fn transpile_sampling_method_bernoulli() {
        assert_eq!(SamplingMethod::Bernoulli.transpile_to_string(), "BERNOULLI");
    }

    #[test]
    fn transpile_sampling_method_system() {
        assert_eq!(SamplingMethod::System.transpile_to_string(), "SYSTEM");
    }
}
