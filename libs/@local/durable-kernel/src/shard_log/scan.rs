use core::{ops::Bound, pin::pin};

use bytes::Bytes;
use error_stack::{Report, ResultExt as _};
use futures_util::TryStreamExt as _;

use super::{
    EVENTS_KEY, JournalReader, JournalStream as _, PROJECTION_SNAPSHOTS_KEY, RecoveryRange,
    SnapshotCandidate,
};
use crate::{
    DurableError,
    registry::{DurableRecord, UntrimmedJournalRecord},
    sequence::JournalSequence,
};

impl RecoveryRange {
    pub(super) fn new(
        through_sequence: Option<JournalSequence>,
        durable_end_exclusive: JournalSequence,
    ) -> Result<Self, Report<DurableError>> {
        let start = match through_sequence {
            Some(sequence) => sequence
                .checked_next()
                .ok_or_else(|| Report::new(DurableError::RecoverySequenceOverflow { sequence }))?,
            None => JournalSequence::new(0),
        };
        if start > durable_end_exclusive {
            return Err(Report::new(DurableError::InvalidRecoveryRange {
                start,
                end: durable_end_exclusive,
            }));
        }
        Ok(Self {
            bounds: (
                Bound::Included(start),
                Bound::Excluded(durable_end_exclusive),
            ),
            window: (start, durable_end_exclusive),
        })
    }
}

/// Reads and decodes the requested journal range, checking its sequence bounds.
pub(super) async fn scan_records<T, R>(
    reader: &R,
    range: (Bound<JournalSequence>, Bound<JournalSequence>),
    expected_window: Option<(JournalSequence, JournalSequence)>,
) -> Result<Vec<(JournalSequence, T)>, Report<DurableError>>
where
    T: UntrimmedJournalRecord,
    R: JournalReader,
{
    let mut stream = pin!(reader.scan(Bytes::from_static(EVENTS_KEY), range).await?);
    let mut records = Vec::new();
    while let Some((sequence, bytes)) = stream.try_next().await? {
        if let Some((start, end)) = expected_window
            && (sequence < start || sequence >= end)
        {
            return Err(Report::new(DurableError::RecordOutsideRecoveryRange {
                name: T::declaration().name,
                sequence,
                start,
                end,
            }));
        }
        let record = T::decode(&bytes).change_context(DurableError::DecodeRecord {
            name: T::declaration().name,
            sequence,
        })?;
        records.push((sequence, record));
    }
    if let Some((_start, expected_end)) = expected_window {
        let observed_end = stream.next_sequence();
        if observed_end != expected_end {
            return Err(Report::new(DurableError::IncompleteScan {
                name: T::declaration().name,
                observed_end,
                expected_end,
            }));
        }
    }
    Ok(records)
}

pub(super) async fn scan_snapshot_records<T, R>(
    reader: &R,
    range: (Bound<JournalSequence>, Bound<JournalSequence>),
    expected_end: JournalSequence,
) -> Result<Vec<SnapshotCandidate<T>>, Report<DurableError>>
where
    T: DurableRecord,
    R: JournalReader,
{
    let mut stream = pin!(
        reader
            .scan(Bytes::from_static(PROJECTION_SNAPSHOTS_KEY), range)
            .await?
    );
    let mut records = Vec::new();
    while let Some((sequence, bytes)) = stream.try_next().await? {
        if sequence >= expected_end {
            return Err(Report::new(DurableError::RecordOutsideRecoveryRange {
                name: T::declaration().name,
                sequence,
                start: JournalSequence::new(0),
                end: expected_end,
            }));
        }
        records.push((sequence, T::decode(&bytes)));
    }
    if stream.next_sequence() != expected_end {
        return Err(Report::new(DurableError::IncompleteScan {
            name: T::declaration().name,
            observed_end: stream.next_sequence(),
            expected_end,
        }));
    }
    Ok(records)
}
