use core::error::Error;

use error_stack::{Report, ResultExt as _, TryReportIteratorExt as _};
use rand::Rng;
use rand_distr::{Distribution, Uniform};

use crate::seeding::distributions::DistributionConfig;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct UniformDistribution<D> {
    index: Uniform<usize>,
    distribution: Vec<D>,
}

impl<D, T> Distribution<T> for UniformDistribution<D>
where
    D: Distribution<T>,
{
    fn sample<R: Rng + ?Sized>(&self, rng: &mut R) -> T {
        self.distribution
            .get(self.index.sample(rng))
            .expect("`Uniform` should return a valid index")
            .sample(rng)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct UniformDistributionConfig<D> {
    pub distributions: Vec<D>,
}

#[derive(Debug, derive_more::Display)]
pub enum UniformDistributionConfigError {
    #[display("Uniform distribution could not be created")]
    Distribution,
}

impl Error for UniformDistributionConfigError {}

impl<D> DistributionConfig for UniformDistributionConfig<D>
where
    D: DistributionConfig,
{
    type Distribution = UniformDistribution<D::Distribution>;
    type Error = Report<[UniformDistributionConfigError]>;

    fn create_distribution(&self) -> Result<Self::Distribution, Self::Error> {
        Ok(UniformDistribution {
            index: Uniform::new(0, self.distributions.len())
                .change_context(UniformDistributionConfigError::Distribution)?,
            distribution: self
                .distributions
                .iter()
                .map(|config| {
                    config
                        .create_distribution()
                        .change_context(UniformDistributionConfigError::Distribution)
                })
                .try_collect_reports()?,
        })
    }
}
