//! Follows one integration: every interval, takes a run through every stage if its collector
//! wrote rows the last completed run did not capture, and writes them to the Graph.
//!
//! The settings come from the environment:
//!
//! - `HASH_INTEGRATIONS_DEFINITION`: the path of the integration's definition, a YAML file
//! - `HASH_WEB_ID` and `HASH_ACTOR_ID`: the web the integration writes to, and the actor it writes
//!   as
//! - `HASH_INTEGRATIONS_BUCKET_URI`: the bucket and prefix, as `s3://bucket/prefix`, with
//!   `AWS_REGION`, `AWS_ENDPOINT` (for an S3-compatible store), `AWS_ACCESS_KEY_ID` and
//!   `AWS_SECRET_ACCESS_KEY`
//! - `HASH_INTEGRATIONS_GRAPH_URL` and `HASH_GRAPH_SERVICE_SECRET`: the Graph's HTTP API, ending in
//!   `/`, and the secret it accepts from services
//! - `HASH_INTEGRATIONS_INTERVAL_SECONDS`: the time between two steps, 60 by default

use core::time::Duration;
use std::{env, fs};

use error_stack::{Report, ResultExt as _};
use hash_crypto::Secret;
use hash_integrations_ledger::{Follower, GraphClient, S3Bucket, Step};
use type_system::principal::{actor::ActorEntityUuid, actor_group::WebId};
use url::Url;
use uuid::Uuid;

/// Reports a setting that is missing or not valid.
#[derive(Debug, derive_more::Display, derive_more::Error)]
#[display("the setting `{name}` is missing or not valid")]
struct SettingError {
    #[error(not(source))]
    name: &'static str,
}

fn setting(name: &'static str) -> Result<String, Report<SettingError>> {
    env::var(name).change_context(SettingError { name })
}

fn parsed<T: core::str::FromStr>(name: &'static str) -> Result<T, Report<SettingError>>
where
    T::Err: core::error::Error + Send + Sync + 'static,
{
    setting(name)?.parse().change_context(SettingError { name })
}

/// The follower the environment describes, and the time between two of its steps.
fn configure() -> Result<(Follower, Duration), Report<SettingError>> {
    let path = setting("HASH_INTEGRATIONS_DEFINITION")?;
    let yaml = fs::read_to_string(&path).change_context(SettingError {
        name: "HASH_INTEGRATIONS_DEFINITION",
    })?;
    let endpoint = env::var("AWS_ENDPOINT").ok();
    let bucket = S3Bucket {
        uri: setting("HASH_INTEGRATIONS_BUCKET_URI")?.into(),
        region: setting("AWS_REGION")?.into(),
        use_ssl: !endpoint
            .as_deref()
            .is_some_and(|endpoint| endpoint.starts_with("http://")),
        endpoint: endpoint.map(|endpoint| {
            endpoint
                .trim_start_matches("http://")
                .trim_start_matches("https://")
                .into()
        }),
        key_id: setting("AWS_ACCESS_KEY_ID")?.into(),
        secret: Secret::from_vec(setting("AWS_SECRET_ACCESS_KEY")?.into_bytes()),
    };
    let graph = GraphClient::new(
        &parsed::<Url>("HASH_INTEGRATIONS_GRAPH_URL")?,
        &Secret::from_string(setting("HASH_GRAPH_SERVICE_SECRET")?),
    )
    .change_context(SettingError {
        name: "HASH_INTEGRATIONS_GRAPH_URL",
    })?;
    let follower = Follower::new(
        bucket,
        &yaml,
        WebId::new(parsed::<Uuid>("HASH_WEB_ID")?),
        ActorEntityUuid::new(parsed::<Uuid>("HASH_ACTOR_ID")?),
        graph,
    )
    .change_context(SettingError {
        name: "HASH_INTEGRATIONS_DEFINITION",
    })?;
    let interval = env::var("HASH_INTEGRATIONS_INTERVAL_SECONDS")
        .ok()
        .map_or(Ok(60), |seconds| seconds.parse())
        .change_context(SettingError {
            name: "HASH_INTEGRATIONS_INTERVAL_SECONDS",
        })?;
    Ok((follower, Duration::from_secs(interval)))
}

#[expect(
    clippy::print_stderr,
    reason = "the follower reports each step on stderr"
)]
#[tokio::main]
async fn main() -> Result<(), Report<SettingError>> {
    let (follower, interval) = configure()?;
    loop {
        match follower.step().await {
            Ok(Step::Completed { run }) => eprintln!("run {run} completed"),
            Ok(Step::Idle) => {}
            Err(report) => eprintln!(
                "the step failed, trying again in {} seconds: {report:#}",
                interval.as_secs()
            ),
        }
        tokio::time::sleep(interval).await;
    }
}
