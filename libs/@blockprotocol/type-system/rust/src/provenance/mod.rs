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
    origin::{OriginProvenance, OriginType},
    source::{Location, SourceProvenance, SourceType},
};

#[cfg(test)]
mod tests {
    use alloc::collections::BTreeSet;

    use serde::{Serialize, de::DeserializeOwned};
    use serde_json::{Value, json};
    use time::OffsetDateTime;
    use url::Url;

    use super::{Location, OriginProvenance, OriginType, SourceProvenance, SourceType};

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
        assert!(
            matches!(
                &location,
                Location {
                    name: Some(_),
                    uri: Some(_),
                    description: Some(_),
                }
            ),
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
        assert!(
            matches!(
                &source,
                SourceProvenance {
                    ty: _,
                    entity_id: Some(_),
                    authors: _,
                    location: Some(_),
                    first_published: Some(_),
                    last_updated: Some(_),
                    loaded_at: Some(_),
                }
            ),
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
            user_agent: Some("agent".to_owned()),
        };
        assert!(
            matches!(
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
                }
            ),
            "should set every optional field"
        );
        null_rejected(&origin);
    }
}
