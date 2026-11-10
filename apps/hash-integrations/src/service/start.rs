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
pub(crate) fn admission_key(web: WebId, connector: &ConnectorId) -> AdmissionKey {
    format!("{web}/{connector}")
        .parse()
        .expect("a web and a connector should be an admission key")
}

#[cfg(test)]
mod tests {
    use super::*;

    const WEB: Uuid = Uuid::from_u128(1);
    const REQUEST: Uuid = Uuid::from_u128(2);

    #[test]
    fn run_id_is_the_same_for_a_repeated_request() {
        assert_eq!(
            run_id(WebId::new(WEB), REQUEST),
            run_id(WebId::new(WEB), REQUEST)
        );
    }

    #[test]
    fn run_id_differs_across_webs() {
        assert_ne!(
            run_id(WebId::new(WEB), REQUEST),
            run_id(WebId::new(Uuid::from_u128(3)), REQUEST)
        );
    }

    #[test]
    fn admission_key_names_the_web_and_the_connector() {
        let connector = "demo".parse().expect("demo should be a connector ID");

        assert_eq!(
            admission_key(WebId::new(WEB), &connector).as_ref(),
            "00000000-0000-0000-0000-000000000001/demo"
        );
    }
}
