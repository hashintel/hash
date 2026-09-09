//! Synchronizes five customers to a CRM and resumes pending work after restart.
//!
//! The `defer` run leaves customer 3 pending and absent from the CRM. The next
//! run recovers it from the journal.
//!
//! ```sh
//! cargo run -q -p durable-kernel --example customer_sync -- reset
//! cargo run -q -p durable-kernel --example customer_sync -- defer
//! cargo run -q -p durable-kernel --example customer_sync
//! ```
//!
//! The `crash` mode exits after the CRM write. The next run repeats the effect
//! with the same idempotency key.

#![allow(clippy::expect_used, clippy::print_stdout)]

extern crate alloc;

use alloc::collections::BTreeMap;
use core::time::Duration;
use std::path::{Path, PathBuf};

use durable_kernel::{
    domain::{
        DomainEvent, Executor, Fold, PartitionKey, Rejection, Retry, SimpleDomain, effect_id,
        shard_of,
    },
    runtime::{Kernel, KernelConfig, RunningKernel, Submitted},
};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
enum SyncEvent {
    CustomerQueued {
        customer_id: String,
        name: String,
    },
    CustomerSynced {
        customer_id: String,
        remote_id: String,
    },
}

impl DomainEvent for SyncEvent {
    fn name() -> &'static str {
        "customer_sync_event"
    }

    fn partition(&self) -> PartitionKey {
        customer_partition()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct Customer {
    name: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
struct CustomerSync {
    pending: BTreeMap<String, Customer>,
    synced: BTreeMap<String, String>,
}

impl Fold<SyncEvent> for CustomerSync {
    fn validate(&self, event: &SyncEvent) -> Result<(), Rejection> {
        match event {
            SyncEvent::CustomerQueued { customer_id, .. }
                if self.pending.contains_key(customer_id)
                    || self.synced.contains_key(customer_id) =>
            {
                Err(Rejection::new(format!(
                    "customer {customer_id} is already known"
                )))
            }
            SyncEvent::CustomerSynced { customer_id, .. }
                if !self.pending.contains_key(customer_id) =>
            {
                Err(Rejection::new(format!(
                    "customer {customer_id} is not pending"
                )))
            }
            SyncEvent::CustomerQueued { .. } | SyncEvent::CustomerSynced { .. } => Ok(()),
        }
    }

    fn apply(&mut self, event: &SyncEvent) {
        match event {
            SyncEvent::CustomerQueued { customer_id, name } => {
                self.pending
                    .entry(customer_id.clone())
                    .or_insert_with(|| Customer { name: name.clone() });
            }
            SyncEvent::CustomerSynced {
                customer_id,
                remote_id,
            } => {
                self.pending.remove(customer_id);
                self.synced.insert(customer_id.clone(), remote_id.clone());
            }
        }
    }
}

struct CustomerDomain;

impl SimpleDomain for CustomerDomain {
    type Event = SyncEvent;
    type Projection = CustomerSync;
}

#[derive(Debug, Clone, Serialize)]
struct UpsertCustomer {
    customer_id: String,
    name: String,
}

struct CrmSync {
    crm_path: PathBuf,
    reject_customer_three: bool,
    crash_after_customer: Option<&'static str>,
}

impl Executor<CustomerDomain> for CrmSync {
    type Effect = UpsertCustomer;

    fn plan(&self, projection: &CustomerSync) -> Vec<UpsertCustomer> {
        if projection.pending.len() + projection.synced.len() < CUSTOMERS.len() {
            return Vec::new();
        }
        let mut effects: Vec<_> = projection
            .pending
            .iter()
            .map(|(customer_id, customer)| UpsertCustomer {
                customer_id: customer_id.clone(),
                name: customer.name.clone(),
            })
            .collect();
        effects.sort_by_key(|effect| effect.customer_id == "customer-3");
        effects
    }

    #[expect(
        clippy::unused_async_trait_impl,
        reason = "CRM side effects run when the executor future is polled"
    )]
    async fn execute(&self, effect: &UpsertCustomer) -> Result<Vec<SyncEvent>, Retry> {
        if effect.customer_id == "customer-3" && self.reject_customer_three {
            println!("CRM rejected customer-3 before creating a record. It will retry later.");
            return Err(Retry {
                reason: "CRM rejected customer-3 before creating a record".to_owned(),
                after: Some(Duration::from_secs(5)),
            });
        }

        let key = effect_id(effect).expect("effect should serialize");
        let outcome = upsert_crm(&self.crm_path, &key, effect).expect("CRM write should succeed");

        if outcome.duplicate {
            println!(
                "CRM reused {} as {} from its idempotency record.",
                effect.customer_id, outcome.remote_id
            );
        } else {
            println!(
                "CRM accepted {} as {}.",
                effect.customer_id, outcome.remote_id
            );
        }

        if self.crash_after_customer == Some(effect.customer_id.as_str()) && !outcome.duplicate {
            println!(
                "\nThe CRM accepted {}, but CustomerSynced did not reach the journal.",
                effect.customer_id
            );
            println!("Run the example again to recover.\n");
            std::process::exit(1);
        }

        Ok(vec![SyncEvent::CustomerSynced {
            customer_id: effect.customer_id.clone(),
            remote_id: outcome.remote_id,
        }])
    }
}

#[derive(Default, Serialize, Deserialize)]
struct CrmState {
    by_idempotency_key: BTreeMap<String, CrmRecord>,
}

#[derive(Clone, Serialize, Deserialize)]
struct CrmRecord {
    customer_id: String,
    name: String,
    remote_id: String,
}

struct UpsertOutcome {
    remote_id: String,
    duplicate: bool,
}

fn upsert_crm(
    path: &Path,
    idempotency_key: &str,
    effect: &UpsertCustomer,
) -> std::io::Result<UpsertOutcome> {
    let mut crm: CrmState = std::fs::read(path)
        .ok()
        .and_then(|bytes| serde_json::from_slice(&bytes).ok())
        .unwrap_or_default();

    if let Some(existing) = crm.by_idempotency_key.get(idempotency_key) {
        return Ok(UpsertOutcome {
            remote_id: existing.remote_id.clone(),
            duplicate: true,
        });
    }

    let remote_id = format!("crm-{}", effect.customer_id);
    crm.by_idempotency_key.insert(
        idempotency_key.to_owned(),
        CrmRecord {
            customer_id: effect.customer_id.clone(),
            name: effect.name.clone(),
            remote_id: remote_id.clone(),
        },
    );
    std::fs::create_dir_all(path.parent().expect("CRM path should have a parent"))?;
    std::fs::write(
        path,
        serde_json::to_vec_pretty(&crm).expect("CRM state should serialize"),
    )?;
    Ok(UpsertOutcome {
        remote_id,
        duplicate: false,
    })
}

fn customer_partition() -> PartitionKey {
    PartitionKey::parse("customers").expect("static key should parse")
}

fn state_dir() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../../target/customer_sync_demo")
}

async fn report_recovery(running: &RunningKernel<CustomerDomain>, key: &PartitionKey) {
    let (pending, synced) = running
        .read(key, |sync: &CustomerSync| {
            (sync.pending.len(), sync.synced.len())
        })
        .await
        .expect("sync state should be readable");
    if pending == 0 && synced == 0 {
        println!("No journal state was recovered.");
    } else {
        println!("Recovered {pending} pending customers and {synced} synced customers.");
    }
}

const CUSTOMERS: [(&str, &str); 5] = [
    ("customer-1", "Ada Lovelace"),
    ("customer-2", "Grace Hopper"),
    ("customer-3", "Edsger Dijkstra"),
    ("customer-4", "Barbara Liskov"),
    ("customer-5", "Donald Knuth"),
];

#[tokio::main]
async fn main() {
    let mode = std::env::args().nth(1).unwrap_or_default();
    if mode == "reset" {
        let _: Result<_, _> = std::fs::remove_dir_all(state_dir());
        println!("The example state was removed.");
        return;
    }

    println!("The durable customer sync started.");
    let key = customer_partition();
    let mut config = KernelConfig::new(
        "customersync",
        format!("file://{}", state_dir().join("journal").display()),
    );
    config.shards = vec![u16::from(shard_of(&key).get())];
    config.poll_interval = Duration::from_millis(50);

    let running = Kernel::open(config)
        .expect("kernel should open")
        .register::<CustomerDomain>()
        .expect("customer domain should register")
        .start(CrmSync {
            crm_path: state_dir().join("crm.json"),
            reject_customer_three: mode == "defer",
            crash_after_customer: (mode == "crash").then_some("customer-3"),
        })
        .await
        .expect("kernel should start");

    report_recovery(&running, &key).await;

    let mut queued = 0;
    let mut already_durable = 0;
    for (customer_id, name) in CUSTOMERS {
        let event = SyncEvent::CustomerQueued {
            customer_id: customer_id.to_owned(),
            name: name.to_owned(),
        };
        match running.submit(event).await {
            Ok(Submitted::Applied) => queued += 1,
            Ok(Submitted::AlreadyDurable) => already_durable += 1,
            Err(error) => println!("The customer was rejected with {error}."),
        }
    }
    println!("Queued {queued} new customers. {already_durable} were already durable.\n");

    let deadline = std::time::Instant::now() + Duration::from_secs(20);
    loop {
        let (pending, synced) = running
            .read(&key, |sync: &CustomerSync| {
                (sync.pending.len(), sync.synced.len())
            })
            .await
            .expect("sync state should be readable");
        if mode == "defer" && pending == 1 && synced == 4 {
            println!("The run ended with 4 synced customers and customer-3 still pending.");
            running.shutdown().await.expect("shutdown should succeed");
            return;
        }
        if pending == 0 {
            break;
        }
        assert!(
            std::time::Instant::now() < deadline,
            "customer sync did not settle"
        );
        tokio::time::sleep(Duration::from_millis(100)).await;
    }

    let synced = running
        .read(&key, |sync: &CustomerSync| sync.synced.clone())
        .await
        .expect("sync state should be readable");
    println!("Customer sync completed with {} customers.", synced.len());
    for (customer_id, remote_id) in synced {
        println!("{customer_id} was synced as {remote_id}.");
    }
    running.shutdown().await.expect("shutdown should succeed");
}
