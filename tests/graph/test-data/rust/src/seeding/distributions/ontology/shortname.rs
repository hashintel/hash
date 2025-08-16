use alloc::borrow::Cow;
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
enum InnerShortnameDistribution<'s> {
    Const(ConstDistribution<Cow<'s, str>>),
    Weighted(WeightedDistribution<ConstDistribution<Cow<'s, str>>>),
    Uniform(UniformDistribution<ConstDistribution<Cow<'s, str>>>),
}

#[derive(Debug, Clone, PartialEq)]
pub struct ShortnameDistribution<'s> {
    distribution: InnerShortnameDistribution<'s>,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase", tag = "type", deny_unknown_fields)]
pub enum ShortnameDistributionConfig<'s> {
    Const(ConstDistributionConfig<Cow<'s, str>>),
    Weighted(WeightedDistributionConfig<ConstDistributionConfig<Cow<'s, str>>>),
    Uniform(UniformDistributionConfig<ConstInlineDistributionConfig<Cow<'s, str>>>),
}

#[derive(Debug, derive_more::Display)]
#[display("Invalid shortname distribution config")]
pub struct ShortnameDistributionConfigError;

impl Error for ShortnameDistributionConfigError {}

impl<'s> DistributionConfig for ShortnameDistributionConfig<'s> {
    type Distribution = ShortnameDistribution<'s>;
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

impl<'s> Distribution<Cow<'s, str>> for ShortnameDistribution<'s> {
    fn sample<R: Rng + ?Sized>(&self, rng: &mut R) -> Cow<'s, str> {
        match &self.distribution {
            InnerShortnameDistribution::Const(distribution) => distribution.sample(rng),
            InnerShortnameDistribution::Weighted(distribution) => distribution.sample(rng),
            InnerShortnameDistribution::Uniform(distribution) => distribution.sample(rng),
        }
    }
}

#[cfg(test)]
mod tests {
    use std::assert_matches::assert_matches;

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

    #[test]
    fn borrowed_shortname() -> Result<(), Box<dyn Error>> {
        let distr = ShortnameDistributionConfig::Const(ConstDistributionConfig {
            value: Cow::Borrowed("alice"),
        })
        .create_distribution()?;

        assert_matches!(distr.sample(&mut rand::rng()), Cow::Borrowed(_));

        Ok(())
    }
}
