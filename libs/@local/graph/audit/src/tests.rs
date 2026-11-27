use core::mem::variant_count;
use std::collections::HashSet;

use serde_json::json;
use time::OffsetDateTime;
use type_system::principal::{actor::UserId, actor_group::WebId};
use uuid::Uuid;

use crate::{
    AuditAction, AuditActionName, AuditActor, AuditContext, AuditEvent, AuditEventId, Target,
    TargetKind,
};

/// Every action name. The length is the variant count, so a new variant stops compiling here
/// until it is listed, and the uniqueness test fails if a variant is listed twice.
const ACTION_NAMES: [AuditActionName; variant_count::<AuditActionName>()] = [
    AuditActionName::ApiTokenCreate,
    AuditActionName::ApiTokenRevoke,
    AuditActionName::UserDelete,
];

/// Every target kind, listed under the same two guards as [`ACTION_NAMES`].
const TARGET_KINDS: [TargetKind; variant_count::<TargetKind>()] =
    [TargetKind::ApiToken, TargetKind::User];

fn is_snake_case(segment: &str) -> bool {
    !segment.is_empty()
        && segment
            .bytes()
            .all(|byte| byte.is_ascii_lowercase() || byte == b'_')
}

#[derive(Debug, serde::Serialize)]
struct UserDeleted {
    #[serde(skip)]
    user_id: UserId,
    entities_deleted: u32,
}

impl AuditAction for UserDeleted {
    const NAME: AuditActionName = AuditActionName::UserDelete;

    fn target(&self) -> Option<Target> {
        Some(Target::from(self.user_id))
    }
}

#[test]
fn action_names_unique() {
    let names = ACTION_NAMES.map(AuditActionName::as_str);
    let unique = names.iter().collect::<HashSet<_>>();

    assert_eq!(
        unique.len(),
        names.len(),
        "each action should have a name of its own: {names:?}"
    );
}

#[test]
fn action_names_dotted_snake_case() {
    for name in ACTION_NAMES.map(AuditActionName::as_str) {
        let segments = name.split('.').collect::<Vec<_>>();

        assert!(
            segments.len() >= 2 && segments.iter().copied().all(is_snake_case),
            "`{name}` should be two or more snake_case segments joined by dots"
        );
    }
}

#[test]
fn target_kinds_unique() {
    let kinds = TARGET_KINDS.map(TargetKind::as_str);
    let unique = kinds.iter().collect::<HashSet<_>>();

    assert_eq!(
        unique.len(),
        kinds.len(),
        "each kind should have a name of its own: {kinds:?}"
    );
}

#[test]
fn target_kinds_snake_case() {
    for kind in TARGET_KINDS.map(TargetKind::as_str) {
        assert!(is_snake_case(kind), "`{kind}` should be snake_case");
    }
}

#[test]
fn event_keeps_action() {
    let user_id = UserId::new(Uuid::from_u128(1));
    let context = AuditContext {
        actor: AuditActor::User(user_id),
        client_ip: None,
        user_agent: None,
        trace_id: None,
    };

    let event = AuditEvent::new(
        context,
        Some(WebId::from(user_id)),
        UserDeleted {
            user_id,
            entities_deleted: 3,
        },
    );

    assert_eq!(
        event.action_name(),
        AuditActionName::UserDelete,
        "the event should carry the name of its action"
    );
    assert_eq!(
        event.target(),
        Some(Target::from(user_id)),
        "the event should carry the target of its action"
    );
    assert_eq!(
        serde_json::to_value(event.details()).expect("should serialize the details"),
        json!({ "entities_deleted": 3 }),
        "the details should be the serialized fields of the action"
    );
}

#[test]
fn event_id_at_time() {
    let time = OffsetDateTime::from_unix_timestamp_nanos(1_795_000_000_123_456_789)
        .expect("should be a valid time");

    let timestamp = Uuid::from(AuditEventId::at(time))
        .get_timestamp()
        .expect("should be a version 7 UUID")
        .to_unix();

    assert_eq!(
        timestamp,
        (1_795_000_000, 123_000_000),
        "the identifier should begin with the time, cut to the millisecond"
    );
}
