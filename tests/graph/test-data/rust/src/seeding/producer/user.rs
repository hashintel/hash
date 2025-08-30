use core::error::Error;

use error_stack::{Report, ResultExt as _};
use hash_graph_store::account::CreateUserActorParams;
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
#[serde(rename_all = "camelCase", deny_unknown_fields)]
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

impl From<UserCreation> for CreateUserActorParams {
    fn from(user: UserCreation) -> Self {
        Self {
            user_id: Some(user.id.into()),
            shortname: Some(user.shortname),
            registration_complete: user.registration_complete,
        }
    }
}

impl Producer<UserCreation> for UserProducer {
    type Error = Report<UserProducerConfigError>;

    const ID: ProducerId = ProducerId::User;

    fn generate(&mut self, context: ProduceContext) -> Result<UserCreation, Self::Error> {
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
    use alloc::sync::Arc;
    use core::fmt::Debug;

    use type_system::principal::actor_group::WebId;

    use super::*;
    use crate::seeding::{
        context::{Provenance, RunId, ShardId, StageId},
        producer::{
            ProducerExt as _, ontology::WebCatalog, tests::assert_producer_is_deterministic,
        },
    };

    pub(crate) fn sample_user_producer_config() -> UserProducerConfig {
        UserProducerConfig {
            registration_complete: BooleanDistributionConfig::Ratio {
                numerator: 9,
                denominator: 10,
            },
        }
    }

    pub(crate) fn create_test_user_web_catalog() -> impl WebCatalog + Debug {
        #[derive(Debug)]
        struct TestCatalog(Arc<str>, Vec<(Arc<str>, WebId)>);

        impl WebCatalog for TestCatalog {
            fn len(&self) -> usize {
                self.1.len()
            }

            fn get_entry(&self, index: usize) -> Option<(Arc<str>, Arc<str>, WebId)> {
                self.1
                    .get(index)
                    .cloned()
                    .map(|(shortname, web_id)| (Arc::clone(&self.0), shortname, web_id))
            }
        }

        let users = sample_user_producer_config()
            .create_producer()
            .expect("should build user producer")
            .iter_mut(ProduceContext {
                run_id: RunId::new(1),
                stage_id: StageId::new(0),
                shard_id: ShardId::new(0),
                provenance: Provenance::Integration,
                producer: ProducerId::User,
            })
            .take(100)
            .map(|result| {
                result.map(|user| (Arc::<str>::from(user.shortname), WebId::from(user.id)))
            })
            .collect::<Result<Vec<_>, _>>()
            .expect("should generate users");

        TestCatalog(Arc::<str>::from("https://example.org"), users)
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
