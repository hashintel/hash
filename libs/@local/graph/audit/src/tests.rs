use std::collections::HashSet;

use serde_json::json;
use time::OffsetDateTime;
use type_system::principal::{actor::UserId, actor_group::WebId};
use uuid::Uuid;

use crate::{
    ActionName, AuditAction, AuditActor, AuditContext, AuditEvent, AuditEventId, Target,
    TargetKind, UserAgent,
};

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
    const NAME: ActionName = ActionName::UserDelete;

    fn target(&self) -> Option<Target> {
        Some(Target::from(self.user_id))
    }
}

#[test]
fn action_names_unique() {
    let names = enum_iterator::all::<ActionName>()
        .map(ActionName::as_str)
        .collect::<Vec<_>>();
    let unique = names.iter().collect::<HashSet<_>>();

    assert_eq!(
        unique.len(),
        names.len(),
        "each action should have a name of its own: {names:?}"
    );
}

#[test]
fn action_names_dotted_snake_case() {
    for name in enum_iterator::all::<ActionName>().map(ActionName::as_str) {
        let segments = name.split('.').collect::<Vec<_>>();

        assert!(
            segments.len() >= 2 && segments.iter().copied().all(is_snake_case),
            "`{name}` should be two or more snake_case segments joined by dots"
        );
    }
}

#[test]
fn target_kinds_unique() {
    let kinds = enum_iterator::all::<TargetKind>()
        .map(TargetKind::as_str)
        .collect::<Vec<_>>();
    let unique = kinds.iter().collect::<HashSet<_>>();

    assert_eq!(
        unique.len(),
        kinds.len(),
        "each kind should have a name of its own: {kinds:?}"
    );
}

#[test]
fn target_kinds_snake_case() {
    for kind in enum_iterator::all::<TargetKind>().map(TargetKind::as_str) {
        assert!(is_snake_case(kind), "`{kind}` should be snake_case");
    }
}

#[test]
fn user_agent_at_max_length() {
    let user_agent = "a".repeat(UserAgent::MAX_LENGTH);

    assert_eq!(
        UserAgent::new(&user_agent).as_str(),
        user_agent,
        "a user agent of the maximum length should be kept whole"
    );
}

/// The limit counts characters, so a user agent of multi-byte characters keeps as many of them.
#[test]
fn user_agent_over_max_length() {
    let user_agent = "\u{e4}".repeat(UserAgent::MAX_LENGTH + 1);

    assert_eq!(
        UserAgent::new(&user_agent).as_str(),
        "\u{e4}".repeat(UserAgent::MAX_LENGTH),
        "a longer user agent should be cut to the maximum length"
    );
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
        ActionName::UserDelete,
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
