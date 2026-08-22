use hash_graph_temporal_versioning::{Timestamp, TransactionTime};
use time::Duration;

/// Moving a timestamp back by a duration and asking the distance between the two points
/// returns exactly that duration, so the two subtraction operators agree.
#[test]
fn duration_subtraction_round_trips_through_timestamp_difference() {
    let now = Timestamp::<TransactionTime>::now();
    let lag = Duration::seconds(60);

    let watermark = now - lag;
    assert_eq!(now - watermark, lag);
}

#[test]
fn zero_duration_subtraction_is_identity() {
    let now = Timestamp::<TransactionTime>::now();

    assert_eq!(now - Duration::ZERO, now);
}

#[test]
fn negative_duration_subtraction_moves_forward() {
    let now = Timestamp::<TransactionTime>::now();

    let later = now - Duration::seconds(-60);
    assert_eq!(later - now, Duration::seconds(60));
}

/// The operator inherits the wrapped time type's range check rather than saturating.
#[test]
#[should_panic = "out of range"]
fn out_of_range_subtraction_panics() {
    let _: Timestamp<TransactionTime> = Timestamp::UNIX_EPOCH - Duration::MAX;
}
