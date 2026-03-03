use alloc::sync::Arc;
use core::error::Error;

use error_stack::{Report, ResultExt as _};
use rand::{Rng, distr::Distribution};

use crate::seeding::distributions::{
    DistributionConfig,
    adaptors::{
        ConstDistribution, ConstDistributionConfig, ConstInlineDistributionConfig,
        UniformDistribution, UniformDistributionConfig, WeightedDistribution,
        WeightedDistributionConfig,
    },
};

#[derive(Debug, Clone, PartialEq)]
enum InnerShortnameDistribution {
    Const(ConstDistribution<Arc<str>>),
    Weighted(WeightedDistribution<ConstDistribution<Arc<str>>>),
    Uniform(UniformDistribution<ConstDistribution<Arc<str>>>),
}

#[derive(Debug, Clone, PartialEq)]
pub struct ShortnameDistribution {
    distribution: InnerShortnameDistribution,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase", tag = "type", deny_unknown_fields)]
pub enum ShortnameDistributionConfig {
    Const(ConstDistributionConfig<Arc<str>>),
    Weighted(WeightedDistributionConfig<ConstDistributionConfig<Arc<str>>>),
    Uniform(UniformDistributionConfig<ConstInlineDistributionConfig<Arc<str>>>),
}

#[derive(Debug, derive_more::Display)]
#[display("Invalid shortname distribution config")]
pub struct ShortnameDistributionConfigError;

impl Error for ShortnameDistributionConfigError {}

impl DistributionConfig for ShortnameDistributionConfig {
    type Distribution = ShortnameDistribution;
    type Error = Report<ShortnameDistributionConfigError>;

    fn create_distribution(&self) -> Result<Self::Distribution, Self::Error> {
        Ok(ShortnameDistribution {
            distribution: match self {
                Self::Const(config) => InnerShortnameDistribution::Const(
                    config
                        .create_distribution()
                        .change_context(ShortnameDistributionConfigError)?,
                ),
                Self::Weighted(config) => InnerShortnameDistribution::Weighted(
                    config
                        .create_distribution()
                        .change_context(ShortnameDistributionConfigError)?,
                ),
                Self::Uniform(config) => InnerShortnameDistribution::Uniform(
                    config
                        .create_distribution()
                        .change_context(ShortnameDistributionConfigError)?,
                ),
            },
        })
    }
}

impl Distribution<Arc<str>> for ShortnameDistribution {
    fn sample<R: Rng + ?Sized>(&self, rng: &mut R) -> Arc<str> {
        match &self.distribution {
            InnerShortnameDistribution::Const(distribution) => distribution.sample(rng),
            InnerShortnameDistribution::Weighted(distribution) => distribution.sample(rng),
            InnerShortnameDistribution::Uniform(distribution) => distribution.sample(rng),
        }
    }
}

#[cfg(test)]
mod tests {
    use serde::Deserialize as _;
    use serde_json::json;

    use super::*;

    #[test]
    fn const_shortname_distribution() -> Result<(), Box<dyn Error>> {
        ShortnameDistributionConfig::deserialize(json!({
            "type": "const",
            "value": "hash",
        }))?
        .create_distribution()?;

        Ok(())
    }

    #[test]
    fn weighted_list_shortname_distribution() -> Result<(), Box<dyn Error>> {
        ShortnameDistributionConfig::deserialize(json!({
            "type": "weighted",
            "weights": [
                {
                    "weight": 1,
                    "distribution": {
                        "type": "const",
                        "value": "alice",
                    },
                },
                {
                    "weight": 2,
                    "distribution": {
                        "type": "const",
                        "value": "bob",
                    },
                }
            ]
        }))?
        .create_distribution()?;

        Ok(())
    }

    #[test]
    fn uniform_list_shortname_distribution() -> Result<(), Box<dyn Error>> {
        ShortnameDistributionConfig::deserialize(json!({
            "type": "uniform",
            "distributions": ["alice", "bob"],
        }))?
        .create_distribution()?;

        Ok(())
    }
}
