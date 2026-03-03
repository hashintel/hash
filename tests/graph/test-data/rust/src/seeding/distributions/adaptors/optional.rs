use core::error::Error;

use error_stack::{Report, ResultExt as _, TryReportTupleExt as _};
use rand::Rng;
use rand_distr::{Bernoulli, Distribution};

use crate::seeding::distributions::DistributionConfig;

#[derive(Debug, Copy, Clone, PartialEq)]
pub struct OptionalDistribution<D> {
    coin: Option<Bernoulli>,
    distribution: D,
}

impl<D, T> Distribution<Option<T>> for OptionalDistribution<D>
where
    D: Distribution<T>,
{
    fn sample<R: Rng + ?Sized>(&self, rng: &mut R) -> Option<T> {
        self.coin
            .is_none_or(|coin| coin.sample(rng))
            .then(|| self.distribution.sample(rng))
    }
}

#[derive(Debug, Copy, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct OptionalDistributionConfig<D> {
    #[serde(with = "hash_codec::serde::probability::option", default)]
    pub probability: Option<f64>,
    #[serde(flatten)]
    pub distribution: D,
}

#[derive(Debug, derive_more::Display)]
pub enum OptionalDistributionConfigError {
    #[display("Invalid probability")]
    Probability,

    #[display("Optional distribution could not be created")]
    Distribution,
}

impl Error for OptionalDistributionConfigError {}

impl<D> DistributionConfig for OptionalDistributionConfig<D>
where
    D: DistributionConfig,
{
    type Distribution = OptionalDistribution<D::Distribution>;
    type Error = Report<[OptionalDistributionConfigError]>;

    fn create_distribution(&self) -> Result<Self::Distribution, Self::Error> {
        let coin = self
            .probability
            .map(Bernoulli::new)
            .transpose()
            .change_context(OptionalDistributionConfigError::Probability);

        let distribution = self
            .distribution
            .create_distribution()
            .change_context(OptionalDistributionConfigError::Distribution);

        let (coin, distribution) = (coin, distribution).try_collect()?;

        Ok(OptionalDistribution { coin, distribution })
    }
}
