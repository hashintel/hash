use std::collections::HashMap;

use serde::{Deserialize, Serialize};

use crate::ontology::types::uri::BaseUri;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Entity {
    #[serde(flatten)]
    properties: HashMap<BaseUri, serde_json::Value>,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_entity(json: &str) {
        let json_value: serde_json::Value = serde_json::from_str(json).expect("invalid JSON");

        let entity: Entity = serde_json::from_value(json_value.clone()).expect("invalid entity");

        assert_eq!(
            serde_json::to_value(entity.clone()).expect("could not serialize"),
            json_value,
            "{entity:#?}"
        );
    }

    #[test]
    fn book() {
        test_entity(crate::test_data::entity::BOOK_V1);
    }

    #[test]
    fn address() {
        test_entity(crate::test_data::entity::ADDRESS_V1);
    }

    #[test]
    fn organization() {
        test_entity(crate::test_data::entity::ORGANIZATION_V1);
    }

    #[test]
    fn building() {
        test_entity(crate::test_data::entity::BUILDING_V1);
    }

    #[test]
    fn person() {
        test_entity(crate::test_data::entity::PERSON_V1);
    }

    #[test]
    fn playlist() {
        test_entity(crate::test_data::entity::PLAYLIST_V1);
    }

    #[test]
    fn song() {
        test_entity(crate::test_data::entity::SONG_V1);
    }

    #[test]
    fn page() {
        test_entity(crate::test_data::entity::PAGE_V1);
    }
}
