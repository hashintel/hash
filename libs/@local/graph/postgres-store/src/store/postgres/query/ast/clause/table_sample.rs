use core::{error::Error, fmt};

use crate::store::postgres::query::Transpile;

/// Sampling method for TABLESAMPLE clause.
///
/// PostgreSQL supports two standard sampling methods:
/// - BERNOULLI: Row-level sampling where each row has an independent probability of selection
/// - SYSTEM: Page-level sampling that selects entire table blocks (faster but less random)
#[derive(Debug, Copy, Clone, PartialEq)]
pub enum SamplingMethod {
    /// BERNOULLI sampling: each row independently selected with the given probability.
    ///
    /// More random but slower as it must scan the entire table. Each row has exactly
    /// the specified probability of being included in the sample.
    ///
    /// Use when you need true random sampling for statistical analysis.
    Bernoulli {
        /// Percentage of rows to sample; the valid range is checked by Postgres.
        percentage: SamplePercentage,
    },

    /// SYSTEM sampling: selects random table blocks (8KB pages).
    ///
    /// Much faster than BERNOULLI as it samples at the block level rather than row level.
    /// Less random because all rows in a selected block are included.
    ///
    /// Use when speed is more important than perfect randomness, or for quick exploration
    /// of large tables.
    System {
        /// Percentage of blocks to sample; the valid range is checked by Postgres.
        percentage: SamplePercentage,
    },
}

/// A finite `TABLESAMPLE` percentage argument.
///
/// Non-finite values would transpile to invalid SQL tokens (`NaN`, `inf`); the value range
/// itself is left to Postgres.
#[derive(Debug, Copy, Clone, PartialEq)]
pub struct SamplePercentage(f64);

#[derive(Debug, PartialEq, Eq, derive_more::Display)]
#[display("the sampling percentage must be finite")]
pub struct NonFinitePercentage;

impl Error for NonFinitePercentage {}

impl TryFrom<f64> for SamplePercentage {
    type Error = NonFinitePercentage;

    fn try_from(percentage: f64) -> Result<Self, Self::Error> {
        if percentage.is_finite() {
            Ok(Self(percentage))
        } else {
            Err(NonFinitePercentage)
        }
    }
}

impl fmt::Display for SamplePercentage {
    fn fmt(&self, fmt: &mut fmt::Formatter) -> fmt::Result {
        fmt::Display::fmt(&self.0, fmt)
    }
}

impl Transpile for SamplingMethod {
    fn transpile(&self, fmt: &mut fmt::Formatter) -> fmt::Result {
        match self {
            Self::Bernoulli { percentage } => write!(fmt, "BERNOULLI({percentage})"),
            Self::System { percentage } => write!(fmt, "SYSTEM({percentage})"),
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
    /// The sampling method to use, carrying its own arguments.
    pub method: SamplingMethod,

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
    fn percentage_rejects_non_finite_values() {
        for value in [f64::NAN, f64::INFINITY, f64::NEG_INFINITY] {
            assert_eq!(
                SamplePercentage::try_from(value)
                    .expect_err("non-finite percentages should be rejected"),
                NonFinitePercentage
            );
        }
    }

    #[test]
    fn transpile_bernoulli_sampling() {
        let sample = TableSample {
            method: SamplingMethod::Bernoulli {
                percentage: SamplePercentage::try_from(10.0).expect("finite"),
            },
            repeatable_seed: None,
        };

        assert_eq!(sample.transpile_to_string(), "TABLESAMPLE BERNOULLI(10)");
    }

    #[test]
    fn transpile_system_sampling() {
        let sample = TableSample {
            method: SamplingMethod::System {
                percentage: SamplePercentage::try_from(5.0).expect("finite"),
            },
            repeatable_seed: None,
        };

        assert_eq!(sample.transpile_to_string(), "TABLESAMPLE SYSTEM(5)");
    }

    #[test]
    fn transpile_with_repeatable_seed() {
        let sample = TableSample {
            method: SamplingMethod::Bernoulli {
                percentage: SamplePercentage::try_from(1.0).expect("finite"),
            },
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
            method: SamplingMethod::System {
                percentage: SamplePercentage::try_from(2.5).expect("finite"),
            },
            repeatable_seed: Some(123),
        };

        assert_eq!(
            sample.transpile_to_string(),
            "TABLESAMPLE SYSTEM(2.5) REPEATABLE(123)"
        );
    }

    #[test]
    fn transpile_sampling_method_bernoulli() {
        assert_eq!(
            SamplingMethod::Bernoulli {
                percentage: SamplePercentage::try_from(10.0).expect("finite")
            }
            .transpile_to_string(),
            "BERNOULLI(10)"
        );
    }

    #[test]
    fn transpile_sampling_method_system() {
        assert_eq!(
            SamplingMethod::System {
                percentage: SamplePercentage::try_from(2.5).expect("finite")
            }
            .transpile_to_string(),
            "SYSTEM(2.5)"
        );
    }
}
