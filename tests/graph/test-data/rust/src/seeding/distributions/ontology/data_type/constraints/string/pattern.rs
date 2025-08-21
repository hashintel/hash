use alloc::sync::Arc;
use core::error::Error;

use error_stack::{Report, ResultExt as _};
use rand::{Rng, distr::Distribution};
use regex::Regex;

use crate::seeding::distributions::{
    DistributionConfig,
    adaptors::{
        ConstDistribution, OptionalDistribution, OptionalDistributionConfig, UniformDistribution,
        UniformDistributionConfig, WeightedDistribution, WeightedDistributionConfig,
    },
};

#[derive(Debug, Clone)]
enum InnerPatternDistribution {
    Const(OptionalDistribution<ConstDistribution<Regex>>),
    Weighted(OptionalDistribution<WeightedDistribution<ConstDistribution<Regex>>>),
    Uniform(OptionalDistribution<UniformDistribution<ConstDistribution<Regex>>>),
}

#[derive(Debug, Clone)]
pub struct PatternDistribution {
    distribution: InnerPatternDistribution,
}

#[derive(Debug, Default, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct RegexDistributionConfig {
    pub value: Arc<str>,
}

impl DistributionConfig for RegexDistributionConfig {
    type Distribution = ConstDistribution<Regex>;
    type Error = Report<regex::Error>;

    fn create_distribution(&self) -> Result<Self::Distribution, Self::Error> {
        Ok(ConstDistribution::new(Regex::new(self.value.as_ref())?))
    }
}

#[derive(Debug, Default, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(transparent)]
pub struct RegexInlineDistributionConfig {
    pub value: Arc<str>,
}

impl DistributionConfig for RegexInlineDistributionConfig {
    type Distribution = ConstDistribution<Regex>;
    type Error = Report<regex::Error>;

    fn create_distribution(&self) -> Result<Self::Distribution, Self::Error> {
        Ok(ConstDistribution::new(Regex::new(self.value.as_ref())?))
    }
}

#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase", tag = "type", deny_unknown_fields)]
pub enum PatternDistributionConfig {
    Const(OptionalDistributionConfig<RegexDistributionConfig>),
    Weighted(OptionalDistributionConfig<WeightedDistributionConfig<RegexDistributionConfig>>),
    Uniform(OptionalDistributionConfig<UniformDistributionConfig<RegexInlineDistributionConfig>>),
}

#[derive(Debug, derive_more::Display)]
#[display("Invalid pattern distribution config")]
pub struct PatternDistributionConfigError;

impl Error for PatternDistributionConfigError {}

impl DistributionConfig for PatternDistributionConfig {
    type Distribution = PatternDistribution;
    type Error = Report<PatternDistributionConfigError>;

    fn create_distribution(&self) -> Result<PatternDistribution, Self::Error> {
        Ok(PatternDistribution {
            distribution: match self {
                Self::Const(config) => InnerPatternDistribution::Const(
                    config
                        .create_distribution()
                        .change_context(PatternDistributionConfigError)?,
                ),
                Self::Weighted(config) => InnerPatternDistribution::Weighted(
                    config
                        .create_distribution()
                        .change_context(PatternDistributionConfigError)?,
                ),
                Self::Uniform(config) => InnerPatternDistribution::Uniform(
                    config
                        .create_distribution()
                        .change_context(PatternDistributionConfigError)?,
                ),
            },
        })
    }
}

impl Distribution<Option<Regex>> for PatternDistribution {
    fn sample<R: Rng + ?Sized>(&self, rng: &mut R) -> Option<Regex> {
        match &self.distribution {
            InnerPatternDistribution::Const(distribution) => distribution.sample(rng),
            InnerPatternDistribution::Weighted(distribution) => distribution.sample(rng),
            InnerPatternDistribution::Uniform(distribution) => distribution.sample(rng),
        }
    }
}

#[cfg(test)]
mod tests {
    use serde::Deserialize as _;
    use serde_json::json;

    use super::*;

    #[test]
    fn const_pattern_distribution() -> Result<(), Box<dyn Error>> {
        PatternDistributionConfig::deserialize(json!({
            "type": "const",
            "value": "[a-z]+",
        }))?
        .create_distribution()?;

        PatternDistributionConfig::deserialize(json!({
            "type": "const",
            "value": "[a-z]+",
            "probability": 0.5,
        }))?
        .create_distribution()?;

        Ok(())
    }

    #[test]
    fn weighted_list_pattern_distribution() -> Result<(), Box<dyn Error>> {
        PatternDistributionConfig::deserialize(json!({
            "type": "weighted",
            "probability": 0.5,
            "weights": [
                {
                    "weight": 1,
                    "distribution": {
                        "type": "const",
                        "value": "[a-z]+",
                    },
                },
                {
                    "weight": 1,
                    "distribution": {
                        "type": "const",
                        "value": "[A-Z]+",
                    },
                }
            ]
        }))?
        .create_distribution()?;

        Ok(())
    }

    #[test]
    fn uniform_list_pattern_distribution() -> Result<(), Box<dyn Error>> {
        PatternDistributionConfig::deserialize(json!({
            "type": "uniform",
            "probability": 0.5,
            "distributions": ["[a-z]+", "[A-Z]+"],
        }))?
        .create_distribution()?;

        Ok(())
    }
}
