use std::{collections::HashMap, fmt};

use serde::{
    de::IntoDeserializer, ser::SerializeStruct, Deserialize, Deserializer, Serialize, Serializer,
};

use crate::zanzibar::{self, Resource, Tuple};

/// Error response returned from the API
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RpcError {
    pub(crate) code: i32,
    message: String,
    #[serde(default)]
    #[expect(
        dead_code,
        reason = "Currently not used but captured from gRPC connections"
    )]
    details: Vec<serde_json::Value>,
}

impl fmt::Display for RpcError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(fmt, "Error {}: {}", self.code, self.message)
    }
}

pub(crate) struct ObjectReference<T>(pub(crate) T);

impl<T: Tuple> Serialize for ObjectReference<T> {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        let mut serialize = serializer.serialize_struct("ObjectReference", 2)?;
        serialize.serialize_field("objectType", self.0.object_namespace())?;
        serialize.serialize_field("objectId", &self.0.object_id())?;
        serialize.end()
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", bound = "O::Id: Deserialize<'de>")]
struct SerializedObjectReference<O: Resource> {
    object_type: String,
    object_id: O::Id,
}

impl<'de, O> Deserialize<'de> for ObjectReference<O>
where
    O: Resource + From<O::Id>,
    O::Id: Deserialize<'de>,
{
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        let model = SerializedObjectReference::<O>::deserialize(deserializer)?;
        if model.object_type != O::namespace() {
            return Err(serde::de::Error::custom(format!(
                "expected object type `{}`, got `{}`",
                O::namespace(),
                model.object_type,
            )));
        }
        Ok(Self(O::from(model.object_id)))
    }
}

pub(crate) struct RelationReference<T>(pub(crate) T);

impl<T: Tuple> Serialize for RelationReference<T> {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        self.0.affiliation().serialize(serializer)
    }
}

#[derive(Debug)]
pub(crate) struct SubjectReference<T>(pub(crate) T);

impl<T: Tuple> Serialize for SubjectReference<T> {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        #[derive(Debug)]
        struct ObjectReference<T>(T);

        impl<T: Tuple> Serialize for ObjectReference<T> {
            fn serialize<Ser>(&self, serializer: Ser) -> Result<Ser::Ok, Ser::Error>
            where
                Ser: Serializer,
            {
                let mut serialize = serializer.serialize_struct("ObjectReference", 2)?;
                serialize.serialize_field("objectType", self.0.user_namespace())?;
                serialize.serialize_field("objectId", &self.0.user_id())?;
                serialize.end()
            }
        }

        let mut serialize = serializer.serialize_struct("SubjectReference", 2)?;
        serialize.serialize_field("object", &ObjectReference(&self.0))?;
        if let Some(relation) = self.0.user_set() {
            serialize.serialize_field("optionalRelation", relation)?;
        }
        serialize.end()
    }
}

fn empty_string_as_none<'de, D, T>(de: D) -> Result<Option<T>, D::Error>
where
    D: Deserializer<'de>,
    T: Deserialize<'de>,
{
    let opt = Option::<String>::deserialize(de)?;
    match opt.as_deref() {
        None | Some("") => Ok(None),
        Some(s) => T::deserialize(s.into_deserializer()).map(Some),
    }
}

#[derive(Deserialize)]
#[serde(bound = "U::Id: Deserialize<'de>, S: Deserialize<'de>")]
struct SerializedSubjectReference<U: Resource, S> {
    object: SerializedObjectReference<U>,
    #[serde(rename = "optionalRelation", deserialize_with = "empty_string_as_none")]
    relation: Option<S>,
}

impl<'de, U, S> Deserialize<'de> for SubjectReference<(U, Option<S>)>
where
    U: Resource + From<U::Id>,
    U::Id: Deserialize<'de>,
    S: Deserialize<'de>,
{
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        let model = SerializedSubjectReference::<U, S>::deserialize(deserializer)?;
        if model.object.object_type != U::namespace() {
            return Err(serde::de::Error::custom(format!(
                "expected user type `{}`, got `{}`",
                U::namespace(),
                model.object.object_type,
            )));
        }
        Ok(Self((U::from(model.object.object_id), model.relation)))
    }
}

/// Specifies how a resource relates to a subject.
///
/// Relationships form the data for the graph over which all permissions questions are answered.
pub(crate) struct Relationship<T>(pub(crate) T);

impl<T: Tuple> Serialize for Relationship<T> {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        let mut serialize = serializer.serialize_struct("Relationship", 3)?;
        serialize.serialize_field("resource", &ObjectReference(&self.0))?;
        serialize.serialize_field("relation", self.0.affiliation())?;
        serialize.serialize_field("subject", &SubjectReference(&self.0))?;
        serialize.end()
    }
}

pub(crate) struct Consistency<'z>(zanzibar::Consistency<'z>);

impl<'z> From<zanzibar::Consistency<'z>> for Consistency<'z> {
    fn from(consistency: zanzibar::Consistency<'z>) -> Self {
        Self(consistency)
    }
}

impl Serialize for Consistency<'_> {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        #[derive(Serialize)]
        struct ZedToken<'z> {
            token: &'z zanzibar::Zookie<'z>,
        }

        let mut serialize = serializer.serialize_struct("Consistency", 1)?;
        match &self.0 {
            zanzibar::Consistency::MinimalLatency => {
                serialize.serialize_field("minimalLatency", &true)?;
            }
            zanzibar::Consistency::AtLeastAsFresh(token) => {
                serialize.serialize_field("atLeastAsFresh", &ZedToken { token })?;
            }
            zanzibar::Consistency::AtExactSnapshot(token) => {
                serialize.serialize_field("atExactSnapshot", &ZedToken { token })?;
            }
            zanzibar::Consistency::FullyConsistent => {
                serialize.serialize_field("fullyConsistent", &true)?;
            }
        }
        serialize.end()
    }
}

#[derive(Debug, Deserialize)]
pub struct ZedToken {
    pub token: zanzibar::Zookie<'static>,
}

impl From<ZedToken> for zanzibar::Zookie<'static> {
    fn from(zed: ZedToken) -> Self {
        zed.token
    }
}

/// Used for mutating a single relationship within the service.
#[derive(Debug, Copy, Clone, Serialize)]
pub(crate) enum RelationshipUpdateOperation {
    /// Create the relationship only if it doesn't exist, and error otherwise.
    #[serde(rename = "OPERATION_CREATE")]
    Create,
    /// Upsert the relationship, and will not error if it already exists.
    #[serde(rename = "OPERATION_TOUCH")]
    Touch,
    /// Delete the relationship. If the relationship does not exist, this operation will no-op.
    #[serde(rename = "OPERATION_DELETE")]
    Delete,
}

/// Represents a reference to a caveat to be used by caveated relationships.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase", bound = "")]
pub(crate) struct ContextualizedCaveat<'a> {
    /// The name of the caveat expression to use, as defined in the schema.
    caveat_name: &'a str,
    /// Consists of key-value pairs that will be injected at evaluation time.
    ///
    /// The keys must match the arguments defined on the caveat in the schema.
    context: HashMap<&'a str, serde_json::Value>,
}
