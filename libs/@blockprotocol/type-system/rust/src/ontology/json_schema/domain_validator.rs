use core::{error::Error, fmt};

use error_stack::{Report, ResultExt as _};
use regex::{Captures, Regex};

use crate::ontology::{data_type::DataType, entity_type::EntityType, property_type::PropertyType};

/// Error returned when a URL fails domain validation.
///
/// This error occurs when a type's URL doesn't match the expected pattern
/// defined by the domain validator regex, indicating it's from an unsupported
/// or invalid domain.
#[derive(Debug, Clone)]
pub struct DomainValidationError;

impl Error for DomainValidationError {}

impl fmt::Display for DomainValidationError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str("URL failed to validate")
    }
}

pub trait ValidateOntologyType<T> {
    /// Checks a given type's ID against the given domain validation regex.
    ///
    /// # Errors
    ///
    /// - [`DomainValidationError`], if the base URL doesn't match or the kind is invalid
    fn validate(&self, ontology_type: &T) -> Result<(), Report<DomainValidationError>>;
}

#[expect(dead_code, reason = "We currently don't validate the shortname")]
struct ShortNameAndKind<'a> {
    pub short_name: &'a str,
    pub kind: &'a str,
}

/// Responsible for validating Type Urls against a known valid pattern.
#[derive(Clone)]
pub struct DomainValidator(Regex);

impl DomainValidator {
    /// Creates a new domain validator from a regex pattern.
    ///
    /// Initializes a validator that uses the provided regex to validate URLs against domain
    /// constraints. The regex must contain named capture groups for "shortname" and "kind"
    /// which will be used to extract and validate these components.
    ///
    /// # Panics
    ///
    /// Panics if the regex is missing the "shortname" or "kind" named capture groups.
    #[must_use]
    pub fn new(regex: Regex) -> Self {
        regex
            .capture_names()
            .position(|capture_name| capture_name == Some("shortname"))
            .expect("shortname capture group was missing");

        regex
            .capture_names()
            .position(|capture_name| capture_name == Some("kind"))
            .expect("kind capture group was missing");

        Self(regex)
    }

    /// Validates if a URL string matches the domain pattern.
    ///
    /// Checks whether the provided URL string conforms to the domain pattern defined
    /// by this validator's regex. Returns true if the URL is valid according to the pattern.
    #[must_use]
    pub fn validate_url(&self, url: &str) -> bool {
        self.0.is_match(url)
    }

    fn captures<'a>(&'a self, url: &'a str) -> Result<Captures<'a>, Report<DomainValidationError>> {
        Ok(self.0.captures(url).ok_or(DomainValidationError)?)
    }

    /// Returns the captures of the groups "shortname" and "kind"
    ///
    /// # Errors
    ///
    /// - [`DomainValidationError`], if "shortname" or "kind" didn't capture anything
    fn extract_shortname_and_kind<'a>(
        &'a self,
        url: &'a str,
    ) -> Result<ShortNameAndKind<'a>, Report<DomainValidationError>> {
        let captures = self.captures(url)?;

        let short_name = captures
            .name("shortname")
            .map(|matched| matched.as_str())
            .ok_or(DomainValidationError)
            .attach_printable("missing shortname")?;

        let kind = captures
            .name("kind")
            .map(|matched| matched.as_str())
            .ok_or(DomainValidationError)
            .attach_printable("missing ontology type kind")?;

        Ok(ShortNameAndKind { short_name, kind })
    }
}

impl ValidateOntologyType<DataType> for DomainValidator {
    fn validate(&self, ontology_type: &DataType) -> Result<(), Report<DomainValidationError>> {
        let base_url = &ontology_type.id.base_url;

        if !self.validate_url(base_url.as_str()) {
            return Err(DomainValidationError)
                .attach_printable("Data Type base URL didn't match the given validation regex");
        }

        let ShortNameAndKind {
            short_name: _,
            kind,
        } = self.extract_shortname_and_kind(base_url.as_str())?;
        if kind != "data-type" {
            return Err(DomainValidationError).attach_printable_lazy(|| {
                format!("Data Type base URL had the incorrect ontology kind slug: {kind}")
            });
        }

        // TODO: check that the user has write access to the shortname, this will require us
        //       making the graph aware of shortnames. We can store them alongside accountIds. We
        //       should not have to make the graph aware of User entities being a thing however.
        //   see https://linear.app/hash/issue/H-3010
        Ok(())
    }
}

impl ValidateOntologyType<PropertyType> for DomainValidator {
    fn validate(&self, ontology_type: &PropertyType) -> Result<(), Report<DomainValidationError>> {
        let base_url = &ontology_type.id.base_url;

        if !self.validate_url(base_url.as_str()) {
            return Err(DomainValidationError).attach_printable(
                "Property Type base URL didn't match the given validation regex",
            );
        }

        let ShortNameAndKind {
            short_name: _,
            kind,
        } = self.extract_shortname_and_kind(base_url.as_str())?;
        if kind != "property-type" {
            return Err(DomainValidationError).attach_printable_lazy(|| {
                format!("Property Type base URL had the incorrect ontology kind slug: {kind}")
            });
        }

        // TODO: check that the user has write access to the shortname, this will require us
        //       making the graph aware of shortnames. We can store them alongside accountIds. We
        //       should  not have to make the graph aware of User entities being a thing however.
        //   see https://linear.app/hash/issue/H-3010
        Ok(())
    }
}

impl ValidateOntologyType<EntityType> for DomainValidator {
    fn validate(&self, ontology_type: &EntityType) -> Result<(), Report<DomainValidationError>> {
        let base_url = &ontology_type.id.base_url;

        if !self.validate_url(base_url.as_str()) {
            return Err(DomainValidationError)
                .attach_printable("Entity Type base URL didn't match the given validation regex");
        }

        let ShortNameAndKind {
            short_name: _,
            kind,
        } = self.extract_shortname_and_kind(base_url.as_str())?;
        if kind != "entity-type" {
            return Err(DomainValidationError).attach_printable_lazy(|| {
                format!("Entity Type base URL had the incorrect ontology kind slug: {kind}")
            });
        }

        // TODO: check that the user has write access to the shortname, this will require us
        //       making the graph aware of shortnames. We can store them alongside accountIds. We
        //       should not have to make the graph aware of User entities being a thing however.
        //   see https://linear.app/hash/issue/H-3010
        Ok(())
    }
}
