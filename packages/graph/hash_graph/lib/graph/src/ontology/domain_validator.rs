use std::fmt;

use error_stack::{Context, IntoReport, ResultExt};
use regex::{Captures, Regex};
use type_system::{DataType, EntityType, PropertyType};

#[derive(Debug)]
pub struct DomainValidationError;

impl Context for DomainValidationError {}

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
    /// - [`DomainValidationError`], if the base URI doesn't match or the kind is invalid
    fn validate(&self, ontology_type: &T) -> error_stack::Result<(), DomainValidationError>;
}

#[expect(dead_code, reason = "We currently don't validate the shortname")]
struct ShortNameAndKind<'a> {
    pub short_name: &'a str,
    pub kind: &'a str,
}

/// Responsible for validating Type URIs against a known valid pattern.
#[derive(Clone)]
pub struct DomainValidator(Regex);

impl DomainValidator {
    #[must_use]
    /// Creates a new `DomainValidator`
    ///
    /// # Panics
    ///
    /// - If the "shortname" or "kind" named capture groups are missing
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

    /// Returns the captures of the groups "shortname" and "kind"
    ///
    /// # Errors
    ///
    /// - [`DomainValidationError`], if "shortname" or "kind" didn't capture anything
    fn extract_shortname_and_kind<'a>(
        &'a self,
        url: &'a str,
    ) -> error_stack::Result<ShortNameAndKind, DomainValidationError> {
        let captures = self.captures(url)?;

        let short_name = captures
            .name("shortname")
            .map(|matched| matched.as_str())
            .ok_or(DomainValidationError)
            .into_report()
            .attach_printable("missing shortname")?;

        let kind = captures
            .name("kind")
            .map(|matched| matched.as_str())
            .ok_or(DomainValidationError)
            .into_report()
            .attach_printable("missing ontology type kind")?;

        Ok(ShortNameAndKind { short_name, kind })
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

        let ShortNameAndKind {
            short_name: _,
            kind,
        } = self.extract_shortname_and_kind(base_uri.as_str())?;
        if kind != "data-type" {
            return Err(DomainValidationError)
                .into_report()
                .attach_printable_lazy(|| {
                    format!("Data Type base URI had the incorrect ontology kind slug: {kind}")
                });
        };

        // TODO - check that the user has write access to the shortname, this will require us
        //  making the graph aware of shortnames. We can store them alongside accountIds. We should
        //  not have to make the graph aware of User entities being a thing however.
        //  https://app.asana.com/0/1202805690238892/1202931031833224/f
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

        let ShortNameAndKind {
            short_name: _,
            kind,
        } = self.extract_shortname_and_kind(base_uri.as_str())?;
        if kind != "property-type" {
            return Err(DomainValidationError)
                .into_report()
                .attach_printable_lazy(|| {
                    format!("Property Type base URI had the incorrect ontology kind slug: {kind}")
                });
        };

        // TODO - check that the user has write access to the shortname, this will require us
        //  making the graph aware of shortnames. We can store them alongside accountIds. We should
        //  not have to make the graph aware of User entities being a thing however.
        //  https://app.asana.com/0/1202805690238892/1202931031833224/f
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

        let ShortNameAndKind {
            short_name: _,
            kind,
        } = self.extract_shortname_and_kind(base_uri.as_str())?;
        if kind != "entity-type" {
            return Err(DomainValidationError)
                .into_report()
                .attach_printable_lazy(|| {
                    format!("Entity Type base URI had the incorrect ontology kind slug: {kind}")
                });
        };

        // TODO - check that the user has write access to the shortname, this will require us
        //  making the graph aware of shortnames. We can store them alongside accountIds. We should
        //  not have to make the graph aware of User entities being a thing however.
        //  https://app.asana.com/0/1202805690238892/1202931031833224/f
        Ok(())
    }
}
