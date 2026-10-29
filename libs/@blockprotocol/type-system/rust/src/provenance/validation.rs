//! Rules for the provenance HASH stores: that of an entity edition, of its properties and link
//! endpoints, and of an ontology type edition.
//!
//! Postgres stores provenance only as a [`Valid`] value, which [`ProvenanceValidator`] produces.
//! Provenance read back from Postgres counts as [`Valid`] without being checked again.

use core::{error::Error, fmt, ops::RangeInclusive};

use time::OffsetDateTime;

use crate::{
    Valid, Validator,
    knowledge::{
        entity::{Link, LinkEndpoint, provenance::ProvidedEntityEditionProvenance},
        property::{
            PropertyObjectWithMetadata, PropertyPath, PropertyPathElement, PropertyWithMetadata,
            metadata::{PropertyMetadata, PropertyObjectMetadata, PropertyProvenance},
        },
    },
    ontology::provenance::OntologyEditionProvenance,
    provenance::{Location, OriginProvenance, OriginType, SourceProvenance},
};

/// The most sources the provenance of an edition, a property or a link endpoint may list.
pub const MAX_SOURCES: usize = 255;

/// The most step IDs the origin of an edition may list.
pub(crate) const MAX_STEP_IDS: usize = 255;

/// The most characters a source's author or location name, or any text field of the origin,
/// may have.
pub const MAX_SHORT_TEXT_LENGTH: usize = 255;

/// The most characters a source's location URI or description may have.
///
/// A URI is measured in its parsed form, which encodes non-ASCII characters and can be longer
/// than the text sent.
pub(crate) const MAX_LONG_TEXT_LENGTH: usize = 4095;

/// The years a point in time in a source may fall into.
const YEARS: RangeInclusive<i32> = 0..=9999;

/// Whose provenance breaks a rule. `linkSource` and `linkTarget` stand for the provenance of the
/// link's connection to its left and right entity.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum ProvenanceOwner {
    /// The provenance of the edition.
    Edition,
    /// The provenance of the property at `path`. An empty path stands for the entity's
    /// properties as a whole.
    Property {
        #[cfg_attr(feature = "utoipa", schema(value_type = Vec<PropertyPathElement>))]
        path: PropertyPath<'static>,
    },
    /// The provenance of the link to its source entity.
    LinkSource,
    /// The provenance of the link to its target entity.
    LinkTarget,
}

impl fmt::Display for ProvenanceOwner {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Edition => fmt.write_str("the edition"),
            Self::Property { path } if path.is_empty() => fmt.write_str("the properties"),
            Self::Property { path } => {
                fmt.write_str("the property at ")?;
                for element in path.as_ref() {
                    match element {
                        PropertyPathElement::Property(key) => write!(fmt, "[\"{key}\"]")?,
                        PropertyPathElement::Index(index) => write!(fmt, "[{index}]")?,
                    }
                }
                Ok(())
            }
            Self::LinkSource => fmt.write_str("the link to its source"),
            Self::LinkTarget => fmt.write_str("the link to its target"),
        }
    }
}

/// A field of a source that breaks a rule.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum SourceField {
    EntityId,
    /// The author at the index.
    Author(usize),
    LocationName,
    LocationUri,
    LocationDescription,
    FirstPublished,
    LastUpdated,
    LoadedAt,
}

/// A field of the origin that breaks a rule.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum OriginField {
    Id,
    Version,
    SemanticVersion,
    Environment,
    DeviceId,
    SessionId,
    ApiKeyPublicId,
    UserAgent,
    StepIds,
    /// The step ID at the index, with the step IDs in ascending order.
    StepId(usize),
}

/// The field of the provenance that breaks a rule.
///
/// Serializes as its path in the provenance, such as `sources[3].location.uri`.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum ProvenanceField {
    /// The list of sources.
    Sources,
    /// A field of the source at the index.
    Source { index: usize, field: SourceField },
    /// A field of the origin.
    Origin(OriginField),
}

impl fmt::Display for ProvenanceField {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Sources => fmt.write_str("sources"),
            Self::Source { index, field } => {
                write!(fmt, "sources[{index}].")?;
                match field {
                    SourceField::EntityId => fmt.write_str("entityId"),
                    SourceField::Author(author) => write!(fmt, "authors[{author}]"),
                    SourceField::LocationName => fmt.write_str("location.name"),
                    SourceField::LocationUri => fmt.write_str("location.uri"),
                    SourceField::LocationDescription => fmt.write_str("location.description"),
                    SourceField::FirstPublished => fmt.write_str("firstPublished"),
                    SourceField::LastUpdated => fmt.write_str("lastUpdated"),
                    SourceField::LoadedAt => fmt.write_str("loadedAt"),
                }
            }
            Self::Origin(field) => {
                fmt.write_str("origin.")?;
                match field {
                    OriginField::Id => fmt.write_str("id"),
                    OriginField::Version => fmt.write_str("version"),
                    OriginField::SemanticVersion => fmt.write_str("semanticVersion"),
                    OriginField::Environment => fmt.write_str("environment"),
                    OriginField::DeviceId => fmt.write_str("deviceId"),
                    OriginField::SessionId => fmt.write_str("sessionId"),
                    OriginField::ApiKeyPublicId => fmt.write_str("apiKeyPublicId"),
                    OriginField::UserAgent => fmt.write_str("userAgent"),
                    OriginField::StepIds => fmt.write_str("stepIds"),
                    OriginField::StepId(index) => write!(fmt, "stepIds[{index}]"),
                }
            }
        }
    }
}

impl serde::Serialize for ProvenanceField {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.collect_str(self)
    }
}

/// The rule a field breaks.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, derive_more::Display)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum ProvenanceRule {
    /// The list has more entries than allowed.
    #[display("lists {count} entries, but at most {max} are allowed")]
    TooManyEntries { count: usize, max: usize },
    /// The text has more characters than allowed.
    #[display("has {length} characters, but at most {max} are allowed")]
    TooLong { length: usize, max: usize },
    /// The URI has a scheme other than `http` or `https`.
    #[display("has the scheme `{scheme}`, but only `http` and `https` are allowed")]
    UriScheme { scheme: String },
    /// The point in time falls outside the years 0 to 9999.
    #[display(
        "falls into the year {year}, but only the years {} to {} are allowed",
        YEARS.start(),
        YEARS.end()
    )]
    YearOutOfRange { year: i32 },
    /// The source names a draft entity.
    #[display("names a draft, but only live entities are allowed")]
    DraftEntity,
}

/// A rule that provenance breaks, and where.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, derive_more::Display)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase")]
#[display("`{field}` in the provenance of {owner} {rule}")]
pub struct ProvenanceViolation {
    /// Whose provenance breaks the rule.
    pub owner: ProvenanceOwner,
    /// The path of the field within that provenance, such as `sources[3].location.uri`.
    #[cfg_attr(feature = "utoipa", schema(value_type = String))]
    pub field: ProvenanceField,
    /// The rule the field breaks.
    pub rule: ProvenanceRule,
}

/// Every rule that a value's provenance breaks, at least one.
///
/// Properties are checked in no fixed order.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProvenanceViolations {
    violations: Vec<ProvenanceViolation>,
}

impl ProvenanceViolations {
    #[must_use]
    pub fn into_violations(self) -> Vec<ProvenanceViolation> {
        self.violations
    }
}

impl fmt::Display for ProvenanceViolations {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str("the provenance breaks a rule")?;
        for (position, violation) in self.violations.iter().enumerate() {
            let separator = if position == 0 { ": " } else { "; " };
            write!(fmt, "{separator}{violation}")?;
        }
        Ok(())
    }
}

impl Error for ProvenanceViolations {}

/// Checks provenance against the rules of this module before it is stored.
///
/// It keeps checking after a broken rule, so its error lists every broken rule at once.
#[derive(Debug, Default, Copy, Clone)]
pub struct ProvenanceValidator;

impl Validator<ProvidedEntityEditionProvenance> for ProvenanceValidator {
    type Error = ProvenanceViolations;

    fn validate_ref<'v>(
        &self,
        value: &'v ProvidedEntityEditionProvenance,
    ) -> Result<&'v Valid<ProvidedEntityEditionProvenance>, Self::Error> {
        let mut check = Check::default();
        check.edition(&value.sources, &value.origin);
        check.finish(value)
    }
}

impl Validator<OntologyEditionProvenance> for ProvenanceValidator {
    type Error = ProvenanceViolations;

    fn validate_ref<'v>(
        &self,
        value: &'v OntologyEditionProvenance,
    ) -> Result<&'v Valid<OntologyEditionProvenance>, Self::Error> {
        let mut check = Check::default();
        check.edition(&value.user_defined.sources, &value.user_defined.origin);
        check.finish(value)
    }
}

impl Validator<PropertyObjectMetadata> for ProvenanceValidator {
    type Error = ProvenanceViolations;

    fn validate_ref<'v>(
        &self,
        value: &'v PropertyObjectMetadata,
    ) -> Result<&'v Valid<PropertyObjectMetadata>, Self::Error> {
        let mut check = Check::default();
        check.object_metadata(&mut PropertyPath::default(), value);
        check.finish(value)
    }
}

impl Validator<PropertyObjectWithMetadata> for ProvenanceValidator {
    type Error = ProvenanceViolations;

    fn validate_ref<'v>(
        &self,
        value: &'v PropertyObjectWithMetadata,
    ) -> Result<&'v Valid<PropertyObjectWithMetadata>, Self::Error> {
        let mut check = Check::default();
        check.object(&mut PropertyPath::default(), value);
        check.finish(value)
    }
}

impl Validator<Link> for ProvenanceValidator {
    type Error = ProvenanceViolations;

    fn validate_ref<'v>(&self, value: &'v Link) -> Result<&'v Valid<Link>, Self::Error> {
        let Link::Directed { source, target } = value;
        let mut check = Check::default();
        check.sources(&ProvenanceOwner::LinkSource, &source.provenance.sources);
        check.sources(&ProvenanceOwner::LinkTarget, &target.provenance.sources);
        check.finish(value)
    }
}

impl Valid<Link> {
    /// The provenance of the link to its source and to its target.
    #[must_use]
    pub fn endpoint_provenance(&self) -> (&Valid<PropertyProvenance>, &Valid<PropertyProvenance>) {
        let Link::Directed {
            source: LinkEndpoint {
                provenance: source, ..
            },
            target: LinkEndpoint {
                provenance: target, ..
            },
        } = &**self;
        (
            Valid::new_ref_unchecked(source),
            Valid::new_ref_unchecked(target),
        )
    }
}

impl Default for Valid<PropertyProvenance> {
    fn default() -> Self {
        Self::new_unchecked(PropertyProvenance::default())
    }
}

/// Collects the rules that provenance breaks.
#[derive(Debug, Default)]
#[must_use]
struct Check {
    violations: Vec<ProvenanceViolation>,
}

impl Check {
    fn finish<V>(self, value: &V) -> Result<&Valid<V>, ProvenanceViolations> {
        if self.violations.is_empty() {
            Ok(Valid::new_ref_unchecked(value))
        } else {
            Err(ProvenanceViolations {
                violations: self.violations,
            })
        }
    }

    fn edition(&mut self, sources: &[SourceProvenance], origin: &OriginProvenance) {
        self.sources(&ProvenanceOwner::Edition, sources);
        self.origin(origin);
    }

    fn object<'p>(&mut self, path: &mut PropertyPath<'p>, object: &'p PropertyObjectWithMetadata) {
        self.sources_at(path, &object.metadata.provenance.sources);
        for (key, property) in &object.value {
            path.push(key);
            self.property(path, property);
            path.pop();
        }
    }

    fn property<'p>(&mut self, path: &mut PropertyPath<'p>, property: &'p PropertyWithMetadata) {
        match property {
            PropertyWithMetadata::Value(value) => {
                self.sources_at(path, &value.metadata.provenance.sources);
            }
            PropertyWithMetadata::Array(array) => {
                self.sources_at(path, &array.metadata.provenance.sources);
                for (index, item) in array.value.iter().enumerate() {
                    path.push(index);
                    self.property(path, item);
                    path.pop();
                }
            }
            PropertyWithMetadata::Object(object) => self.object(path, object),
        }
    }

    fn object_metadata<'p>(
        &mut self,
        path: &mut PropertyPath<'p>,
        object: &'p PropertyObjectMetadata,
    ) {
        self.sources_at(path, &object.metadata.provenance.sources);
        for (key, property) in &object.value {
            path.push(key);
            self.property_metadata(path, property);
            path.pop();
        }
    }

    fn property_metadata<'p>(
        &mut self,
        path: &mut PropertyPath<'p>,
        property: &'p PropertyMetadata,
    ) {
        match property {
            PropertyMetadata::Value(value) => {
                self.sources_at(path, &value.metadata.provenance.sources);
            }
            PropertyMetadata::Array(array) => {
                self.sources_at(path, &array.metadata.provenance.sources);
                for (index, item) in array.value.iter().enumerate() {
                    path.push(index);
                    self.property_metadata(path, item);
                    path.pop();
                }
            }
            PropertyMetadata::Object(object) => self.object_metadata(path, object),
        }
    }

    fn sources_at(&mut self, path: &PropertyPath<'_>, sources: &[SourceProvenance]) {
        if sources.is_empty() {
            return;
        }
        let owner = ProvenanceOwner::Property {
            path: path.clone().into_owned(),
        };
        self.sources(&owner, sources);
    }

    fn sources(&mut self, owner: &ProvenanceOwner, sources: &[SourceProvenance]) {
        self.count(owner, ProvenanceField::Sources, sources.len(), MAX_SOURCES);
        for (index, source) in sources.iter().enumerate() {
            self.source(owner, index, source);
        }
    }

    fn source(&mut self, owner: &ProvenanceOwner, index: usize, source: &SourceProvenance) {
        let SourceProvenance {
            ty: _,
            entity_id,
            authors,
            location,
            first_published,
            last_updated,
            loaded_at,
        } = source;
        let field = |field| ProvenanceField::Source { index, field };

        if entity_id.is_some_and(|entity_id| entity_id.draft_id.is_some()) {
            self.push(
                owner,
                field(SourceField::EntityId),
                ProvenanceRule::DraftEntity,
            );
        }
        for (author_index, author) in authors.iter().enumerate() {
            self.text(
                owner,
                field(SourceField::Author(author_index)),
                author,
                MAX_SHORT_TEXT_LENGTH,
            );
        }
        if let Some(Location {
            name,
            uri,
            description,
        }) = location
        {
            if let Some(name) = name {
                self.text(
                    owner,
                    field(SourceField::LocationName),
                    name,
                    MAX_SHORT_TEXT_LENGTH,
                );
            }
            if let Some(uri) = uri {
                if !matches!(uri.scheme(), "http" | "https") {
                    self.push(
                        owner,
                        field(SourceField::LocationUri),
                        ProvenanceRule::UriScheme {
                            scheme: uri.scheme().to_owned(),
                        },
                    );
                }
                self.text(
                    owner,
                    field(SourceField::LocationUri),
                    uri.as_str(),
                    MAX_LONG_TEXT_LENGTH,
                );
            }
            if let Some(description) = description {
                self.text(
                    owner,
                    field(SourceField::LocationDescription),
                    description,
                    MAX_LONG_TEXT_LENGTH,
                );
            }
        }
        for (source_field, time) in [
            (SourceField::FirstPublished, first_published),
            (SourceField::LastUpdated, last_updated),
            (SourceField::LoadedAt, loaded_at),
        ] {
            self.year(owner, field(source_field), *time);
        }
    }

    fn origin(&mut self, origin: &OriginProvenance) {
        let OriginProvenance {
            ty,
            id,
            version,
            semantic_version,
            environment,
            device_id,
            session_id,
            api_key_public_id,
            user_agent,
        } = origin;
        let owner = &ProvenanceOwner::Edition;

        for (field, text) in [
            (OriginField::Id, id),
            (OriginField::Version, version),
            (OriginField::Environment, environment),
            (OriginField::DeviceId, device_id),
            (OriginField::SessionId, session_id),
            (OriginField::ApiKeyPublicId, api_key_public_id),
            (OriginField::UserAgent, user_agent),
        ] {
            if let Some(text) = text {
                self.text(
                    owner,
                    ProvenanceField::Origin(field),
                    text,
                    MAX_SHORT_TEXT_LENGTH,
                );
            }
        }
        if let Some(semantic_version) = semantic_version {
            self.text(
                owner,
                ProvenanceField::Origin(OriginField::SemanticVersion),
                &semantic_version.to_string(),
                MAX_SHORT_TEXT_LENGTH,
            );
        }
        match ty {
            OriginType::Flow { step_ids } => {
                self.count(
                    owner,
                    ProvenanceField::Origin(OriginField::StepIds),
                    step_ids.len(),
                    MAX_STEP_IDS,
                );
                for (index, step_id) in step_ids.iter().enumerate() {
                    self.text(
                        owner,
                        ProvenanceField::Origin(OriginField::StepId(index)),
                        step_id,
                        MAX_SHORT_TEXT_LENGTH,
                    );
                }
            }
            OriginType::WebApp
            | OriginType::MobileApp
            | OriginType::BrowserExtension
            | OriginType::Api
            | OriginType::Migration
            | OriginType::External => {}
        }
    }

    fn count(&mut self, owner: &ProvenanceOwner, field: ProvenanceField, count: usize, max: usize) {
        if count > max {
            self.push(owner, field, ProvenanceRule::TooManyEntries { count, max });
        }
    }

    fn text(&mut self, owner: &ProvenanceOwner, field: ProvenanceField, text: &str, max: usize) {
        let length = text.chars().count();
        if length > max {
            self.push(owner, field, ProvenanceRule::TooLong { length, max });
        }
    }

    fn year(
        &mut self,
        owner: &ProvenanceOwner,
        field: ProvenanceField,
        time: Option<OffsetDateTime>,
    ) {
        if let Some(time) = time
            && !YEARS.contains(&time.year())
        {
            self.push(
                owner,
                field,
                ProvenanceRule::YearOutOfRange { year: time.year() },
            );
        }
    }

    fn push(&mut self, owner: &ProvenanceOwner, field: ProvenanceField, rule: ProvenanceRule) {
        self.violations.push(ProvenanceViolation {
            owner: owner.clone(),
            field,
            rule,
        });
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::{
        MAX_LONG_TEXT_LENGTH, MAX_SHORT_TEXT_LENGTH, MAX_SOURCES, MAX_STEP_IDS, OriginField,
        ProvenanceField, ProvenanceOwner, ProvenanceRule, ProvenanceValidator, ProvenanceViolation,
        ProvenanceViolations, SourceField,
    };
    use crate::{
        Validator,
        knowledge::{
            entity::{Link, provenance::ProvidedEntityEditionProvenance},
            property::PropertyObjectWithMetadata,
        },
        ontology::provenance::OntologyEditionProvenance,
    };

    const ENTITY_ID: &str =
        "8d86c8c3-d66d-43d1-859b-676c3bcaeadc~be2c5b2f-e3e1-4f26-a0c4-0f8b5e9c4a1d";
    const DRAFT_ID: &str = "4b2a7c1e-9f3d-4e8a-b6c5-d1e2f3a4b5c6";
    const NAMES: &str = "https://example.com/@example/types/property-type/names/";
    const ADDRESS: &str = "https://example.com/@example/types/property-type/address/";
    const CITY: &str = "https://example.com/@example/types/property-type/city/";

    /// The rules `value` breaks.
    fn violations<V>(value: &V) -> Vec<ProvenanceViolation>
    where
        ProvenanceValidator: Validator<V, Error = ProvenanceViolations>,
    {
        ProvenanceValidator
            .validate_ref(value)
            .err()
            .map_or_else(Vec::new, ProvenanceViolations::into_violations)
    }

    /// The violations of an edition with `sources` and `origin`, whose type is `api` unless
    /// `origin` names one.
    fn edition(
        sources: serde_json::Value,
        mut origin: serde_json::Value,
    ) -> Vec<ProvenanceViolation> {
        if origin.get("type").is_none() {
            origin["type"] = json!("api");
        }
        violations(
            &serde_json::from_value::<ProvidedEntityEditionProvenance>(serde_json::Value::Object(
                [
                    ("actorType".to_owned(), json!("machine")),
                    ("origin".to_owned(), origin),
                    ("sources".to_owned(), sources),
                ]
                .into_iter()
                .collect(),
            ))
            .expect("should be edition provenance"),
        )
    }

    fn source_rule(field: SourceField, rule: ProvenanceRule) -> Vec<ProvenanceViolation> {
        vec![ProvenanceViolation {
            owner: ProvenanceOwner::Edition,
            field: ProvenanceField::Source { index: 0, field },
            rule,
        }]
    }

    fn origin_rule(field: OriginField, rule: ProvenanceRule) -> ProvenanceViolation {
        ProvenanceViolation {
            owner: ProvenanceOwner::Edition,
            field: ProvenanceField::Origin(field),
            rule,
        }
    }

    #[test]
    fn sources_count() {
        let source = json!({ "type": "webpage" });
        assert_eq!(
            edition(json!(vec![source.clone(); MAX_SOURCES]), json!({})),
            [],
            "the most sources allowed should pass"
        );
        assert_eq!(
            edition(json!(vec![source; MAX_SOURCES + 1]), json!({})),
            [ProvenanceViolation {
                owner: ProvenanceOwner::Edition,
                field: ProvenanceField::Sources,
                rule: ProvenanceRule::TooManyEntries {
                    count: MAX_SOURCES + 1,
                    max: MAX_SOURCES,
                },
            }],
            "one source more than allowed should break the rule"
        );
    }

    #[test]
    fn author_length() {
        // Characters are counted, not bytes: each `ä` takes two bytes.
        let source = |length| json!([{ "type": "document", "authors": ["\u{e4}".repeat(length)] }]);
        assert_eq!(
            edition(source(MAX_SHORT_TEXT_LENGTH), json!({})),
            [],
            "the longest author allowed should pass"
        );
        assert_eq!(
            edition(source(MAX_SHORT_TEXT_LENGTH + 1), json!({})),
            source_rule(
                SourceField::Author(0),
                ProvenanceRule::TooLong {
                    length: MAX_SHORT_TEXT_LENGTH + 1,
                    max: MAX_SHORT_TEXT_LENGTH,
                },
            ),
            "the length should be counted in characters"
        );
    }

    #[test]
    fn uri_scheme() {
        assert_eq!(
            edition(
                json!([
                    { "type": "webpage", "location": { "uri": "http://example.com/" } },
                    { "type": "webpage", "location": { "uri": "https://example.com/" } },
                ]),
                json!({}),
            ),
            [],
            "`http` and `https` should pass"
        );
        assert_eq!(
            edition(
                json!([{ "type": "webpage", "location": { "uri": "javascript:alert(1)" } }]),
                json!({}),
            ),
            source_rule(
                SourceField::LocationUri,
                ProvenanceRule::UriScheme {
                    scheme: "javascript".to_owned(),
                },
            ),
            "any other scheme should break the rule"
        );
    }

    #[test]
    fn uri_length_encoded() {
        // 520 characters as sent, 4520 once each euro sign is percent-encoded.
        let uri = format!("https://example.com/{}", "\u{20ac}".repeat(500));
        assert_eq!(
            edition(
                json!([{ "type": "webpage", "location": { "uri": uri } }]),
                json!({}),
            ),
            source_rule(
                SourceField::LocationUri,
                ProvenanceRule::TooLong {
                    length: 4520,
                    max: MAX_LONG_TEXT_LENGTH,
                },
            ),
            "the URI should be measured percent-encoded"
        );
    }

    #[test]
    fn location_length() {
        let name = "a".repeat(MAX_SHORT_TEXT_LENGTH);
        let description = "a".repeat(MAX_LONG_TEXT_LENGTH);
        assert_eq!(
            edition(
                json!([{ "type": "webpage", "location": { "name": name, "description": description } }]),
                json!({}),
            ),
            [],
            "the longest name and description allowed should pass"
        );
        assert_eq!(
            edition(
                json!([{ "type": "webpage", "location": {
                    "name": format!("{name}a"),
                    "description": format!("{description}a"),
                } }]),
                json!({}),
            ),
            [
                (SourceField::LocationName, MAX_SHORT_TEXT_LENGTH),
                (SourceField::LocationDescription, MAX_LONG_TEXT_LENGTH),
            ]
            .map(|(field, max)| ProvenanceViolation {
                owner: ProvenanceOwner::Edition,
                field: ProvenanceField::Source { index: 0, field },
                rule: ProvenanceRule::TooLong {
                    length: max + 1,
                    max,
                },
            }),
            "the name and the description should have their own limits"
        );
    }

    #[test]
    fn year_range() {
        assert_eq!(
            edition(
                json!([{
                    "type": "webpage",
                    "firstPublished": "0000-01-01T00:00:00Z",
                    "loadedAt": "9999-12-31T23:59:59Z",
                }]),
                json!({}),
            ),
            [],
            "the years 0 and 9999 should pass"
        );
        let before = "-000001-12-31T00:00:00Z";
        assert_eq!(
            edition(
                json!([{
                    "type": "webpage",
                    "firstPublished": before,
                    "lastUpdated": before,
                    "loadedAt": before,
                }]),
                json!({}),
            ),
            [
                SourceField::FirstPublished,
                SourceField::LastUpdated,
                SourceField::LoadedAt,
            ]
            .map(|field| ProvenanceViolation {
                owner: ProvenanceOwner::Edition,
                field: ProvenanceField::Source { index: 0, field },
                rule: ProvenanceRule::YearOutOfRange { year: -1 },
            }),
            "each point in time should be checked under its own field"
        );
    }

    #[test]
    fn draft_entity() {
        assert_eq!(
            edition(
                json!([{ "type": "webpage", "entityId": ENTITY_ID }]),
                json!({})
            ),
            [],
            "a live entity should pass"
        );
        assert_eq!(
            edition(
                json!([{ "type": "webpage", "entityId": format!("{ENTITY_ID}~{DRAFT_ID}") }]),
                json!({}),
            ),
            source_rule(SourceField::EntityId, ProvenanceRule::DraftEntity),
            "a draft should break the rule"
        );
    }

    #[test]
    fn origin_fields_length() {
        let long = "a".repeat(MAX_SHORT_TEXT_LENGTH + 1);
        let rule = ProvenanceRule::TooLong {
            length: MAX_SHORT_TEXT_LENGTH + 1,
            max: MAX_SHORT_TEXT_LENGTH,
        };
        assert_eq!(
            edition(
                json!([]),
                json!({
                    "id": long,
                    "version": long,
                    "semanticVersion": format!("1.2.3-{long}"),
                    "environment": long,
                    "deviceId": long,
                    "sessionId": long,
                    "apiKeyPublicId": long,
                    "userAgent": long,
                }),
            ),
            [
                origin_rule(OriginField::Id, rule.clone()),
                origin_rule(OriginField::Version, rule.clone()),
                origin_rule(OriginField::Environment, rule.clone()),
                origin_rule(OriginField::DeviceId, rule.clone()),
                origin_rule(OriginField::SessionId, rule.clone()),
                origin_rule(OriginField::ApiKeyPublicId, rule.clone()),
                origin_rule(OriginField::UserAgent, rule),
                origin_rule(
                    OriginField::SemanticVersion,
                    ProvenanceRule::TooLong {
                        length: MAX_SHORT_TEXT_LENGTH + 7,
                        max: MAX_SHORT_TEXT_LENGTH,
                    },
                ),
            ],
            "each text field of the origin should be checked"
        );
    }

    #[test]
    fn origin_step_ids() {
        let mut step_ids = (0..MAX_STEP_IDS)
            .map(|step| step.to_string())
            .collect::<Vec<_>>();
        assert_eq!(
            edition(json!([]), json!({ "type": "flow", "stepIds": step_ids })),
            [],
            "the most step IDs allowed should pass"
        );
        step_ids.push(MAX_STEP_IDS.to_string());
        step_ids.push("a".repeat(MAX_SHORT_TEXT_LENGTH + 1));
        assert_eq!(
            edition(json!([]), json!({ "type": "flow", "stepIds": step_ids })),
            [
                origin_rule(
                    OriginField::StepIds,
                    ProvenanceRule::TooManyEntries {
                        count: MAX_STEP_IDS + 2,
                        max: MAX_STEP_IDS,
                    },
                ),
                // The long step ID sorts last.
                origin_rule(
                    OriginField::StepId(MAX_STEP_IDS + 1),
                    ProvenanceRule::TooLong {
                        length: MAX_SHORT_TEXT_LENGTH + 1,
                        max: MAX_SHORT_TEXT_LENGTH,
                    },
                ),
            ],
            "the number of step IDs and each step ID should be checked"
        );
    }

    #[test]
    fn ontology_edition() {
        let provenance = serde_json::from_value::<OntologyEditionProvenance>(json!({
            "createdById": "8d86c8c3-d66d-43d1-859b-676c3bcaeadc",
            "actorType": "user",
            "origin": { "type": "api", "id": "a".repeat(MAX_SHORT_TEXT_LENGTH + 1) },
            "sources": [{ "type": "webpage", "entityId": format!("{ENTITY_ID}~{DRAFT_ID}") }],
        }))
        .expect("should be ontology provenance");

        assert_eq!(
            violations(&provenance)
                .into_iter()
                .map(|violation| violation.field)
                .collect::<Vec<_>>(),
            [
                ProvenanceField::Source {
                    index: 0,
                    field: SourceField::EntityId,
                },
                ProvenanceField::Origin(OriginField::Id),
            ],
            "the sources and the origin of an ontology type should be checked"
        );
    }

    /// Properties whose five places with provenance each list too many sources.
    fn properties() -> PropertyObjectWithMetadata {
        let too_many = vec![json!({ "type": "webpage" }); MAX_SOURCES + 1];
        serde_json::from_value(json!({
            "value": {
                NAMES: {
                    "value": [{
                        "value": "Alice",
                        "metadata": { "dataTypeId": null, "provenance": { "sources": too_many } },
                    }],
                    "metadata": { "provenance": { "sources": too_many } },
                },
                ADDRESS: {
                    "value": {
                        CITY: {
                            "value": "Berlin",
                            "metadata": { "dataTypeId": null, "provenance": { "sources": too_many } },
                        },
                    },
                    "metadata": { "provenance": { "sources": too_many } },
                },
            },
            "metadata": { "provenance": { "sources": too_many } },
        }))
        .expect("should be properties with metadata")
    }

    fn owners(violations: Vec<ProvenanceViolation>) -> Vec<String> {
        let mut owners = violations
            .into_iter()
            .map(|violation| violation.owner.to_string())
            .collect::<Vec<_>>();
        owners.sort();
        owners
    }

    #[test]
    fn properties_path() {
        assert_eq!(
            owners(violations(&properties())),
            [
                "the properties".to_owned(),
                format!("the property at [\"{ADDRESS}\"]"),
                format!("the property at [\"{ADDRESS}\"][\"{CITY}\"]"),
                format!("the property at [\"{NAMES}\"]"),
                format!("the property at [\"{NAMES}\"][0]"),
            ],
            "each property should be named by its path, and the properties as a whole by none"
        );
    }

    #[test]
    fn metadata_path() {
        let properties = properties();
        let expected = owners(violations(&properties));
        let (_, metadata) = properties.into_parts();

        assert_eq!(
            owners(violations(&metadata)),
            expected,
            "the metadata alone should name the same properties as the metadata with the values"
        );
    }

    #[test]
    fn link_endpoints() {
        let link = serde_json::from_value::<Link>(json!({
            "leftEntityId": ENTITY_ID,
            "rightEntityId": ENTITY_ID,
            "leftEntityProvenance": {
                "sources": [{ "type": "webpage", "entityId": format!("{ENTITY_ID}~{DRAFT_ID}") }],
            },
            "rightEntityProvenance": {
                "sources": vec![json!({ "type": "webpage" }); MAX_SOURCES + 1],
            },
        }))
        .expect("should be a link");

        assert_eq!(
            violations(&link),
            [
                ProvenanceViolation {
                    owner: ProvenanceOwner::LinkSource,
                    field: ProvenanceField::Source {
                        index: 0,
                        field: SourceField::EntityId,
                    },
                    rule: ProvenanceRule::DraftEntity,
                },
                ProvenanceViolation {
                    owner: ProvenanceOwner::LinkTarget,
                    field: ProvenanceField::Sources,
                    rule: ProvenanceRule::TooManyEntries {
                        count: MAX_SOURCES + 1,
                        max: MAX_SOURCES,
                    },
                },
            ],
            "the left entity should be the link's source and the right entity its target"
        );
    }

    #[test]
    fn violation_display() {
        let [violation] = <[ProvenanceViolation; 1]>::try_from(edition(
            json!([{ "type": "webpage", "location": { "uri": "ftp://example.com/" } }]),
            json!({}),
        ))
        .expect("should break one rule");

        assert_eq!(
            violation.to_string(),
            "`sources[0].location.uri` in the provenance of the edition has the scheme `ftp`, but \
             only `http` and `https` are allowed",
            "the violation should name the field, the owner and the rule"
        );
    }
}
