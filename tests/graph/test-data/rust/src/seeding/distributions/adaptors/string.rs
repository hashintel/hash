use core::error::Error;

use error_stack::{Report, ResultExt as _};
use rand::{
    Rng,
    distr::{Alphabetic, Distribution},
};
use rand_distr::Uniform;

use crate::seeding::distributions::DistributionConfig;

#[derive(Debug, Copy, Clone)]
pub struct WordDistribution {
    length: Uniform<usize>,
    alphabet: Alphabetic,
}

impl Distribution<String> for WordDistribution {
    fn sample<R: Rng + ?Sized>(&self, rng: &mut R) -> String {
        let length = self.length.sample(rng);
        String::from_utf8(self.alphabet.sample_iter(rng).take(length).collect())
            .expect("should be able to convert chars to string")
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase", tag = "type")]
pub struct WordDistributionConfig {
    pub length: (usize, usize),
}

#[derive(Debug, derive_more::Display)]
#[display("Invalid {_variant} in word distribution")]
pub enum InvalidWordDistributionConfig {
    #[display("length")]
    Length,
}

impl Error for InvalidWordDistributionConfig {}

impl DistributionConfig for WordDistributionConfig {
    type Distribution = WordDistribution;
    type Error = Report<InvalidWordDistributionConfig>;

    fn create_distribution(&self) -> Result<Self::Distribution, Self::Error> {
        Ok(WordDistribution {
            length: Uniform::new_inclusive(self.length.0, self.length.1)
                .change_context(InvalidWordDistributionConfig::Length)?,
            alphabet: Alphabetic,
        })
    }
}
