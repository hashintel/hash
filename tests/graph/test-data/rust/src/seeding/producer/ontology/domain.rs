//! Domain policy and sampling for ontology producers.
//!
//! This module handles the domain resolution logic that determines where ontological types
//! should be hosted (remote vs local) and their ownership attribution.

use alloc::sync::Arc;
use core::error::Error;

use error_stack::{Report, ResultExt as _};
use rand::distr::weighted::WeightedIndex;
use rand_distr::Distribution;
use time::OffsetDateTime;
use type_system::principal::actor_group::WebId;

use super::WebCatalog;
use crate::seeding::distributions::ontology::{DomainDistribution, DomainDistributionConfig};

/// Domain policy allowing remote and/or local (web-catalog) sources with optional mixing.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DomainPolicy {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub remote: Option<WeightedRemoteSourceConfig>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub local: Option<WeightedLocalSourceConfig>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WeightedRemoteSourceConfig {
    pub domain: DomainDistributionConfig,
    #[serde(with = "hash_codec::serde::time")]
    pub fetched_at: OffsetDateTime,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub weight: Option<u32>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LocalSourceConfig {
    pub index: IndexSamplerConfig,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub web_type_weights: Option<LocalWebTypeWeights>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WeightedLocalSourceConfig {
    #[serde(flatten)]
    pub source: LocalSourceConfig,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub weight: Option<u32>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(tag = "sampling", rename_all = "camelCase")]
pub enum IndexSamplerConfig {
    Uniform,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LocalWebTypeWeights {
    pub user: u32,
    pub org: u32,
}

#[derive(Debug, derive_more::Display)]
pub enum DomainBindingError {
    #[display("No source configured")]
    NoSource,
    #[display("Missing web catalog for local source")]
    MissingCatalog,
    #[display("Local web catalog is empty")]
    EmptyCatalog,
    #[display("Invalid weights")]
    InvalidWeights,
    #[display("Remote config creation failed")]
    Remote,
    #[display("Local web type weights are not supported by this catalog type")]
    WebTypeWeightsUnsupported,
}

impl Error for DomainBindingError {}

/// Domain sampler types after binding to catalogs.
#[derive(Debug)]
pub enum BoundDomainSampler<U: WebCatalog, O: WebCatalog> {
    Remote {
        domain: DomainDistribution,
        fetched_at: OffsetDateTime,
    },
    Local(LocalChoiceSampler<U, O>),
    Mixed {
        chooser: WeightedIndex<u32>,
        remote: DomainDistribution,
        fetched_at: OffsetDateTime,
        local: LocalChoiceSampler<U, O>,
    },
}

/// Sampled domain information with ownership details.
#[derive(Debug)]
pub enum SampledDomain {
    Remote {
        domain: Arc<str>,
        shortname: Arc<str>,
        fetched_at: OffsetDateTime,
    },
    Local {
        domain: Arc<str>,
        shortname: Arc<str>,
        web_id: WebId,
    },
}

impl<U: WebCatalog, O: WebCatalog> Distribution<SampledDomain> for BoundDomainSampler<U, O> {
    fn sample<R: rand::Rng + ?Sized>(&self, rng: &mut R) -> SampledDomain {
        match self {
            Self::Remote { domain, fetched_at } => {
                let (domain, shortname) = domain.sample(rng);
                SampledDomain::Remote {
                    domain,
                    shortname,
                    fetched_at: *fetched_at,
                }
            }
            Self::Local(local) => {
                let (domain, shortname, web_id) = local.sample(rng);
                SampledDomain::Local {
                    domain,
                    shortname,
                    web_id,
                }
            }
            Self::Mixed {
                chooser,
                remote,
                fetched_at,
                local,
            } => {
                if chooser.sample(rng) == 0 {
                    let (domain, shortname) = remote.sample(rng);
                    SampledDomain::Remote {
                        domain,
                        shortname,
                        fetched_at: *fetched_at,
                    }
                } else {
                    let (domain, shortname, web_id) = local.sample(rng);
                    SampledDomain::Local {
                        domain,
                        shortname,
                        web_id,
                    }
                }
            }
        }
    }
}

#[derive(Clone, derive_more::Debug)]
struct LocalUniform<C: WebCatalog> {
    #[debug(skip)]
    catalog: C,
}

impl<C: WebCatalog> LocalUniform<C> {
    fn sample<R: rand::Rng + ?Sized>(&self, rng: &mut R) -> (Arc<str>, Arc<str>, WebId) {
        let count = self.catalog.len();
        let index = rand::Rng::random_range(rng, 0..count);
        let (domain, shortname, web_id) = self
            .catalog
            .get_entry(index)
            .expect("should return Some for existing index");
        (domain, shortname, web_id)
    }
}

#[derive(derive_more::Debug, Clone)]
pub struct LocalChoiceSampler<U: WebCatalog, O: WebCatalog> {
    #[debug(skip)]
    inner: LocalChoiceSamplerInner<U, O>,
}

#[derive(Clone)]
enum LocalChoiceSamplerInner<U: WebCatalog, O: WebCatalog> {
    User(LocalUniform<U>),
    Org(LocalUniform<O>),
    Mixed {
        chooser: WeightedIndex<u32>,
        user: LocalUniform<U>,
        org: LocalUniform<O>,
    },
}

impl<U: WebCatalog, O: WebCatalog> Distribution<(Arc<str>, Arc<str>, WebId)>
    for LocalChoiceSampler<U, O>
{
    fn sample<R: rand::Rng + ?Sized>(&self, rng: &mut R) -> (Arc<str>, Arc<str>, WebId) {
        match &self.inner {
            LocalChoiceSamplerInner::User(user_sampler) => user_sampler.sample(rng),
            LocalChoiceSamplerInner::Org(org_sampler) => org_sampler.sample(rng),
            LocalChoiceSamplerInner::Mixed { chooser, user, org } => match chooser.sample(rng) {
                0 => user.sample(rng),
                _ => org.sample(rng),
            },
        }
    }
}

impl LocalSourceConfig {
    /// Bind the local source config to specific catalogs to create a local choice sampler.
    ///
    /// # Errors
    ///
    /// - [`DomainBindingError::EmptyCatalog`] if all provided catalogs are empty
    /// - [`DomainBindingError::InvalidWeights`] if weight configuration is invalid
    /// - [`DomainBindingError::MissingCatalog`] if local source is configured but no catalogs
    ///   provided
    pub fn bind<U: WebCatalog, O: WebCatalog>(
        &self,
        user_catalog: Option<U>,
        org_catalog: Option<O>,
    ) -> Result<LocalChoiceSampler<U, O>, Report<DomainBindingError>> {
        let (user_sampler, org_sampler) = match self.index {
            IndexSamplerConfig::Uniform => (
                user_catalog.map(|catalog| LocalUniform { catalog }),
                org_catalog.map(|catalog| LocalUniform { catalog }),
            ),
        };

        match (user_sampler, org_sampler) {
            (Some(user), None) => {
                if user.catalog.is_empty() {
                    return Err(Report::new(DomainBindingError::EmptyCatalog));
                }
                Ok(LocalChoiceSampler {
                    inner: LocalChoiceSamplerInner::User(user),
                })
            }
            (None, Some(org)) => {
                if org.catalog.is_empty() {
                    return Err(Report::new(DomainBindingError::EmptyCatalog));
                }
                Ok(LocalChoiceSampler {
                    inner: LocalChoiceSamplerInner::Org(org),
                })
            }
            (Some(user), Some(org)) => {
                if user.catalog.is_empty() && org.catalog.is_empty() {
                    return Err(Report::new(DomainBindingError::EmptyCatalog));
                }
                if user.catalog.is_empty() {
                    return Ok(LocalChoiceSampler {
                        inner: LocalChoiceSamplerInner::Org(org),
                    });
                }
                if org.catalog.is_empty() {
                    return Ok(LocalChoiceSampler {
                        inner: LocalChoiceSamplerInner::User(user),
                    });
                }
                let weights = self
                    .web_type_weights
                    .as_ref()
                    .map_or([1, 1], |weights| [weights.user, weights.org]);

                let chooser = WeightedIndex::new(weights)
                    .change_context(DomainBindingError::InvalidWeights)?;
                Ok(LocalChoiceSampler {
                    inner: LocalChoiceSamplerInner::Mixed { chooser, user, org },
                })
            }
            _ => Err(Report::new(DomainBindingError::MissingCatalog)),
        }
    }
}

impl DomainPolicy {
    /// Bind the domain policy to specific catalogs to create a domain sampler.
    ///
    /// Takes optional user and organization catalogs and creates a bound sampler that can
    /// generate domain samples based on the policy configuration.
    ///
    /// # Errors
    ///
    /// - [`DomainBindingError::NoSource`] if neither remote nor local sources are configured
    /// - [`DomainBindingError::MissingCatalog`] if local source is configured but no catalogs
    ///   provided
    /// - [`DomainBindingError::EmptyCatalog`] if all provided catalogs are empty
    /// - [`DomainBindingError::InvalidWeights`] if weight configuration is invalid
    /// - [`DomainBindingError::Remote`] if remote domain configuration is invalid
    pub fn bind<U: WebCatalog, O: WebCatalog>(
        &self,
        user_catalog: Option<U>,
        org_catalog: Option<O>,
    ) -> Result<BoundDomainSampler<U, O>, Report<DomainBindingError>> {
        match (&self.remote, &self.local) {
            (None, None) => Err(Report::new(DomainBindingError::NoSource)),
            (Some(remote), None) => {
                let (domain, fetched_at) = bind_remote(remote)?;
                Ok(BoundDomainSampler::Remote { domain, fetched_at })
            }
            (None, Some(local)) => {
                let local_sampler = local.source.bind(user_catalog, org_catalog)?;
                Ok(BoundDomainSampler::Local(local_sampler))
            }
            (Some(remote), Some(local)) => {
                let (remote_weight, local_weight) = match (remote.weight, local.weight) {
                    (Some(remote_weight), Some(local_weight)) => (remote_weight, local_weight),
                    (None, None) => (1, 1),
                    _ => return Err(Report::new(DomainBindingError::InvalidWeights)),
                };

                if remote_weight == 0 && local_weight == 0 {
                    return Err(Report::new(DomainBindingError::InvalidWeights));
                }
                if local_weight == 0 {
                    let (domain, fetched_at) = bind_remote(remote)?;
                    return Ok(BoundDomainSampler::Remote { domain, fetched_at });
                }
                if remote_weight == 0 {
                    let local_sampler = local.source.bind(user_catalog, org_catalog)?;
                    return Ok(BoundDomainSampler::Local(local_sampler));
                }

                let (remote_domain, fetched_at) = bind_remote(remote)?;
                let local_sampler = local.source.bind(user_catalog, org_catalog)?;

                let chooser = WeightedIndex::new([remote_weight, local_weight])
                    .change_context(DomainBindingError::InvalidWeights)?;
                Ok(BoundDomainSampler::Mixed {
                    chooser,
                    remote: remote_domain,
                    fetched_at,
                    local: local_sampler,
                })
            }
        }
    }
}

fn bind_remote(
    remote: &WeightedRemoteSourceConfig,
) -> Result<(DomainDistribution, OffsetDateTime), Report<DomainBindingError>> {
    let domain =
        DomainDistribution::new(&remote.domain).change_context(DomainBindingError::Remote)?;
    Ok((domain, remote.fetched_at))
}
