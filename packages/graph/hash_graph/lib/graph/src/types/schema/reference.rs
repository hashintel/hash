use core::fmt;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize, sqlx::Type)]
#[serde(transparent)]
#[sqlx(transparent)]
pub struct Uri(String);

impl Uri {
    /// Creates a new `Uri` from the given string.
    #[must_use]
    pub fn new<T: Into<String>>(uri: T) -> Self {
        Self(uri.into())
    }
}

impl fmt::Display for Uri {
    fn fmt(&self, fmt: &mut fmt::Formatter) -> fmt::Result {
        write!(fmt, "{}", self.0)
    }
}

/// Property Object values must be defined through references to the same valid URI to a Property
/// Type.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PropertyTypeReference {
    #[serde(rename = "$ref")]
    reference: Uri,
}

impl PropertyTypeReference {
    /// Creates a new `PropertyTypeReference` from the given `reference`.
    #[must_use]
    pub const fn new(reference: Uri) -> Self {
        Self { reference }
    }

    #[must_use]
    pub const fn reference(&self) -> &Uri {
        &self.reference
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct DataTypeReference {
    #[serde(rename = "$ref")]
    reference: Uri,
}

impl DataTypeReference {
    /// Creates a new `DataTypeReference` from the given `reference`.
    #[must_use]
    pub const fn new(reference: Uri) -> Self {
        Self { reference }
    }

    #[must_use]
    pub const fn reference(&self) -> &Uri {
        &self.reference
    }
}

#[cfg(test)]
mod tests {
    use std::error::Error;

    use serde_json::json;

    use super::*;

    #[test]
    fn data_type_reference() -> Result<(), Box<dyn Error>> {
        let reference = DataTypeReference::new(Uri::new("https://example.com/data_type"));
        let json = serde_json::to_value(&reference)?;

        assert_eq!(
            json,
            json!({
                "$ref": "https://example.com/data_type"
            })
        );

        let reference2: DataTypeReference = serde_json::from_value(json)?;
        assert_eq!(reference, reference2);
        Ok(())
    }

    #[test]
    fn property_type_reference() -> Result<(), Box<dyn Error>> {
        let reference = PropertyTypeReference::new(Uri::new("https://example.com/data_type"));
        let json = serde_json::to_value(&reference)?;

        assert_eq!(
            json,
            json!({
                "$ref": "https://example.com/data_type"
            })
        );

        let reference2: PropertyTypeReference = serde_json::from_value(json)?;
        assert_eq!(reference, reference2);
        Ok(())
    }
}
