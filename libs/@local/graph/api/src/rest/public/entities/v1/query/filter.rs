//! The conditions the entities of a query meet.

use core::{error::Error, fmt, marker::PhantomData};

use hash_graph_store::{
    entity::EntityQueryPath,
    filter::{Filter, FilterExpression, FilterExpressionList, Parameter, ParameterList},
};
use schemars::JsonSchema;
use serde::{
    Deserialize, Deserializer,
    de::{self, IgnoredAny},
};
use type_system::{
    knowledge::Entity,
    ontology::{BaseUrl, VersionedUrl},
    principal::actor_group::WebId,
};

/// The most `eq`, `in` and `has` a filter may name in all. Each one becomes a parameter of the
/// store's query, and the store can bind at most 65,535 to one query.
pub(super) const MAX_CONDITIONS: usize = 100;

/// The most values an `in` may name.
const MAX_VALUES: usize = 100;

/// An object with exactly one key, which names the variant and decides how its value is read.
pub(super) trait SingleKey<'de>: Sized {
    /// The keys, as serde lists them when it rejects an unknown one.
    const EXPECTING: &'static str;

    type Token: Deserialize<'de>;

    /// Reads the value of the key `token` from `map`.
    fn read_value<A: de::MapAccess<'de>>(token: Self::Token, map: &mut A)
    -> Result<Self, A::Error>;
}

/// Reads a [`SingleKey`] object.
pub(super) struct SingleKeyVisitor<T>(PhantomData<T>);

impl<T> SingleKeyVisitor<T> {
    pub(super) const fn new() -> Self {
        Self(PhantomData)
    }
}

impl<'de, T: SingleKey<'de>> de::Visitor<'de> for SingleKeyVisitor<T> {
    type Value = T;

    fn expecting(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            formatter,
            "an object with exactly one key, {}",
            T::EXPECTING
        )
    }

    fn visit_map<A: de::MapAccess<'de>>(self, mut map: A) -> Result<Self::Value, A::Error> {
        let Some(token) = map.next_key()? else {
            return Err(de::Error::invalid_length(0, &self));
        };
        let value = T::read_value(token, &mut map)?;
        let mut entries = 1;
        while map.next_entry::<IgnoredAny, IgnoredAny>()?.is_some() {
            entries += 1;
        }
        if entries > 1 {
            return Err(de::Error::invalid_length(entries, &self));
        }
        Ok(value)
    }
}

/// A condition an entity has to meet, named by its only key.
#[derive(Debug, PartialEq, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub(super) enum EntityFilter {
    /// Entities in the web, or in one of the webs.
    #[schemars(title = "Web ID")]
    WebId(Match<WebId>),
    /// Entities of the versioned entity type, or of a type that inherits from it.
    #[schemars(title = "Entity type IDs")]
    EntityTypeIds(SetMatch<VersionedUrl>),
    /// Entities of any version of the entity type, or of a type that inherits from one.
    #[schemars(title = "Entity type base IDs")]
    EntityTypeBaseIds(SetMatch<BaseUrl>),
    /// Entities that meet every condition.
    #[schemars(title = "And")]
    And(
        /// The conditions, at least one.
        #[schemars(length(min = 1, max = MAX_CONDITIONS))]
        Vec<Self>,
    ),
    /// Entities that meet at least one condition.
    #[schemars(title = "Or")]
    Or(
        /// The conditions, at least one.
        #[schemars(length(min = 1, max = MAX_CONDITIONS))]
        Vec<Self>,
    ),
}

/// A key of a filter.
#[derive(Deserialize)]
#[serde(field_identifier, rename_all = "camelCase")]
pub(super) enum EntityFilterToken {
    WebId,
    EntityTypeIds,
    EntityTypeBaseIds,
    And,
    Or,
}

impl<'de> SingleKey<'de> for EntityFilter {
    type Token = EntityFilterToken;

    const EXPECTING: &'static str =
        "one of `webId`, `entityTypeIds`, `entityTypeBaseIds`, `and`, `or`";

    fn read_value<A: de::MapAccess<'de>>(
        token: Self::Token,
        map: &mut A,
    ) -> Result<Self, A::Error> {
        Ok(match token {
            EntityFilterToken::WebId => Self::WebId(map.next_value()?),
            EntityFilterToken::EntityTypeIds => Self::EntityTypeIds(map.next_value()?),
            EntityFilterToken::EntityTypeBaseIds => Self::EntityTypeBaseIds(map.next_value()?),
            EntityFilterToken::And => Self::And(map.next_value()?),
            EntityFilterToken::Or => Self::Or(map.next_value()?),
        })
    }
}

impl<'de> Deserialize<'de> for EntityFilter {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        deserializer.deserialize_map(SingleKeyVisitor::new())
    }
}

/// The filter has an empty list, or names more values or conditions than allowed.
#[derive(Debug, Clone, Copy, PartialEq, Eq, derive_more::Display)]
pub(super) enum FilterError {
    #[display("`{_0}` has to name at least one entry")]
    Empty(&'static str),
    #[display("an `in` names {_0} values, but at most {MAX_VALUES} are allowed")]
    TooManyValues(usize),
    #[display(
        "the filter names {_0} conditions in `eq`, `in` and `has`, but at most {MAX_CONDITIONS} \
         are allowed"
    )]
    TooManyConditions(usize),
}

impl Error for FilterError {}

impl EntityFilter {
    /// Checks that no `in`, `and` or `or` is empty, that no `in` names more than 100 values, and
    /// that the filter names at most [`MAX_CONDITIONS`] `eq`, `in` and `has`.
    ///
    /// # Errors
    ///
    /// - [`Empty`] if an `in`, `and` or `or` names nothing
    /// - [`TooManyValues`] if an `in` names more than 100 values
    /// - [`TooManyConditions`] if the filter names more than [`MAX_CONDITIONS`] conditions
    ///
    /// [`Empty`]: FilterError::Empty
    /// [`TooManyValues`]: FilterError::TooManyValues
    /// [`TooManyConditions`]: FilterError::TooManyConditions
    pub(super) fn validate(&self) -> Result<(), FilterError> {
        let conditions = self.conditions()?;
        if conditions > MAX_CONDITIONS {
            return Err(FilterError::TooManyConditions(conditions));
        }
        Ok(())
    }

    /// The number of `eq`, `in` and `has` in the condition, each of which has to be valid.
    fn conditions(&self) -> Result<usize, FilterError> {
        match self {
            Self::WebId(web_ids) => web_ids.validate().map(|()| 1),
            Self::EntityTypeIds(_) | Self::EntityTypeBaseIds(_) => Ok(1),
            Self::And(filters) if filters.is_empty() => Err(FilterError::Empty("and")),
            Self::Or(filters) if filters.is_empty() => Err(FilterError::Empty("or")),
            Self::And(filters) | Self::Or(filters) => filters.iter().map(Self::conditions).sum(),
        }
    }

    /// The filter the store applies for this condition.
    pub(super) fn to_store_filter(&self) -> Filter<'_, Entity> {
        match self {
            Self::WebId(Match::Eq(web_id)) => Filter::Equal(
                FilterExpression::Path {
                    path: EntityQueryPath::WebId,
                },
                FilterExpression::Parameter {
                    parameter: Parameter::Uuid((*web_id).into()),
                    convert: None,
                },
            ),
            Self::WebId(Match::In(web_ids)) => Filter::In(
                FilterExpression::Path {
                    path: EntityQueryPath::WebId,
                },
                FilterExpressionList::ParameterList {
                    parameters: ParameterList::WebIds(web_ids),
                },
            ),
            Self::EntityTypeIds(SetMatch::Has(entity_type_id)) => {
                Filter::for_entity_by_type_id(entity_type_id)
            }
            Self::EntityTypeBaseIds(SetMatch::Has(base_url)) => {
                Filter::for_entity_by_base_type_id(base_url)
            }
            Self::And(filters) => Filter::All(filters.iter().map(Self::to_store_filter).collect()),
            Self::Or(filters) => Filter::Any(filters.iter().map(Self::to_store_filter).collect()),
        }
    }
}

/// The value to equal with `eq`, or the values to equal one of with `in`.
#[derive(Debug, PartialEq, JsonSchema)]
#[serde(rename_all = "camelCase")]
#[schemars(rename = "{T}Match")]
pub(super) enum Match<T> {
    /// The field equals the value.
    #[schemars(title = "Equal")]
    Eq(T),
    /// The field equals one of the values.
    #[schemars(title = "In")]
    In(
        /// The values, at least one.
        #[schemars(length(min = 1, max = MAX_VALUES))]
        Vec<T>,
    ),
}

impl<T> Match<T> {
    const fn validate(&self) -> Result<(), FilterError> {
        match self {
            Self::In(values) if values.is_empty() => Err(FilterError::Empty("in")),
            Self::In(values) if values.len() > MAX_VALUES => {
                Err(FilterError::TooManyValues(values.len()))
            }
            Self::Eq(_) | Self::In(_) => Ok(()),
        }
    }
}

/// A key of a match.
#[derive(Deserialize)]
#[serde(field_identifier, rename_all = "camelCase")]
pub(super) enum MatchToken {
    Eq,
    In,
}

impl<'de, T: Deserialize<'de>> SingleKey<'de> for Match<T> {
    type Token = MatchToken;

    const EXPECTING: &'static str = "`eq` or `in`";

    fn read_value<A: de::MapAccess<'de>>(
        token: Self::Token,
        map: &mut A,
    ) -> Result<Self, A::Error> {
        Ok(match token {
            MatchToken::Eq => Self::Eq(map.next_value()?),
            MatchToken::In => Self::In(map.next_value()?),
        })
    }
}

impl<'de, T: Deserialize<'de>> Deserialize<'de> for Match<T> {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        deserializer.deserialize_map(SingleKeyVisitor::new())
    }
}

/// The value a set has to contain, with `has`.
#[derive(Debug, PartialEq, JsonSchema)]
#[serde(rename_all = "camelCase")]
#[schemars(rename = "{T}SetMatch")]
pub(super) enum SetMatch<T> {
    /// The set contains the value.
    #[schemars(title = "Has")]
    Has(T),
}

/// A key of a set match.
#[derive(Deserialize)]
#[serde(field_identifier, rename_all = "camelCase")]
pub(super) enum SetMatchToken {
    Has,
}

impl<'de, T: Deserialize<'de>> SingleKey<'de> for SetMatch<T> {
    type Token = SetMatchToken;

    const EXPECTING: &'static str = "`has`";

    fn read_value<A: de::MapAccess<'de>>(
        token: Self::Token,
        map: &mut A,
    ) -> Result<Self, A::Error> {
        Ok(match token {
            SetMatchToken::Has => Self::Has(map.next_value()?),
        })
    }
}

impl<'de, T: Deserialize<'de>> Deserialize<'de> for SetMatch<T> {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        deserializer.deserialize_map(SingleKeyVisitor::new())
    }
}

#[cfg(test)]
mod tests {
    use core::str::FromStr as _;

    use hash_graph_store::{
        entity::EntityQueryPath,
        filter::{Filter, FilterExpression, FilterExpressionList, Parameter, ParameterList},
    };
    use serde::de::Error as _;
    use serde_json::json;
    use type_system::{
        knowledge::Entity,
        ontology::{BaseUrl, VersionedUrl},
        principal::actor_group::WebId,
    };
    use uuid::Uuid;

    use super::{
        EntityFilter, FilterError, MAX_CONDITIONS, MAX_VALUES, Match, SetMatch, SingleKey as _,
        SingleKeyVisitor,
    };

    const WEB: &str = "8d86c8c3-d66d-43d1-859b-676c3bcaeadc";
    const OTHER_WEB: &str = "1b2c3d4e-5f60-4a71-8b92-a3b4c5d6e7f8";
    const PERSON: &str = "https://hash.ai/@h/types/entity-type/person/v/1";
    const PERSON_BASE: &str = "https://hash.ai/@h/types/entity-type/person/";

    /// Reads `value` the way a request body is read: from bytes, which reports errors differently
    /// from a `Value`.
    fn parse(value: &serde_json::Value) -> Result<EntityFilter, serde_json::Error> {
        serde_json::from_slice(&serde_json::to_vec(value).expect("should serialize the filter"))
    }

    fn filter(value: &serde_json::Value) -> EntityFilter {
        parse(value).expect("should be a filter")
    }

    /// The message of the error reading `value`, without the position `serde_json` appends.
    fn error(value: &serde_json::Value) -> String {
        let error = parse(value)
            .expect_err("the filter should be rejected")
            .to_string();
        error
            .rsplit_once(" at line ")
            .map_or_else(|| error.clone(), |(message, _)| message.to_owned())
    }

    fn web_id(web_id: &str) -> WebId {
        WebId::new(Uuid::parse_str(web_id).expect("should be a UUID"))
    }

    fn versioned_url(url: &str) -> VersionedUrl {
        VersionedUrl::from_str(url).expect("should be a versioned URL")
    }

    fn base_url(url: &str) -> BaseUrl {
        BaseUrl::new(url.to_owned()).expect("should be a base URL")
    }

    fn web_filter<'p>(web_id: &str) -> Filter<'p, Entity> {
        Filter::Equal(
            FilterExpression::Path {
                path: EntityQueryPath::WebId,
            },
            FilterExpression::Parameter {
                parameter: Parameter::Uuid(Uuid::parse_str(web_id).expect("should be a UUID")),
                convert: None,
            },
        )
    }

    /// A valid filter for each key the schema of a filter documents.
    fn example(key: &str) -> serde_json::Value {
        match key {
            "webId" => json!({ "webId": { "eq": WEB } }),
            "entityTypeIds" => json!({ "entityTypeIds": { "has": PERSON } }),
            "entityTypeBaseIds" => json!({ "entityTypeBaseIds": { "has": PERSON_BASE } }),
            "and" | "or" => json!({ key: [{ "webId": { "eq": WEB } }] }),
            _ => panic!("the test should have an example for `{key}`"),
        }
    }

    #[test]
    fn schema_keys_accepted() {
        let schema = schemars::schema_for!(EntityFilter);
        let variants = schema
            .get("oneOf")
            .and_then(serde_json::Value::as_array)
            .expect("the schema should list the variants of a filter");
        assert!(!variants.is_empty(), "the schema should document the keys");
        for variant in variants {
            let key = variant["required"][0]
                .as_str()
                .expect("each variant should require its key");
            parse(&example(key)).unwrap_or_else(|error| {
                panic!("the documented key `{key}` should be accepted: {error}")
            });
        }
    }

    #[test]
    fn deserialization() {
        assert_eq!(
            filter(&json!({ "and": [
                { "webId": { "eq": WEB } },
                { "or": [
                    { "webId": { "in": [WEB, OTHER_WEB] } },
                    { "entityTypeIds": { "has": PERSON } },
                    { "entityTypeBaseIds": { "has": PERSON_BASE } },
                ] },
            ] })),
            EntityFilter::And(vec![
                EntityFilter::WebId(Match::Eq(web_id(WEB))),
                EntityFilter::Or(vec![
                    EntityFilter::WebId(Match::In(vec![web_id(WEB), web_id(OTHER_WEB)])),
                    EntityFilter::EntityTypeIds(SetMatch::Has(versioned_url(PERSON))),
                    EntityFilter::EntityTypeBaseIds(SetMatch::Has(base_url(PERSON_BASE))),
                ]),
            ])
        );
    }

    #[test]
    fn deserialization_keys() {
        assert_eq!(
            error(&json!({ "archived": true })),
            format!(
                "unknown field `archived`, expected {}",
                EntityFilter::EXPECTING
            )
        );
        assert_eq!(
            error(&json!({ "webId": { "ne": WEB } })),
            format!("unknown field `ne`, expected {}", Match::<WebId>::EXPECTING)
        );
        assert_eq!(
            error(&json!({ "entityTypeIds": { "eq": PERSON } })),
            format!(
                "unknown field `eq`, expected {}",
                SetMatch::<VersionedUrl>::EXPECTING
            )
        );

        let visitor = SingleKeyVisitor::<EntityFilter>::new();
        assert_eq!(
            error(&json!({})),
            serde_json::Error::invalid_length(0, &visitor).to_string()
        );
        assert_eq!(
            error(&json!({
                "webId": { "eq": WEB },
                "entityTypeIds": { "has": PERSON },
                "or": [],
            })),
            serde_json::Error::invalid_length(3, &visitor).to_string()
        );
    }

    #[test]
    fn validate_empty() {
        for (key, value) in [
            ("and", json!({ "and": [] })),
            ("or", json!({ "or": [] })),
            ("in", json!({ "webId": { "in": [] } })),
        ] {
            assert_eq!(
                filter(&value).validate(),
                Err(FilterError::Empty(key)),
                "an empty `{key}` should be rejected"
            );
        }
    }

    #[test]
    fn validate_values() {
        assert_eq!(
            filter(&json!({ "webId": { "in": vec![WEB; MAX_VALUES] } })).validate(),
            Ok(()),
            "an `in` should name as many values as allowed"
        );
        assert_eq!(
            filter(&json!({ "webId": { "in": vec![WEB; MAX_VALUES + 1] } })).validate(),
            Err(FilterError::TooManyValues(MAX_VALUES + 1))
        );
    }

    #[test]
    fn validate_conditions() {
        // An `in` counts once, however many values it names.
        let conditions = |count: usize| {
            json!({ "and": [
                { "webId": { "in": vec![WEB; MAX_VALUES] } },
                { "or": vec![json!({ "entityTypeBaseIds": { "has": PERSON_BASE } }); count - 1] },
            ] })
        };
        assert_eq!(
            filter(&conditions(MAX_CONDITIONS)).validate(),
            Ok(()),
            "a filter should name as many conditions as allowed"
        );
        assert_eq!(
            filter(&conditions(MAX_CONDITIONS + 1)).validate(),
            Err(FilterError::TooManyConditions(MAX_CONDITIONS + 1))
        );
    }

    #[test]
    fn store_filter_web_list() {
        let web_ids = [web_id(WEB), web_id(OTHER_WEB)];
        assert_eq!(
            filter(&json!({ "webId": { "in": [WEB, OTHER_WEB] } })).to_store_filter(),
            Filter::In(
                FilterExpression::Path {
                    path: EntityQueryPath::WebId,
                },
                FilterExpressionList::ParameterList {
                    parameters: ParameterList::WebIds(&web_ids),
                },
            ),
            "`in` should match any of the webs as one list"
        );
    }

    #[test]
    fn store_filter_entity_type() {
        let person = versioned_url(PERSON);
        let person_base = base_url(PERSON_BASE);
        assert_eq!(
            filter(&json!({ "entityTypeIds": { "has": PERSON } })).to_store_filter(),
            Filter::for_entity_by_type_id(&person),
            "a versioned URL should match its version"
        );
        assert_eq!(
            filter(&json!({ "entityTypeBaseIds": { "has": PERSON_BASE } })).to_store_filter(),
            Filter::for_entity_by_base_type_id(&person_base),
            "a base URL should match every version"
        );
    }

    #[test]
    fn store_filter_nested() {
        assert_eq!(
            filter(&json!({ "and": [
                { "webId": { "eq": WEB } },
                { "or": [{ "webId": { "eq": WEB } }] },
            ] }))
            .to_store_filter(),
            Filter::All(vec![web_filter(WEB), Filter::Any(vec![web_filter(WEB)])]),
            "`and` and `or` should keep their conditions and their nesting"
        );
    }
}
