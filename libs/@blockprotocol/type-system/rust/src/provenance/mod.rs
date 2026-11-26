//! Provenance module for tracking the origin and history of types.
//!
//! This module provides types for recording and tracking the provenance of ontology types
//! within the Block Protocol Type System. It defines structures for:
//!
//! 1. Actors - Entities that create or modify types (people, systems, organizations)
//! 2. Origins - Information about how types came into existence
//! 3. Sources - References to external sources that influenced type definitions
//!
//! These components work together to create a complete provenance record for ontology types,
//! enabling traceability and attribution throughout the type system.

mod origin;
mod source;
pub mod validation;

pub use self::{
    origin::{OriginProvenance, OriginType, UserAgent},
    source::{Location, SourceProvenance, SourceType},
};

#[cfg(test)]
mod tests {
    use alloc::collections::BTreeSet;
    use core::assert_matches;

    use serde::{Serialize, de::DeserializeOwned};
    use serde_json::{Value, json};
    use time::OffsetDateTime;
    use url::Url;

    use super::{Location, OriginProvenance, OriginType, SourceProvenance, SourceType, UserAgent};

    /// Sets each field of `value` to `null` in turn and expects reading it back to fail.
    ///
    /// Each test first matches its value against a pattern that names every field, so a new field
    /// does not compile until the value sets it and this check covers it.
    fn null_rejected<T: Serialize + DeserializeOwned>(value: &T) {
        let Value::Object(fields) = serde_json::to_value(value).expect("should serialize") else {
            panic!("should serialize as an object");
        };
        for key in fields.keys() {
            let mut fields = fields.clone();
            fields.insert(key.clone(), Value::Null);
            assert!(
                serde_json::from_value::<T>(Value::Object(fields)).is_err(),
                "`{key}` should not accept `null`"
            );
        }
    }

    fn location() -> Location {
        Location {
            name: Some("Example".to_owned()),
            uri: Some(Url::parse("https://example.com/").expect("should be a URL")),
            description: Some("A page".to_owned()),
        }
    }

    #[test]
    fn location_null() {
        let location = location();
        assert_matches!(
            &location,
            Location {
                name: Some(_),
                uri: Some(_),
                description: Some(_),
            },
            "should set every optional field"
        );
        null_rejected(&location);
    }

    #[test]
    fn source_null() {
        let source = SourceProvenance {
            ty: SourceType::Webpage,
            entity_id: Some(
                serde_json::from_value(json!(
                    "8d86c8c3-d66d-43d1-859b-676c3bcaeadc~be2c5b2f-e3e1-4f26-a0c4-0f8b5e9c4a1d"
                ))
                .expect("should be an entity ID"),
            ),
            authors: vec!["Alice".to_owned()],
            location: Some(location()),
            first_published: Some(OffsetDateTime::UNIX_EPOCH),
            last_updated: Some(OffsetDateTime::UNIX_EPOCH),
            loaded_at: Some(OffsetDateTime::UNIX_EPOCH),
        };
        assert_matches!(
            &source,
            SourceProvenance {
                ty: _,
                entity_id: Some(_),
                authors: _,
                location: Some(_),
                first_published: Some(_),
                last_updated: Some(_),
                loaded_at: Some(_),
            },
            "should set every optional field"
        );
        null_rejected(&source);
    }

    #[test]
    fn origin_null() {
        let origin = OriginProvenance {
            ty: OriginType::Flow {
                step_ids: BTreeSet::from(["1".to_owned()]),
            },
            id: Some("run".to_owned()),
            version: Some("v1".to_owned()),
            semantic_version: Some(semver::Version::new(1, 2, 3)),
            environment: Some("production".to_owned()),
            device_id: Some("device".to_owned()),
            session_id: Some("session".to_owned()),
            api_key_public_id: Some("token".to_owned()),
            user_agent: Some(UserAgent::new("agent")),
        };
        assert_matches!(
            &origin,
            OriginProvenance {
                ty: _,
                id: Some(_),
                version: Some(_),
                semantic_version: Some(_),
                environment: Some(_),
                device_id: Some(_),
                session_id: Some(_),
                api_key_public_id: Some(_),
                user_agent: Some(_),
            },
            "should set every optional field"
        );
        null_rejected(&origin);
    }

    #[test]
    fn user_agent_at_max_length() {
        let user_agent = "a".repeat(UserAgent::MAX_LENGTH);

        assert_eq!(
            UserAgent::new(user_agent.as_str()).as_str(),
            user_agent,
            "a user agent of the maximum length should be kept whole"
        );
    }

    /// The limit counts characters, so a user agent of multi-byte characters keeps as many of them.
    #[test]
    fn user_agent_over_max_length() {
        let user_agent = "\u{e4}".repeat(UserAgent::MAX_LENGTH + 1);

        assert_eq!(
            UserAgent::new(user_agent).as_str(),
            "\u{e4}".repeat(UserAgent::MAX_LENGTH),
            "a longer user agent should be cut to the maximum length"
        );
    }

    #[test]
    fn origin_user_agent_cut() {
        let origin: OriginProvenance = serde_json::from_value(json!({
            "type": "api",
            "userAgent": "a".repeat(UserAgent::MAX_LENGTH + 1),
        }))
        .expect("should read the origin");

        assert_eq!(
            origin.user_agent,
            Some(UserAgent::new("a".repeat(UserAgent::MAX_LENGTH))),
            "a longer user agent should be cut when the origin is read"
        );
    }
}
