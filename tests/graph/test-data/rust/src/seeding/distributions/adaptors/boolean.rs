use core::error::Error;

use error_stack::{Report, ResultExt as _};
use rand::{Rng, distr::Distribution};
use rand_distr::Bernoulli;

use crate::seeding::distributions::DistributionConfig;

#[derive(Debug, Clone)]
enum InnerBooleanDistribution {
    Const(bool),
    Probability(Bernoulli),
}

#[derive(Debug, Clone)]
pub struct BooleanDistribution {
    distribution: InnerBooleanDistribution,
}

impl Distribution<bool> for BooleanDistribution {
    fn sample<R: Rng + ?Sized>(&self, rng: &mut R) -> bool {
        match self.distribution {
            InnerBooleanDistribution::Const(value) => value,
            InnerBooleanDistribution::Probability(distribution) => distribution.sample(rng),
        }
    }
}

#[derive(Debug, Copy, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase", tag = "type", deny_unknown_fields)]
pub enum BooleanDistributionConfig {
    Const { value: bool },
    Probability { probability: f64 },
    Ratio { numerator: u32, denominator: u32 },
}

#[derive(Debug, derive_more::Display)]
#[display("Invalid {} in boolean distribution config")]
pub enum BooleanDistributionConfigError {
    #[display("probability")]
    Probability,

    #[display("ratio")]
    Ratio,
}

impl Error for BooleanDistributionConfigError {}

impl DistributionConfig for BooleanDistributionConfig {
    type Distribution = BooleanDistribution;
    type Error = Report<BooleanDistributionConfigError>;

    fn create_distribution(&self) -> Result<BooleanDistribution, Self::Error> {
        Ok(BooleanDistribution {
            distribution: match *self {
                Self::Const { value } => InnerBooleanDistribution::Const(value),
                Self::Probability { probability } => InnerBooleanDistribution::Probability(
                    Bernoulli::new(probability)
                        .change_context(BooleanDistributionConfigError::Probability)?,
                ),
                Self::Ratio {
                    numerator,
                    denominator,
                } => InnerBooleanDistribution::Probability(
                    Bernoulli::from_ratio(numerator, denominator)
                        .change_context(BooleanDistributionConfigError::Ratio)?,
                ),
            },
        })
    }
}

#[cfg(test)]
mod tests {
    use serde::Deserialize as _;
    use serde_json::json;

    use super::*;

    #[test]
    fn const_boolean_distribution() -> Result<(), Box<dyn Error>> {
        BooleanDistributionConfig::deserialize(json!({
            "type": "const",
            "value": true,
        }))?
        .create_distribution()?;

        Ok(())
    }

    #[test]
    fn probability_boolean_distribution() -> Result<(), Box<dyn Error>> {
        BooleanDistributionConfig::deserialize(json!({
            "type": "probability",
            "probability": 0.5,
        }))?
        .create_distribution()?;

        Ok(())
    }

    #[test]
    fn ratio_boolean_distribution() -> Result<(), Box<dyn Error>> {
        BooleanDistributionConfig::deserialize(json!({
            "type": "ratio",
            "numerator": 1,
            "denominator": 2,
        }))?
        .create_distribution()?;

        Ok(())
    }
}
