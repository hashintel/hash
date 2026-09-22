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

#![expect(
    clippy::print_stdout,
    reason = "the example prints its progress and results"
)]

extern crate alloc;

use alloc::collections::BTreeMap;
use core::time::Duration;
use std::path::{Path, PathBuf};

use durable_kernel::{
    domain::{DomainEvent, Executor, Fold, PartitionKey, Retry, SimpleDomain, effect_id, shard_of},
    ids::EffectId,
    keyspace::Namespace,
    runtime::{Kernel, KernelConfig, RunningKernel, Submitted},
};
use serde::{Deserialize, Serialize};

#[derive(
    Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize, derive_more::Display,
)]
#[serde(transparent)]
struct CustomerId(String);

#[derive(Debug, Clone, Serialize, Deserialize, derive_more::Display)]
#[serde(transparent)]
struct RemoteId(String);

#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
enum SyncEvent {
    CustomerQueued {
        customer_id: CustomerId,
        name: String,
    },
    CustomerSynced {
        customer_id: CustomerId,
        remote_id: RemoteId,
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
    pending: BTreeMap<CustomerId, Customer>,
    synced: BTreeMap<CustomerId, RemoteId>,
}

#[derive(Debug, derive_more::Display, derive_more::Error)]
enum CustomerRejection {
    #[display("customer {customer_id} is already known")]
    AlreadyKnown { customer_id: CustomerId },
    #[display("customer {customer_id} is not pending")]
    NotPending { customer_id: CustomerId },
}

enum CustomerChange {
    Queue {
        customer_id: CustomerId,
        customer: Customer,
    },
    Sync {
        customer_id: CustomerId,
        remote_id: RemoteId,
    },
}

impl CustomerChange {
    fn from_event(event: &SyncEvent) -> Self {
        match event {
            SyncEvent::CustomerQueued { customer_id, name } => Self::Queue {
                customer_id: customer_id.clone(),
                customer: Customer { name: name.clone() },
            },
            SyncEvent::CustomerSynced {
                customer_id,
                remote_id,
            } => Self::Sync {
                customer_id: customer_id.clone(),
                remote_id: remote_id.clone(),
            },
        }
    }
}

impl Fold<SyncEvent> for CustomerSync {
    type Error = CustomerRejection;
    type Validated = CustomerChange;

    fn validate(
        &self,
        event: &SyncEvent,
    ) -> Result<Self::Validated, error_stack::Report<Self::Error>> {
        match event {
            SyncEvent::CustomerQueued { customer_id, .. }
                if self.pending.contains_key(customer_id)
                    || self.synced.contains_key(customer_id) =>
            {
                Err(error_stack::Report::new(CustomerRejection::AlreadyKnown {
                    customer_id: customer_id.clone(),
                }))
            }
            SyncEvent::CustomerSynced { customer_id, .. }
                if !self.pending.contains_key(customer_id) =>
            {
                Err(error_stack::Report::new(CustomerRejection::NotPending {
                    customer_id: customer_id.clone(),
                }))
            }
            SyncEvent::CustomerQueued { .. } | SyncEvent::CustomerSynced { .. } => {
                Ok(CustomerChange::from_event(event))
            }
        }
    }

    fn apply(&mut self, validated: Self::Validated) {
        match validated {
            CustomerChange::Queue {
                customer_id,
                customer,
            } => {
                self.pending.entry(customer_id).or_insert(customer);
            }
            CustomerChange::Sync {
                customer_id,
                remote_id,
            } => {
                self.pending.remove(&customer_id);
                self.synced.insert(customer_id, remote_id);
            }
        }
    }

    fn replay(&mut self, event: &SyncEvent) {
        self.apply(CustomerChange::from_event(event));
    }
}

struct CustomerDomain;

impl SimpleDomain for CustomerDomain {
    type Event = SyncEvent;
    type Projection = CustomerSync;

    fn empty_projection() -> Self::Projection {
        CustomerSync::default()
    }
}

#[derive(Debug, Clone, Serialize)]
struct UpsertCustomer {
    customer_id: CustomerId,
    name: String,
}

#[derive(Debug, derive_more::Display, derive_more::Error)]
#[display("CRM rejected {customer_id} before creating a record")]
struct CrmRejected {
    customer_id: CustomerId,
}

struct CrmSync {
    last_customer: CustomerId,
    reject_last: bool,
    crash_after_last: bool,
}

impl Executor<CustomerDomain> for CrmSync {
    type Effect = UpsertCustomer;
    type Error = CrmRejected;

    fn plan<'a>(
        &'a self,
        projection: &'a CustomerSync,
    ) -> impl IntoIterator<Item = UpsertCustomer> + 'a {
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
        effects.sort_by_key(|effect| effect.customer_id == self.last_customer);
        effects
    }

    #[expect(
        clippy::unused_async_trait_impl,
        reason = "CRM side effects run when the executor future is polled"
    )]
    async fn execute(&self, effect: &UpsertCustomer) -> Result<Vec<SyncEvent>, Retry<Self::Error>> {
        if effect.customer_id == self.last_customer && self.reject_last {
            println!(
                "CRM rejected {} before creating a record. It will retry later.",
                effect.customer_id
            );
            return Err(Retry {
                reason: error_stack::Report::new(CrmRejected {
                    customer_id: effect.customer_id.clone(),
                }),
                after: Some(Duration::from_secs(5)),
            });
        }

        let key = effect_id(effect).expect("effect should serialize");
        let outcome = upsert_crm(key, effect).expect("CRM write should succeed");

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

        if self.crash_after_last && effect.customer_id == self.last_customer && !outcome.duplicate {
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
    by_idempotency_key: BTreeMap<EffectId, CrmRecord>,
}

#[derive(Clone, Serialize, Deserialize)]
struct CrmRecord {
    customer_id: CustomerId,
    name: String,
    remote_id: RemoteId,
}

struct UpsertOutcome {
    remote_id: RemoteId,
    duplicate: bool,
}

fn upsert_crm(
    idempotency_key: EffectId,
    effect: &UpsertCustomer,
) -> std::io::Result<UpsertOutcome> {
    let path = state_dir().join("crm.json");
    let mut crm: CrmState = std::fs::read(&path)
        .ok()
        .and_then(|bytes| serde_json::from_slice(&bytes).ok())
        .unwrap_or_default();

    if let Some(existing) = crm.by_idempotency_key.get(&idempotency_key) {
        return Ok(UpsertOutcome {
            remote_id: existing.remote_id.clone(),
            duplicate: true,
        });
    }

    let remote_id = RemoteId(format!("crm-{}", effect.customer_id));
    crm.by_idempotency_key.insert(
        idempotency_key,
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
        Namespace::parse("customersync").expect("namespace should be valid"),
        format!("file://{}", state_dir().join("journal").display()),
    );
    config.shards = vec![shard_of(&key)];
    config.poll_interval = Duration::from_millis(50);

    let running = Kernel::open(config)
        .expect("kernel should open")
        .register::<CustomerDomain>()
        .expect("customer domain should register")
        .start(CrmSync {
            last_customer: CustomerId("customer-3".to_owned()),
            reject_last: mode == "defer",
            crash_after_last: mode == "crash",
        })
        .await
        .expect("kernel should start");

    report_recovery(&running, &key).await;

    let mut queued = 0;
    let mut already_durable = 0;
    for (customer_id, name) in CUSTOMERS {
        let event = SyncEvent::CustomerQueued {
            customer_id: CustomerId(customer_id.to_owned()),
            name: name.to_owned(),
        };
        match running.submit(event).await {
            Ok(Submitted::Applied) => queued += 1,
            Ok(Submitted::AlreadyDurable) => already_durable += 1,
            Ok(Submitted::Rejected(rejection)) => {
                println!("The customer was rejected: {rejection}.");
            }
            Err(error) => println!("The customer submission failed: {error:#}."),
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
