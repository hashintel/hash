mod format;
mod length;
mod pattern;

use core::error::Error;

use error_stack::{Report, ResultExt as _, TryReportTupleExt as _};
use rand::Rng;
use rand_distr::Distribution;
use type_system::ontology::json_schema::StringConstraints;

pub use self::{
    format::{FormatDistribution, FormatDistributionConfig, FormatDistributionConfigError},
    length::{
        LengthBounds, MaxLengthDistribution, MaxLengthDistributionConfig,
        MaxLengthDistributionConfigError, MinLengthDistribution, MinLengthDistributionConfig,
        MinLengthDistributionConfigError, MinMaxLengthDistribution,
    },
    pattern::{
        PatternDistribution, PatternDistributionConfig, PatternDistributionConfigError,
        RegexDistributionConfig, RegexInlineDistributionConfig,
    },
};
use crate::seeding::distributions::DistributionConfig;

/// Configuration for sampling fields of [`StringConstraints`].
///
/// [`StringConstraints`]: type_system::ontology::json_schema::StringConstraints
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct StringConstraintsDistributionConfig {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub min_length: Option<MinLengthDistributionConfig>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max_length: Option<MaxLengthDistributionConfig>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pattern: Option<PatternDistributionConfig>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub format: Option<FormatDistributionConfig>,
}

#[derive(Debug, derive_more::Display)]
#[display("Invalid {_variant} distribution")]
pub enum StringConstraintsDistributionConfigError {
    #[display("min length")]
    MinLength,

    #[display("max length")]
    MaxLength,

    #[display("pattern")]
    Pattern,

    #[display("format")]
    Format,
}

impl Error for StringConstraintsDistributionConfigError {}

#[derive(Debug, Clone)]
pub struct StringConstraintsDistribution {
    pub min_max_length: MinMaxLengthDistribution,
    pub pattern: Option<PatternDistribution>,
    pub format: Option<FormatDistribution>,
}

impl DistributionConfig for StringConstraintsDistributionConfig {
    type Distribution = StringConstraintsDistribution;
    type Error = Report<[StringConstraintsDistributionConfigError]>;

    fn create_distribution(&self) -> Result<Self::Distribution, Self::Error> {
        let min_length = self
            .min_length
            .as_ref()
            .map(MinLengthDistribution::new)
            .transpose()
            .change_context(StringConstraintsDistributionConfigError::MinLength);

        let max_length = self
            .max_length
            .as_ref()
            .map(MaxLengthDistribution::new)
            .transpose()
            .change_context(StringConstraintsDistributionConfigError::MaxLength);

        let pattern = self
            .pattern
            .as_ref()
            .map(PatternDistributionConfig::create_distribution)
            .transpose()
            .change_context(StringConstraintsDistributionConfigError::Pattern);

        let format = self
            .format
            .as_ref()
            .map(FormatDistributionConfig::create_distribution)
            .transpose()
            .change_context(StringConstraintsDistributionConfigError::Format);

        let (min_length, max_length, pattern, format) =
            (min_length, max_length, pattern, format).try_collect()?;

        Ok(StringConstraintsDistribution {
            min_max_length: MinMaxLengthDistribution {
                min: min_length,
                max: max_length,
            },
            pattern,
            format,
        })
    }
}

impl Distribution<StringConstraints> for StringConstraintsDistribution {
    fn sample<R: Rng + ?Sized>(&self, rng: &mut R) -> StringConstraints {
        let length = self.min_max_length.sample(rng);

        StringConstraints {
            min_length: length.min,
            max_length: length.max,
            pattern: self.pattern.as_ref().and_then(|dist| dist.sample(rng)),
            format: self.format.as_ref().and_then(|dist| dist.sample(rng)),
        }
    }
}
