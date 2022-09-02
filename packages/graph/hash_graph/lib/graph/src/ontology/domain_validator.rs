use std::fmt;

use error_stack::{Context, IntoReport, ResultExt};
use regex::{Captures, Regex};
use type_system::{DataType, EntityType, LinkType, PropertyType};

#[derive(Debug)]
pub struct DomainValidationError;

impl Context for DomainValidationError {}

impl fmt::Display for DomainValidationError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str("URL failed to validate ")
    }
}

pub trait ValidateOntologyType<T> {
    /// Checks a given type's ID against the given domain validation regex.
    ///
    /// # Errors
    ///
    /// - [`DomainValidationError`], if the base URI doesn't match or the kind is invalid
    fn validate(&self, ontology_type: &T) -> error_stack::Result<(), DomainValidationError>;
}

/// TODO: DOC
pub struct DomainValidator(Regex);

impl DomainValidator {
    #[must_use]
    pub fn new(regex: Regex) -> Self {
        regex
            .capture_names()
            .position(|capture_name| capture_name == Some("shortname"))
            .expect("shortname capture group was missing");

        regex
            .capture_names()
            .position(|capture_name| capture_name == Some("shortname"))
            .expect("shortname capture group was missing");

        Self(regex)
    }

    #[must_use]
    pub fn validate_url(&self, url: &str) -> bool {
        self.0.is_match(url)
    }

    fn captures<'a>(
        &'a self,
        url: &'a str,
    ) -> error_stack::Result<Captures, DomainValidationError> {
        self.0
            .captures(url)
            .ok_or(DomainValidationError)
            .into_report()
    }

    // TODO - we don't need to get the captures twice if we're always going to extract both
    /// Returns the capture of group with name "shortname"
    ///
    /// # Errors
    ///
    /// - [`DomainValidationError`], if "shortname" didn't capture anything
    pub fn extract_shortname<'a>(
        &'a self,
        url: &'a str,
    ) -> error_stack::Result<&str, DomainValidationError> {
        self.captures(url)?
            .name("shortname")
            .map(|matched| matched.as_str())
            .ok_or(DomainValidationError)
            .into_report()
            .attach_printable("missing shortname")
    }

    /// Returns the capture of group with name "kind"
    ///
    /// # Errors
    ///
    /// - [`DomainValidationError`], if "kind" didn't capture anything
    pub fn extract_kind<'a>(
        &'a self,
        url: &'a str,
    ) -> error_stack::Result<&str, DomainValidationError> {
        self.captures(url)?
            .name("kind")
            .map(|matched| matched.as_str())
            .ok_or(DomainValidationError)
            .into_report()
            .attach_printable("missing ontology type kind")
    }
}

impl ValidateOntologyType<DataType> for DomainValidator {
    fn validate(&self, ontology_type: &DataType) -> error_stack::Result<(), DomainValidationError> {
        let base_uri = ontology_type.id().base_uri();

        if !self.validate_url(base_uri.as_str()) {
            return Err(DomainValidationError)
                .into_report()
                .attach_printable("Data Type base URI didn't match the given validation regex");
        };

        let kind = self.extract_kind(base_uri.as_str())?;
        if kind != "data-type" {
            return Err(DomainValidationError)
                .into_report()
                .attach_printable_lazy(|| {
                    format!("Data Type base URI had the incorrect ontology kind slug: {kind}")
                });
        };
        // TODO check that the user has write access to the shortname

        Ok(())
    }
}

impl ValidateOntologyType<PropertyType> for DomainValidator {
    fn validate(
        &self,
        ontology_type: &PropertyType,
    ) -> error_stack::Result<(), DomainValidationError> {
        let base_uri = ontology_type.id().base_uri();

        if !self.validate_url(base_uri.as_str()) {
            return Err(DomainValidationError).into_report().attach_printable(
                "Property Type base URI didn't match the given validation regex",
            );
        };

        let kind = self.extract_kind(base_uri.as_str())?;
        if kind != "property-type" {
            return Err(DomainValidationError)
                .into_report()
                .attach_printable_lazy(|| {
                    format!("Property Type base URI had the incorrect ontology kind slug: {kind}")
                });
        };
        // TODO check that the user has write access to the shortname
        Ok(())
    }
}

impl ValidateOntologyType<EntityType> for DomainValidator {
    fn validate(
        &self,
        ontology_type: &EntityType,
    ) -> error_stack::Result<(), DomainValidationError> {
        let base_uri = ontology_type.id().base_uri();

        if !self.validate_url(base_uri.as_str()) {
            return Err(DomainValidationError)
                .into_report()
                .attach_printable("Entity Type base URI didn't match the given validation regex");
        };

        let kind = self.extract_kind(base_uri.as_str())?;
        if kind != "entity-type" {
            return Err(DomainValidationError)
                .into_report()
                .attach_printable_lazy(|| {
                    format!("Entity Type base URI had the incorrect ontology kind slug: {kind}")
                });
        };
        // TODO check that the user has write access to the shortname
        Ok(())
    }
}

impl ValidateOntologyType<LinkType> for DomainValidator {
    fn validate(&self, ontology_type: &LinkType) -> error_stack::Result<(), DomainValidationError> {
        let base_uri = ontology_type.id().base_uri();

        if !self.validate_url(base_uri.as_str()) {
            return Err(DomainValidationError)
                .into_report()
                .attach_printable("Link Type base URI didn't match the given validation regex");
        };

        let kind = self.extract_kind(base_uri.as_str())?;
        if kind != "link-type" {
            return Err(DomainValidationError)
                .into_report()
                .attach_printable_lazy(|| {
                    format!("Link Type base URI had the incorrect ontology kind slug: {kind}")
                });
        };
        // TODO check that the user has write access to the shortname
        Ok(())
    }
}
