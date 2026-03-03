use core::error::Error;

use error_stack::{Report, ResultExt as _};
use rand::{Rng, distr::Distribution};
use type_system::ontology::json_schema::StringFormat;

use crate::seeding::distributions::{
    DistributionConfig,
    adaptors::{
        ConstDistribution, ConstDistributionConfig, ConstInlineDistributionConfig,
        OptionalDistribution, OptionalDistributionConfig, UniformDistribution,
        UniformDistributionConfig, WeightedDistribution, WeightedDistributionConfig,
    },
};

#[derive(Debug, Clone, PartialEq)]
enum InnerFormatDistribution {
    Const(OptionalDistribution<ConstDistribution<StringFormat>>),
    Weighted(OptionalDistribution<WeightedDistribution<ConstDistribution<StringFormat>>>),
    Uniform(OptionalDistribution<UniformDistribution<ConstDistribution<StringFormat>>>),
}

#[derive(Debug, Clone, PartialEq)]
pub struct FormatDistribution {
    distribution: InnerFormatDistribution,
}

#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase", tag = "type", deny_unknown_fields)]
pub enum FormatDistributionConfig {
    Const(OptionalDistributionConfig<ConstDistributionConfig<StringFormat>>),
    Weighted(
        OptionalDistributionConfig<
            WeightedDistributionConfig<ConstDistributionConfig<StringFormat>>,
        >,
    ),
    Uniform(
        OptionalDistributionConfig<
            UniformDistributionConfig<ConstInlineDistributionConfig<StringFormat>>,
        >,
    ),
}

#[derive(Debug, derive_more::Display)]
#[display("Invalid format distribution config")]
pub struct FormatDistributionConfigError;

impl Error for FormatDistributionConfigError {}

impl DistributionConfig for FormatDistributionConfig {
    type Distribution = FormatDistribution;
    type Error = Report<FormatDistributionConfigError>;

    fn create_distribution(&self) -> Result<Self::Distribution, Self::Error> {
        Ok(FormatDistribution {
            distribution: match self {
                Self::Const(config) => InnerFormatDistribution::Const(
                    config
                        .create_distribution()
                        .change_context(FormatDistributionConfigError)?,
                ),
                Self::Weighted(config) => InnerFormatDistribution::Weighted(
                    config
                        .create_distribution()
                        .change_context(FormatDistributionConfigError)?,
                ),
                Self::Uniform(config) => InnerFormatDistribution::Uniform(
                    config
                        .create_distribution()
                        .change_context(FormatDistributionConfigError)?,
                ),
            },
        })
    }
}

impl Distribution<Option<StringFormat>> for FormatDistribution {
    fn sample<R: Rng + ?Sized>(&self, rng: &mut R) -> Option<StringFormat> {
        match &self.distribution {
            InnerFormatDistribution::Const(distribution) => distribution.sample(rng),
            InnerFormatDistribution::Weighted(distribution) => distribution.sample(rng),
            InnerFormatDistribution::Uniform(distribution) => distribution.sample(rng),
        }
    }
}

#[cfg(test)]
mod tests {
    use serde::Deserialize as _;
    use serde_json::json;

    use super::*;

    #[test]
    fn const_format_distribution() -> Result<(), Box<dyn Error>> {
        FormatDistributionConfig::deserialize(json!({
            "type": "const",
            "value": "email",
        }))?
        .create_distribution()?;

        FormatDistributionConfig::deserialize(json!({
            "type": "const",
            "value": "email",
            "probability": 0.5,
        }))?
        .create_distribution()?;

        Ok(())
    }

    #[test]
    fn weighted_list_format_distribution() -> Result<(), Box<dyn Error>> {
        FormatDistributionConfig::deserialize(json!({
            "type": "weighted",
            "probability": 0.5,
            "weights": [
                {
                    "weight": 1,
                    "distribution": {
                        "type": "const",
                        "value": "email",
                    },
                },
                {
                    "weight": 1,
                    "distribution": {
                        "type": "const",
                        "value": "uri",
                    },
                }
            ]
        }))?
        .create_distribution()?;

        Ok(())
    }

    #[test]
    fn uniform_list_format_distribution() -> Result<(), Box<dyn Error>> {
        FormatDistributionConfig::deserialize(json!({
            "type": "uniform",
            "probability": 0.5,
            "distributions": ["email", "uri"],
        }))?
        .create_distribution()?;

        Ok(())
    }
}
