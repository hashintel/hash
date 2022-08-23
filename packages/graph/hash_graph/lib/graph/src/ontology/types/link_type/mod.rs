use serde::{Deserialize, Serialize};
use type_system::uri::VersionedUri;

/// Will serialize as a constant value `"linkType"`
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
enum LinkTypeTag {
    LinkType,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LinkType {
    kind: LinkTypeTag,
    #[serde(rename = "$id")]
    id: VersionedUri,
    title: String,
    description: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    related_keywords: Vec<String>,
}

impl LinkType {
    /// Creates a new `LinkType`.
    #[must_use]
    pub const fn new(
        id: VersionedUri,
        title: String,
        description: String,
        related_keywords: Vec<String>,
    ) -> Self {
        Self {
            kind: LinkTypeTag::LinkType,
            id,
            title,
            description,
            related_keywords,
        }
    }

    #[must_use]
    pub const fn id(&self) -> &VersionedUri {
        &self.id
    }

    #[must_use]
    pub fn title(&self) -> &str {
        &self.title
    }

    #[must_use]
    pub fn description(&self) -> &str {
        &self.description
    }

    #[must_use]
    pub fn related_keywords(&self) -> &[String] {
        &self.related_keywords
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_link_type_schema(schema: &serde_json::Value) -> LinkType {
        let link_type: LinkType = serde_json::from_value(schema.clone()).expect("invalid schema");
        assert_eq!(
            serde_json::to_value(link_type.clone()).expect("Could not serialize"),
            *schema,
            "{link_type:#?}"
        );
        link_type
    }

    #[test]
    fn owns() {
        test_link_type_schema(
            &serde_json::from_str(crate::test_data::link_type::OWNS_V2).expect("invalid JSON"),
        );
    }

    #[test]
    fn submitted_by() {
        test_link_type_schema(
            &serde_json::from_str(crate::test_data::link_type::SUBMITTED_BY_V1)
                .expect("invalid JSON"),
        );
    }
}
