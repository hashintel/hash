use std::sync::Mutex;

use hash_graph_temporal_versioning::{Timestamp, TransactionTime};
use uuid::{ContextV7, Uuid};

static CONTEXT: Mutex<ContextV7> = Mutex::new(ContextV7::new());

/// Generates a version 7 UUID that carries `transaction_time`.
///
/// Every UUID generated in the process shares one counter, so each UUID sorts after the ones
/// generated before it. The counter never moves back in time: when transactions generate IDs out
/// of order, a UUID generated for an earlier transaction time than a previous one carries the
/// previous, later time instead. Such a UUID's time can lie a few milliseconds after the
/// transaction time it is stored with.
///
/// Returns `None` if `transaction_time` lies before the Unix epoch, which a version 7 UUID cannot
/// encode.
#[must_use]
pub fn generate_uuid(transaction_time: Timestamp<TransactionTime>) -> Option<Uuid> {
    let elapsed = transaction_time.duration_since_unix_epoch()?;

    Some(Uuid::new_v7(uuid::Timestamp::from_unix(
        &CONTEXT,
        elapsed.as_secs(),
        elapsed.subsec_nanos(),
    )))
}

#[cfg(test)]
mod tests {
    use hash_graph_temporal_versioning::{Timestamp, TransactionTime};
    use uuid::{Uuid, Version};

    use super::generate_uuid;
    use crate::{
        knowledge::entity::id::{DraftId, EntityEditionId, EntityUuid},
        principal::{
            actor::{AiId, MachineId, UserId},
            actor_group::{TeamId, WebId},
            role::{TeamRoleId, WebRoleId},
        },
    };

    #[test]
    fn generate_uuid_orders_by_transaction_time() {
        // Later than any other time a test in this crate generates an ID for, so no other test
        // moves the shared counter past it.
        let later = Timestamp::<TransactionTime>::from_unix_timestamp(4_000_000_001);
        let earlier = Timestamp::<TransactionTime>::from_unix_timestamp(4_000_000_000);

        let first = generate_uuid(later).expect("a time after the Unix epoch should be encodable");
        assert_eq!(
            first.get_version(),
            Some(Version::SortRand),
            "the UUID should be a version 7 UUID"
        );
        assert_eq!(
            first.get_timestamp().map(|timestamp| timestamp.to_unix()),
            Some((4_000_000_001, 0)),
            "the UUID should carry the transaction time"
        );

        let second =
            generate_uuid(earlier).expect("a time after the Unix epoch should be encodable");
        assert!(
            second > first,
            "a UUID should sort after the UUIDs generated before it"
        );
        assert_eq!(
            second.get_timestamp().map(|timestamp| timestamp.to_unix()),
            Some((4_000_000_001, 0)),
            "a UUID for an earlier transaction time should carry the latest time generated so far"
        );
    }

    #[test]
    fn generate_uuid_rejects_pre_epoch_transaction_time() {
        assert_eq!(
            generate_uuid(Timestamp::<TransactionTime>::from_unix_timestamp(-1)),
            None,
            "a time before the Unix epoch should not be encodable"
        );
    }

    #[test]
    fn id_constructors_generate_version_7_uuids() {
        let transaction_time = Timestamp::<TransactionTime>::now();

        for uuid in [
            EntityUuid::new(transaction_time).map(Uuid::from),
            DraftId::new(transaction_time).map(Uuid::from),
            EntityEditionId::new(transaction_time).map(EntityEditionId::into_uuid),
            UserId::new(transaction_time).map(Uuid::from),
            MachineId::new(transaction_time).map(Uuid::from),
            AiId::new(transaction_time).map(Uuid::from),
            WebId::new(transaction_time).map(Uuid::from),
            TeamId::new(transaction_time).map(Uuid::from),
            WebRoleId::new(transaction_time).map(Uuid::from),
            TeamRoleId::new(transaction_time).map(Uuid::from),
        ] {
            assert_eq!(
                uuid.and_then(|uuid| uuid.get_version()),
                Some(Version::SortRand),
                "the ID should be a version 7 UUID"
            );
        }
    }
}
