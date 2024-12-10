extern crate alloc;

use alloc::sync::Arc;
use core::error::Error;

use temporal_client::ClientOptionsBuilder;
use temporal_sdk::Worker;
use temporal_sdk_core::{
    CoreRuntime, WorkerConfigBuilder, api::telemetry::TelemetryOptionsBuilder, init_worker,
};
use url::Url;

mod activities;
mod workflows;

const NAMESPACE: &str = "HASH";
const TASK_QUEUE: &str = "chonky";
const TARGET_URL: &str = "http://localhost:7233";

#[tokio::main]
async fn main() -> Result<(), Box<dyn Error>> {
    let client = ClientOptionsBuilder::default()
        .client_name("HASH Chonky worker")
        .client_version(env!("CARGO_PKG_VERSION"))
        .target_url(Url::parse(TARGET_URL)?)
        .build()?
        .connect(NAMESPACE, None)
        .await?;
    let telemetry_options = TelemetryOptionsBuilder::default().build()?;
    let runtime = CoreRuntime::new_assume_tokio(telemetry_options)?;

    let worker_config = WorkerConfigBuilder::default()
        .namespace(NAMESPACE)
        .task_queue(TASK_QUEUE)
        .worker_build_id("HASH Chonky worker")
        .build()?;

    let mut worker = Worker::new_from_core(
        Arc::new(init_worker(&runtime, worker_config, client)?),
        TASK_QUEUE,
    );
    worker.register_wf(workflows::example::ID, workflows::example::example_workflow);
    worker.register_activity(
        activities::example::ID,
        activities::example::example_activity,
    );

    let shutdown_handle = worker.shutdown_handle();
    tokio::spawn(async move {
        tokio::signal::ctrl_c().await.expect("Ctrl-C signal failed");
        shutdown_handle();
    });
    worker.run().await?;

    Ok(())
}
