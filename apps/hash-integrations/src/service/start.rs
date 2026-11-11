use core::{num::NonZero, time::Duration};

use hash_integrations_definition::ConnectorId;
use hash_integrations_orchestration::{AdmissionKey, FunctionVersion, RetryPolicy, RunId};
use type_system::principal::actor_group::WebId;
use uuid::Uuid;

/// The version of the integration run function, pinned when a run starts.
pub(crate) const FUNCTION_VERSION: FunctionVersion = FunctionVersion::new(1);

/// How often a failed step of an integration run is tried: 3 times, waiting 1 s and then 2 s.
pub(crate) const RETRY_POLICY: RetryPolicy = RetryPolicy {
    max_attempts: NonZero::new(3).expect("three should be nonzero"),
    initial_delay: Duration::from_secs(1),
    max_delay: Duration::from_secs(60),
    multiplier: NonZero::new(2).expect("two should be nonzero"),
};

/// The namespace of run IDs derived from requests.
const RUN_NAMESPACE: Uuid = Uuid::from_u128(0x0A36_54A6_459B_4CE9_BE9E_0E55_5D6D_721F);

/// Returns the run that `request` in `web` starts, so a repeated request attaches to it.
pub(crate) fn run_id(web: WebId, request: Uuid) -> RunId {
    let name = [
        Uuid::from(web).as_bytes().as_slice(),
        request.as_bytes().as_slice(),
    ]
    .concat();

    Uuid::new_v5(&RUN_NAMESPACE, &name)
        .to_string()
        .parse()
        .expect("a UUID should be a run ID")
}

/// Returns the key that allows one active run per integration of `web`.
///
/// Artifact storage names the same integration as `sha256("{web}:{connector}")`. The two spellings
/// never meet: admission keys cannot contain `:`, and the plain form stays readable in the backend.
/// Both must be built from the same web and connector.
pub(crate) fn admission_key(web: WebId, connector: &ConnectorId) -> AdmissionKey {
    format!("{web}/{connector}")
        .parse()
        .expect("a web and a connector should be an admission key")
}

#[cfg(test)]
mod tests {
    use similar_asserts::assert_eq;
    use type_system::principal::actor_group::WebId;
    use uuid::{Uuid, uuid};

    use super::run_id;

    const WEB: Uuid = uuid!("00000000-0000-4000-8000-000000000001");
    const REQUEST: Uuid = uuid!("00000000-0000-4000-8000-00000000000a");

    /// A retry after a deploy attaches to its run only while the derivation stays the same.
    #[test]
    fn run_id_pinned() {
        assert_eq!(
            run_id(WebId::new(WEB), REQUEST).as_ref(),
            "0ccc2c92-e805-5182-803d-9d6c5fb90394",
            "the run ID should be the UUIDv5 of the web and the request under the run namespace"
        );
    }

    #[test]
    fn run_id_per_web() {
        let other = WebId::new(uuid!("00000000-0000-4000-8000-000000000002"));

        assert_ne!(
            run_id(WebId::new(WEB), REQUEST),
            run_id(other, REQUEST),
            "the same request ID in two webs should start two runs"
        );
    }
}
