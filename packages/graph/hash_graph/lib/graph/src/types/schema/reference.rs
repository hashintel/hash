use core::fmt;

use serde::{Deserialize, Serialize};

use crate::types::schema::{Validate, ValidationError};

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(transparent)]
pub struct Uri(String);

impl Uri {
    /// Creates a new `Uri` without validating.
    #[must_use]
    pub fn new_unchecked<T: Into<String>>(uri: T) -> Self {
        Self(uri.into())
    }

    /// Creates a new `Uri` from the given string.
    ///
    /// # Errors
    ///
    /// - [`ValidationError`] if validation is failing.
    pub fn new<T: Into<String>>(uri: T) -> Result<Self, ValidationError> {
        let uri = Self::new_unchecked(uri);
        uri.validate()?;
        Ok(uri)
    }
}

impl fmt::Display for Uri {
    fn fmt(&self, fmt: &mut fmt::Formatter) -> fmt::Result {
        write!(fmt, "{}", self.0)
    }
}

impl Validate for Uri {
    fn validate(&self) -> Result<(), ValidationError> {
        Ok(())
    }
}

/// Property Object values must be defined through references to the same valid URI to a Property
/// Type.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PropertyTypeReference {
    #[serde(rename = "$ref")]
    reference: Uri,
}

impl PropertyTypeReference {
    /// Creates a new `PropertyTypeReference` without validating.
    #[must_use]
    pub const fn new_unchecked(reference: Uri) -> Self {
        Self { reference }
    }

    /// Creates a new `PropertyTypeReference` from the given `reference`.
    ///
    /// # Errors
    ///
    /// - [`ValidationError`] if validation is failing.
    pub fn new(reference: Uri) -> Result<Self, ValidationError> {
        let reference = Self::new_unchecked(reference);
        reference.validate()?;
        Ok(reference)
    }

    #[must_use]
    pub const fn reference(&self) -> &Uri {
        &self.reference
    }
}

impl Validate for PropertyTypeReference {
    fn validate(&self) -> Result<(), ValidationError> {
        Ok(())
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct DataTypeReference {
    #[serde(rename = "$ref")]
    reference: Uri,
}

impl DataTypeReference {
    /// Creates a new `DataTypeReference` without validating.
    #[must_use]
    pub const fn new_unchecked(reference: Uri) -> Self {
        Self { reference }
    }

    /// Creates a new `DataTypeReference` from the given `reference`.
    ///
    /// # Errors
    ///
    /// - [`ValidationError`] if validation is failing.
    pub fn new(reference: Uri) -> Result<Self, ValidationError> {
        let reference = Self::new_unchecked(reference);
        reference.validate()?;
        Ok(reference)
    }

    #[must_use]
    pub const fn reference(&self) -> &Uri {
        &self.reference
    }
}

impl Validate for DataTypeReference {
    fn validate(&self) -> Result<(), ValidationError> {
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use std::error::Error;

    use serde_json::json;

    use super::*;

    #[test]
    fn data_type_reference() -> Result<(), Box<dyn Error>> {
        let reference = DataTypeReference::new(Uri::new("https://example.com/data_type")?)?;
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
}
