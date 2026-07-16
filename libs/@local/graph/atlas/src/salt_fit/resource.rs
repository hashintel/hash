//! Checked host-resource planning for complete-corpus fitting.

use core::{
    error::Error,
    fmt,
    mem::size_of,
    sync::atomic::{AtomicBool, AtomicU64, Ordering},
    time::Duration,
};
use std::{
    sync::Arc,
    thread::{self, JoinHandle},
};

use camino::Utf8Path;
use sysinfo::{ProcessesToUpdate, System};

use super::{FitResourceLimitsV1, FitResourcePreflightV1};
use crate::salt::{CANONICAL_DIMENSIONS, salt_fit_boundary::PROJECTOR_DIMENSIONS};

const SEMANTIC_NEIGHBORS: u64 = 30;
const CONDITION_COUNT: u64 = 5;
const FIXED_WORKSPACE_BYTES: u64 = 2 * 1_024 * 1_024 * 1_024;

/// Deterministic major-buffer estimate checked before corpus allocation.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(in crate::salt_fit) struct FitResourceEstimate {
    pub peak_resident_bytes: u64,
    pub working_disk_bytes: u64,
    pub canonical_matrix_bytes: u64,
    pub projector_matrix_bytes: u64,
}

/// Host capacity observed when the full corpus was admitted.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(in crate::salt_fit) struct FitResourcePreflightObservation {
    pub estimate: FitResourceEstimate,
    pub available_memory_bytes: u64,
    pub available_disk_bytes: u64,
}

/// Failure to prove that a complete fit fits configured and observed capacity.
#[derive(Debug)]
pub(in crate::salt_fit) enum FitResourceError {
    Overflow {
        resource: &'static str,
    },
    ConfiguredBudget {
        resource: &'static str,
        required: u64,
        maximum: u64,
    },
    HostCapacity {
        resource: &'static str,
        required: u64,
        available: u64,
    },
    Disk(std::io::Error),
    Monitor(String),
}

impl fmt::Display for FitResourceError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Overflow { resource } => {
                write!(formatter, "full-corpus {resource} size overflows u64")
            }
            Self::ConfiguredBudget {
                resource,
                required,
                maximum,
            } => write!(
                formatter,
                "full-corpus {resource} estimate requires {required} bytes, exceeding the \
                 configured maximum {maximum}"
            ),
            Self::HostCapacity {
                resource,
                required,
                available,
            } => write!(
                formatter,
                "full-corpus {resource} estimate requires {required} bytes, but the host reports \
                 only {available} available bytes"
            ),
            Self::Disk(_) => formatter.write_str("could not inspect available atlas disk space"),
            Self::Monitor(detail) => write!(formatter, "resident-memory monitor failed: {detail}"),
        }
    }
}

impl Error for FitResourceError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Disk(error) => Some(error),
            Self::Overflow { .. }
            | Self::ConfiguredBudget { .. }
            | Self::HostCapacity { .. }
            | Self::Monitor(_) => None,
        }
    }
}

/// Estimates and checks all large complete-corpus buffers before extraction.
///
/// `rows` and `links` are exact counts from the frozen PostgreSQL point and
/// endpoint-induced link domains. The estimate includes both durable builds,
/// the copied HNSW vector corpus, all condition fields, and a 50% allocator and
/// backend safety margin.
///
/// # Errors
///
/// Returns an error on arithmetic overflow, a configured budget violation, or
/// insufficient currently available memory or disk space.
pub(in crate::salt_fit) fn preflight_full_corpus(
    root: &Utf8Path,
    configuration: FitResourcePreflightV1,
    limits: FitResourceLimitsV1,
    rows: usize,
    links: usize,
) -> Result<FitResourcePreflightObservation, FitResourceError> {
    let estimate = estimate_full_corpus(limits, rows, links)?;
    require_budget(
        "peak resident memory",
        estimate.peak_resident_bytes,
        configuration.maximum_peak_resident_bytes,
    )?;
    require_budget(
        "working disk",
        estimate.working_disk_bytes,
        configuration.maximum_working_disk_bytes,
    )?;

    let mut system = System::new();
    system.refresh_memory();
    let available_memory_bytes = system.available_memory();
    require_available(
        "resident memory",
        estimate.peak_resident_bytes,
        available_memory_bytes,
    )?;

    let disk_root = existing_ancestor(root);
    let available_disk_bytes = fs2::available_space(disk_root).map_err(FitResourceError::Disk)?;
    require_available(
        "working disk",
        estimate.working_disk_bytes,
        available_disk_bytes,
    )?;
    Ok(FitResourcePreflightObservation {
        estimate,
        available_memory_bytes,
        available_disk_bytes,
    })
}

/// Polling high-water observer that avoids platform-specific unsafe APIs.
pub(in crate::salt_fit) struct ResidentMemoryMonitor {
    running: Arc<AtomicBool>,
    peak: Arc<AtomicU64>,
    worker: Option<JoinHandle<()>>,
}

impl ResidentMemoryMonitor {
    /// Starts polling this process's resident memory.
    ///
    /// # Errors
    ///
    /// Returns an error when the current process identifier is unavailable or
    /// the monitor thread cannot be created.
    pub(in crate::salt_fit) fn start() -> Result<Self, FitResourceError> {
        let pid = sysinfo::get_current_pid()
            .map_err(|error| FitResourceError::Monitor(error.to_string()))?;
        let running = Arc::new(AtomicBool::new(true));
        let peak = Arc::new(AtomicU64::new(0));
        let worker_running = Arc::clone(&running);
        let worker_peak = Arc::clone(&peak);
        let worker = thread::Builder::new()
            .name("atlas-resource-monitor".to_owned())
            .spawn(move || {
                let mut system = System::new();
                while worker_running.load(Ordering::Relaxed) {
                    system.refresh_processes(ProcessesToUpdate::Some(&[pid]), true);
                    if let Some(process) = system.process(pid) {
                        worker_peak.fetch_max(process.memory(), Ordering::Relaxed);
                    }
                    thread::sleep(Duration::from_millis(250));
                }
                system.refresh_processes(ProcessesToUpdate::Some(&[pid]), true);
                if let Some(process) = system.process(pid) {
                    worker_peak.fetch_max(process.memory(), Ordering::Relaxed);
                }
            })
            .map_err(|error| FitResourceError::Monitor(error.to_string()))?;
        Ok(Self {
            running,
            peak,
            worker: Some(worker),
        })
    }

    /// Stops the observer and returns its maximum sampled resident bytes.
    ///
    /// # Errors
    ///
    /// Returns an error if the monitor thread panicked.
    pub(in crate::salt_fit) fn finish(mut self) -> Result<u64, FitResourceError> {
        self.running.store(false, Ordering::Relaxed);
        if self
            .worker
            .take()
            .expect("a live monitor should own one worker")
            .join()
            .is_err()
        {
            return Err(FitResourceError::Monitor(
                "monitor thread panicked".to_owned(),
            ));
        }
        Ok(self.peak.load(Ordering::Relaxed))
    }
}

impl Drop for ResidentMemoryMonitor {
    fn drop(&mut self) {
        self.running.store(false, Ordering::Relaxed);
        if let Some(worker) = self.worker.take() {
            let _result = worker.join();
        }
    }
}

fn estimate_full_corpus(
    limits: FitResourceLimitsV1,
    rows: usize,
    links: usize,
) -> Result<FitResourceEstimate, FitResourceError> {
    let rows = u64::try_from(rows).map_err(|_error| FitResourceError::Overflow {
        resource: "row count",
    })?;
    let links = u64::try_from(links).map_err(|_error| FitResourceError::Overflow {
        resource: "link count",
    })?;
    let canonical_matrix_bytes = matrix_bytes(rows, CANONICAL_DIMENSIONS, "canonical matrix")?;
    let projector_matrix_bytes = matrix_bytes(rows, PROJECTOR_DIMENSIONS, "projector matrix")?;
    let ann_vector_bytes = projector_matrix_bytes;
    let semantic_bytes = product(
        &[
            rows,
            SEMANTIC_NEIGHBORS,
            u64::try_from(size_of::<u32>() + 2 * size_of::<f32>())
                .expect("small element size should fit u64"),
        ],
        "semantic graph",
    )?;
    let condition_bytes = product(
        &[
            rows,
            CONDITION_COUNT + 2,
            u64::try_from(size_of::<[f64; 2]>()).expect("coordinate size should fit u64"),
        ],
        "condition fields",
    )?;
    let row_metadata_bytes = product(&[rows, 320], "row metadata")?;
    let link_metadata_bytes = product(&[links, 256], "link metadata")?;
    let label_bytes = limits.maximum_label_bytes as u64;
    let subtotal = sum(
        &[
            canonical_matrix_bytes,
            projector_matrix_bytes,
            ann_vector_bytes,
            semantic_bytes,
            condition_bytes,
            row_metadata_bytes,
            link_metadata_bytes,
            label_bytes,
            FIXED_WORKSPACE_BYTES,
        ],
        "resident buffers",
    )?;
    let safety_margin = subtotal / 2;
    let peak_resident_bytes =
        subtotal
            .checked_add(safety_margin)
            .ok_or(FitResourceError::Overflow {
                resource: "peak resident memory",
            })?;

    let primary_artifacts = sum(
        &[
            canonical_matrix_bytes,
            projector_matrix_bytes,
            semantic_bytes,
            product(&[links, 96], "relation artifacts")?,
            product(&[rows, 64], "canonical base artifacts")?,
            label_bytes,
            FIXED_WORKSPACE_BYTES / 4,
        ],
        "primary artifacts",
    )?;
    let working_disk_bytes =
        primary_artifacts
            .checked_mul(2)
            .ok_or(FitResourceError::Overflow {
                resource: "working disk",
            })?;
    Ok(FitResourceEstimate {
        peak_resident_bytes,
        working_disk_bytes,
        canonical_matrix_bytes,
        projector_matrix_bytes,
    })
}

fn matrix_bytes(
    rows: u64,
    dimensions: usize,
    resource: &'static str,
) -> Result<u64, FitResourceError> {
    product(
        &[
            rows,
            u64::try_from(dimensions).expect("fixed dimensions should fit u64"),
            u64::try_from(size_of::<f32>()).expect("f32 size should fit u64"),
        ],
        resource,
    )
}

fn product(values: &[u64], resource: &'static str) -> Result<u64, FitResourceError> {
    values.iter().try_fold(1_u64, |value, factor| {
        value
            .checked_mul(*factor)
            .ok_or(FitResourceError::Overflow { resource })
    })
}

fn sum(values: &[u64], resource: &'static str) -> Result<u64, FitResourceError> {
    values.iter().try_fold(0_u64, |value, item| {
        value
            .checked_add(*item)
            .ok_or(FitResourceError::Overflow { resource })
    })
}

fn require_budget(
    resource: &'static str,
    required: u64,
    maximum: u64,
) -> Result<(), FitResourceError> {
    if required <= maximum {
        Ok(())
    } else {
        Err(FitResourceError::ConfiguredBudget {
            resource,
            required,
            maximum,
        })
    }
}

fn require_available(
    resource: &'static str,
    required: u64,
    available: u64,
) -> Result<(), FitResourceError> {
    if required <= available {
        Ok(())
    } else {
        Err(FitResourceError::HostCapacity {
            resource,
            required,
            available,
        })
    }
}

fn existing_ancestor(mut path: &Utf8Path) -> &Utf8Path {
    while !path.exists() {
        path = path.parent().unwrap_or_else(|| Utf8Path::new("."));
    }
    path
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn estimates_cover_complete_canonical_and_projector_matrices() {
        let limits = FitResourceLimitsV1 {
            maximum_label_bytes: 1,
            ..crate::salt_fit::FitRequestV1::default().limits
        };
        let estimate = estimate_full_corpus(limits, 1_000_000, 5_000_000)
            .expect("supported corpus should fit checked arithmetic");

        assert_eq!(estimate.canonical_matrix_bytes, 12_288_000_000);
        assert_eq!(estimate.projector_matrix_bytes, 2_048_000_000);
        assert!(estimate.peak_resident_bytes > estimate.canonical_matrix_bytes);
        assert!(estimate.working_disk_bytes > estimate.canonical_matrix_bytes);
    }
}
