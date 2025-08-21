use core::error::Error;

use error_stack::{Report, ResultExt as _};
use rand::distr::Distribution as _;
use type_system::{self, principal::actor::UserId};

use super::Producer;
use crate::seeding::{
    context::{LocalId, ProduceContext, ProducerId, Scope, SubScope},
    distributions::{
        DistributionConfig as _,
        adaptors::{BooleanDistribution, BooleanDistributionConfig},
    },
};

#[derive(Debug, derive_more::Display)]
#[display("Invalid {_variant} distribution")]
pub enum UserProducerConfigError {
    #[display("registration complete")]
    RegistrationComplete,
}

impl Error for UserProducerConfigError {}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct UserProducerConfig {
    pub registration_complete: BooleanDistributionConfig,
}

impl UserProducerConfig {
    /// Create a user producer from the configuration.
    ///
    /// # Errors
    ///
    /// Returns an error if the producer cannot be created.
    pub fn create_producer(&self) -> Result<UserProducer, Report<[UserProducerConfigError]>> {
        let registration_complete = self
            .registration_complete
            .create_distribution()
            .change_context(UserProducerConfigError::RegistrationComplete)?;

        Ok(UserProducer {
            local_id: LocalId::default(),
            registration_complete,
        })
    }
}

#[derive(Debug)]
pub struct UserProducer {
    local_id: LocalId,
    registration_complete: BooleanDistribution,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct UserCreation {
    pub id: UserId,
    pub shortname: String,
    pub registration_complete: bool,
}

impl Producer<UserCreation> for UserProducer {
    type Error = Report<UserProducerConfigError>;

    const ID: ProducerId = ProducerId::User;

    fn generate(&mut self, context: &ProduceContext) -> Result<UserCreation, Self::Error> {
        let local_id = self.local_id.take_and_advance();

        let id_gid = context.global_id(local_id, Scope::Id, SubScope::Unknown);
        let user_id = UserId::new(id_gid.encode());
        let shortname = format!("user-{:X}-{:X}", id_gid.shard_id, id_gid.local_id);

        let registration_gid = context.global_id(local_id, Scope::Registration, SubScope::Unknown);
        let registration_complete = self
            .registration_complete
            .sample(&mut registration_gid.rng());

        Ok(UserCreation {
            id: user_id,
            shortname,
            registration_complete,
        })
    }
}

#[cfg(test)]
pub(crate) mod tests {

    use super::*;
    use crate::seeding::producer::tests::assert_producer_is_deterministic;

    pub(crate) fn sample_user_producer_config() -> UserProducerConfig {
        UserProducerConfig {
            registration_complete: BooleanDistributionConfig::Ratio {
                numerator: 9,
                denominator: 10,
            },
        }
    }

    #[test]
    fn deterministic_user_producer() {
        let config = sample_user_producer_config();
        let make_producer = || {
            config
                .create_producer()
                .expect("should be able to sample user producer")
        };
        assert_producer_is_deterministic(make_producer);
    }
}
