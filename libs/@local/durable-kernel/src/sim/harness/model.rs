use alloc::collections::BTreeMap;

use serde::{Deserialize, Serialize};

use crate::domain::{DomainEvent, Fold, PartitionKey, SimpleDomain};

pub(super) const ARCHIVE_THRESHOLD: u64 = 10;

/// Records changes to the simulation's counters.
///
/// Each increment has a request number so equal increments can be distinct events. Zero
/// increments are rejected. Archive events include the cycle number to distinguish repeated
/// archives of the same total.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum DstEvent {
    Increment {
        counter: String,
        amount: u64,
        request: u64,
    },
    Archive {
        counter: String,
        upto: u64,
        cycle: u64,
    },
}

impl DstEvent {
    fn counter(&self) -> &str {
        match self {
            Self::Increment { counter, .. } | Self::Archive { counter, .. } => counter,
        }
    }
}

impl DomainEvent for DstEvent {
    fn name() -> &'static str {
        "dst_counter_event"
    }

    fn partition(&self) -> PartitionKey {
        PartitionKey::parse(self.counter())
            .expect("simulation counters should be valid partition keys")
    }
}

/// Tracks totals and completed archive cycles. Archiving resets a counter’s total and advances
/// its cycle number.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct DstCounters {
    pub totals: BTreeMap<String, u64>,
    pub archives: BTreeMap<String, u64>,
}

impl DstCounters {
    fn total(&self, counter: &str) -> u64 {
        self.totals.get(counter).copied().unwrap_or(0)
    }

    fn cycle(&self, counter: &str) -> u64 {
        self.archives.get(counter).copied().unwrap_or(0)
    }
}

#[derive(Debug, derive_more::Display, derive_more::Error)]
pub enum CounterRejection {
    #[display("amount must be positive")]
    ZeroIncrement,
    #[display("archive completion for {counter} is stale")]
    StaleArchive { counter: String },
}

impl Fold<DstEvent> for DstCounters {
    type Error = CounterRejection;
    type Validated = DstEvent;

    fn validate(
        &self,
        event: &DstEvent,
    ) -> Result<Self::Validated, error_stack::Report<Self::Error>> {
        match event {
            DstEvent::Increment { amount, .. } => {
                if *amount == 0 {
                    return Err(error_stack::Report::new(CounterRejection::ZeroIncrement));
                }
                Ok(event.clone())
            }
            DstEvent::Archive {
                counter,
                upto,
                cycle,
            } => {
                if *upto != self.total(counter) || *cycle != self.cycle(counter) {
                    return Err(error_stack::Report::new(CounterRejection::StaleArchive {
                        counter: counter.clone(),
                    }));
                }
                Ok(event.clone())
            }
        }
    }

    fn apply(&mut self, validated: Self::Validated) {
        self.replay(&validated);
    }

    fn replay(&mut self, event: &DstEvent) {
        match event {
            DstEvent::Increment {
                counter, amount, ..
            } => {
                *self.totals.entry(counter.clone()).or_insert(0) += amount;
            }
            DstEvent::Archive { counter, .. } => {
                self.totals.insert(counter.clone(), 0);
                *self.archives.entry(counter.clone()).or_insert(0) += 1;
            }
        }
    }
}

#[derive(Debug, Clone, Copy)]
pub struct DstDomain;

impl SimpleDomain for DstDomain {
    type Event = DstEvent;
    type Projection = DstCounters;

    fn empty_projection() -> Self::Projection {
        DstCounters::default()
    }
}

/// Archives a counter at a specific total and cycle. Its serialized contents determine its
/// effect ID.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct DstEffect {
    pub counter: String,
    pub upto: u64,
    pub cycle: u64,
}

/// Plans an archive for each counter at or above the threshold. Applying the completion resets
/// the total, which removes the effect from the next plan.
pub(super) fn plan_effects(projection: &DstCounters) -> Vec<DstEffect> {
    projection
        .totals
        .iter()
        .filter(|(_counter, total)| **total >= ARCHIVE_THRESHOLD)
        .map(|(counter, total)| DstEffect {
            counter: counter.clone(),
            upto: *total,
            cycle: projection.cycle(counter),
        })
        .collect()
}
