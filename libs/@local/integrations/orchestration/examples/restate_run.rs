//! One run of three steps on a local Restate server.
//!
//! Start a server, then run the example:
//!
//! ```sh
//! docker run --rm -p 8080:8080 -p 9070:9070 --add-host=host.docker.internal:host-gateway \
//!     docker.restate.dev/restatedev/restate:1.8.1
//! cargo run -p hash-integrations-orchestration --features restate --example restate_run
//! ```
//!
//! Each step takes two seconds. Restate's UI at <http://localhost:9070/ui> shows the run and its
//! journal while the example prints the run's status.

#![expect(
    clippy::print_stdout,
    clippy::use_debug,
    reason = "the example prints the run's progress, with a failed run's failure in full"
)]

extern crate alloc;

use alloc::sync::Arc;
use core::{net::SocketAddr, num::NonZero, time::Duration};

use error_stack::Report;
use hash_integrations_orchestration::{
    FunctionVersion, Payload, RetryPolicy, RunError, RunFunction, RunId, RunPhase, RunStart,
    Runs as _, StepContext, StepName, Worker as _,
    restate::{RestateBackend, RestateConfig, WorkerConfig},
};
use tokio::time::sleep;
use tokio_util::sync::CancellationToken;
use uuid::Uuid;

/// Captures rows, plans a write for each and delivers the writes, one step each.
struct Sync;

impl RunFunction for Sync {
    type Input = u32;

    const VERSION: FunctionVersion = FunctionVersion::new(1);

    async fn run(
        &self,
        context: &mut impl StepContext,
        input: u32,
    ) -> Result<(), Report<RunError>> {
        let captured: u32 = context
            .run(step("capture"), || async move {
                sleep(Duration::from_secs(2)).await;
                Ok(input)
            })
            .await?;
        let planned: u32 = context
            .run(step("plan"), || async move {
                sleep(Duration::from_secs(2)).await;
                Ok(captured * 2)
            })
            .await?;
        context
            .run(step("deliver"), || async move {
                sleep(Duration::from_secs(2)).await;
                println!("delivered {planned} writes");
                Ok(())
            })
            .await
    }
}

fn step(name: &str) -> StepName {
    name.parse().expect("should be a step name")
}

#[tokio::main]
async fn main() {
    // Restate sends a new run to the worker URL that was registered last. A new port makes this
    // worker's URL the last one, whichever workers the server knows from before.
    let port = std::net::TcpListener::bind("0.0.0.0:0")
        .and_then(|listener| listener.local_addr())
        .expect("should find a free port")
        .port();
    let config = RestateConfig {
        ingress_url: "http://localhost:8080".to_owned(),
        admin_url: "http://localhost:9070".to_owned(),
    };
    let worker_config = WorkerConfig {
        listen: SocketAddr::from(([0, 0, 0, 0], port)),
        worker_url: format!("http://host.docker.internal:{port}"),
        step_timeout: Duration::from_mins(1),
    };
    let backend = RestateBackend::new(config.clone());

    // The worker: it serves `Sync` and registers its URL with Restate.
    let shutdown = CancellationToken::new();
    let worker = tokio::spawn({
        let (worker, shutdown) = (backend.worker(worker_config.clone()), shutdown.clone());
        async move { worker.work(Arc::new(Sync), shutdown).await }
    });
    let deployments = format!("{}/deployments", config.admin_url);
    while !reqwest::get(&deployments)
        .await
        .expect("should reach Restate's admin API")
        .text()
        .await
        .expect("should read the deployments")
        .contains(&worker_config.worker_url)
    {
        sleep(Duration::from_millis(100)).await;
    }

    // The client: it starts a run and reads the run's status until the run has finished.
    let id = Uuid::new_v4().simple();
    let run: RunId = id.to_string().parse().expect("should be a run ID");
    let start = RunStart {
        admission: format!("example/{id}")
            .parse()
            .expect("should be an admission key"),
        version: Sync::VERSION,
        policy: RetryPolicy {
            max_attempts: NonZero::new(3).expect("three should be nonzero"),
            initial_delay: Duration::from_millis(100),
            max_delay: Duration::from_secs(1),
            multiplier: NonZero::new(2).expect("two should be nonzero"),
        },
        input: Payload::encode(&21_u32).expect("should encode the input"),
    };
    backend
        .start(run.clone(), start)
        .await
        .expect("should start the run");
    println!("started run {run}");

    loop {
        let status = backend
            .status(&run)
            .await
            .expect("should read the run's status")
            .expect("the run should exist");
        println!(
            "{:?}, {} steps recorded",
            status.phase, status.steps_recorded
        );
        if !matches!(status.phase, RunPhase::Pending | RunPhase::Running) {
            break;
        }
        sleep(Duration::from_secs(1)).await;
    }

    shutdown.cancel();
    worker
        .await
        .expect("the worker task should join")
        .expect("the worker should shut down cleanly");
}
