use core::error::Error;

use error_stack::{Report, ReportSink, ResultExt as _};
use rand::Rng;
use rand_distr::{Bernoulli, Distribution, Uniform};

#[derive(Debug, Default, Copy, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MinLengthDistributionConfig {
    /// Probability (0.0–1.0) that [`StringConstraints::min_length`] will be set.
    ///
    /// [`StringConstraints::min_length`]: type_system::ontology::json_schema::StringConstraints::min_length
    #[serde(with = "hash_codec::serde::probability")]
    pub probability: f64,

    /// Inclusive range to sample [`StringConstraints::min_length`] from.
    ///
    /// [`StringConstraints::min_length`]: type_system::ontology::json_schema::StringConstraints::min_length
    pub range: (usize, usize),
}

#[derive(Debug, derive_more::Display)]
pub enum MinLengthDistributionConfigError {
    #[display("Invalid probability")]
    Probability,

    #[display("Invalid range")]
    Range,
}

impl Error for MinLengthDistributionConfigError {}

#[derive(Debug, Copy, Clone, PartialEq)]
pub struct MinLengthDistribution {
    probability: Bernoulli,
    range: Uniform<usize>,
}

impl MinLengthDistribution {
    /// Creates a distribution that samples a [`StringConstraints::min_length`] or `None`.
    ///
    /// [`StringConstraints::min_length`]: type_system::ontology::json_schema::StringConstraints::min_length
    ///
    /// # Errors
    ///
    /// Returns a [`Report`] containing all errors encountered while creating the distribution.
    pub fn new(
        config: &MinLengthDistributionConfig,
    ) -> Result<Self, Report<[MinLengthDistributionConfigError]>> {
        let mut sink = ReportSink::new();

        let probability = sink.attempt(
            Bernoulli::new(config.probability)
                .change_context(MinLengthDistributionConfigError::Probability),
        );

        let range = sink.attempt(
            Uniform::new_inclusive(config.range.0, config.range.1)
                .change_context(MinLengthDistributionConfigError::Range),
        );

        sink.finish_with(|| Self {
            probability: probability.unwrap_or_else(|| unreachable!("validated by sink")),
            range: range.unwrap_or_else(|| unreachable!("validated by sink")),
        })
    }
}

impl Distribution<Option<usize>> for MinLengthDistribution {
    fn sample<R: Rng + ?Sized>(&self, rng: &mut R) -> Option<usize> {
        self.probability.sample(rng).then(|| self.range.sample(rng))
    }
}

#[derive(Debug, Default, Copy, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MaxLengthDistributionConfig {
    /// Probability (0.0–1.0) that [`StringConstraints::max_length`] will be set.
    ///
    /// [`StringConstraints::max_length`]: type_system::ontology::json_schema::StringConstraints::max_length
    #[serde(with = "hash_codec::serde::probability")]
    pub probability: f64,

    /// Additive inclusive offset range applied when [`StringConstraints::min_length`] exists.
    ///
    /// If present and `min_length` was generated, then
    /// `max_length = min_length + U[offset.0, offset.1]` (inclusive).
    ///
    /// At least one of `offset` or [`range`] must be set.
    ///
    /// [`range`]: MaxLengthDistributionConfig::range
    /// [`StringConstraints::min_length`]: type_system::ontology::json_schema::StringConstraints::min_length
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub offset: Option<(usize, usize)>,

    /// Absolute inclusive range to sample [`StringConstraints::max_length`] when
    /// `min_length` is not generated or `offset` is not applicable.
    ///
    /// At least one of [`offset`] or `range` must be set.
    ///
    /// [`offset`]: MaxLengthDistributionConfig::offset
    /// [`StringConstraints::max_length`]: type_system::ontology::json_schema::StringConstraints::max_length
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub range: Option<(usize, usize)>,
}

#[derive(Debug, derive_more::Display)]
pub enum MaxLengthDistributionConfigError {
    #[display("Invalid probability")]
    InvalidProbability,

    #[display("Invalid offset")]
    InvalidOffset,

    #[display("Invalid range")]
    InvalidRange,

    #[display("Missing range or offset")]
    MissingRangeOrOffset,
}

impl Error for MaxLengthDistributionConfigError {}

#[derive(Debug, Copy, Clone, PartialEq)]
enum MaxLengthRange {
    Absolute(Uniform<usize>),
    Offset(Uniform<usize>),
    Both {
        offset: Uniform<usize>,
        absolute: Uniform<usize>,
    },
}

#[derive(Debug, Copy, Clone, PartialEq)]
pub struct MaxLengthDistribution {
    probability: Bernoulli,
    distribution: MaxLengthRange,
}

impl MaxLengthDistribution {
    /// Creates a distribution that samples a [`StringConstraints::max_length`] or `None`.
    ///
    /// [`StringConstraints::max_length`]: type_system::ontology::json_schema::StringConstraints::max_length
    ///
    /// # Errors
    ///
    /// Returns a [`Report`] containing all errors encountered while creating the distribution.
    pub fn new(
        config: &MaxLengthDistributionConfig,
    ) -> Result<Self, Report<[MaxLengthDistributionConfigError]>> {
        let mut sink = ReportSink::new();

        let probability = sink.attempt(
            Bernoulli::new(config.probability)
                .change_context(MaxLengthDistributionConfigError::InvalidProbability),
        );

        let offset = config.offset.and_then(|(low, high)| {
            sink.attempt(
                Uniform::new_inclusive(low, high)
                    .change_context(MaxLengthDistributionConfigError::InvalidOffset),
            )
        });

        let range = config.range.and_then(|(low, high)| {
            sink.attempt(
                Uniform::new_inclusive(low, high)
                    .change_context(MaxLengthDistributionConfigError::InvalidRange),
            )
        });

        if offset.is_none() && range.is_none() {
            sink.capture(MaxLengthDistributionConfigError::MissingRangeOrOffset);
        }

        sink.finish_with(|| Self {
            probability: probability.unwrap_or_else(|| unreachable!("validated by sink")),
            distribution: match (offset, range) {
                (Some(offset), Some(absolute)) => MaxLengthRange::Both { offset, absolute },
                (Some(offset), None) => MaxLengthRange::Offset(offset),
                (None, Some(range)) => MaxLengthRange::Absolute(range),
                (None, None) => unreachable!("validated by sink"),
            },
        })
    }
}

#[derive(Debug, Copy, Clone, PartialEq)]
pub struct MinMaxLengthDistribution {
    pub min: Option<MinLengthDistribution>,
    pub max: Option<MaxLengthDistribution>,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub struct LengthBounds {
    pub min: Option<usize>,
    pub max: Option<usize>,
}

impl Distribution<LengthBounds> for MinMaxLengthDistribution {
    fn sample<R: Rng + ?Sized>(&self, rng: &mut R) -> LengthBounds {
        let min = self.min.as_ref().and_then(|min| min.sample(rng));

        let max = self.max.as_ref().and_then(|max| {
            max.probability
                .sample(rng)
                .then(|| match (min, &max.distribution) {
                    (
                        Some(min),
                        MaxLengthRange::Both {
                            offset,
                            absolute: _,
                        }
                        | MaxLengthRange::Offset(offset),
                    ) => min.saturating_add(offset.sample(rng)),
                    (
                        None,
                        MaxLengthRange::Both {
                            offset: _,
                            absolute: range,
                        }
                        | MaxLengthRange::Offset(range),
                    )
                    | (_, MaxLengthRange::Absolute(range)) => range.sample(rng),
                })
        });

        LengthBounds { min, max }
    }
}
