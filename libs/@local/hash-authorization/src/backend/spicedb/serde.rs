use serde::{de::IntoDeserializer, Deserialize, Deserializer, Serialize};

use crate::zanzibar::types::{object::Object, relationship::Relationship, subject::Subject};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SerializedObjectRef<'a, N, I> {
    object_type: &'a N,
    object_id: &'a I,
}

impl<'a, N, I> SerializedObjectRef<'a, N, I> {
    #[must_use]
    pub(crate) fn from_object<O: Object<Namespace = N, Id = I>>(object: &'a O) -> Self {
        Self {
            object_type: object.namespace(),
            object_id: object.id(),
        }
    }
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SerializedObject<N, I> {
    object_type: N,
    object_id: I,
}

pub(crate) mod object {
    use serde::{de, Deserialize, Deserializer, Serialize, Serializer};

    use crate::{
        backend::spicedb::serde::{SerializedObject, SerializedObjectRef},
        zanzibar::types::object::Object,
    };

    #[expect(clippy::trivially_copy_pass_by_ref, reason = "Used in generic context")]
    pub(crate) fn serialize<T, S>(object: &&T, serializer: S) -> Result<S::Ok, S::Error>
    where
        T: Object<Namespace: Serialize, Id: Serialize>,
        S: Serializer,
    {
        SerializedObjectRef::from_object(*object).serialize(serializer)
    }

    pub(crate) fn deserialize<'de, T, D>(deserializer: D) -> Result<T, D::Error>
    where
        T: Object<Namespace: Deserialize<'de>, Id: Deserialize<'de>>,
        D: Deserializer<'de>,
    {
        let object = SerializedObject::<T::Namespace, T::Id>::deserialize(deserializer)?;
        T::new(object.object_type, object.object_id).map_err(de::Error::custom)
    }
}

#[derive(Serialize)]
#[serde(
    rename_all = "camelCase",
    bound = "O::Namespace: Serialize, O::Id: Serialize, R: Serialize"
)]
struct SerializedSubjectRef<'a, O: Object, R> {
    #[serde(with = "object")]
    object: &'a O,
    #[serde(skip_serializing_if = "Option::is_none")]
    optional_relation: Option<&'a R>,
}

impl<'a, O: Object + 'a, R> SerializedSubjectRef<'a, O, R> {
    #[must_use]
    pub(crate) fn from_subject<S: Subject<Object = O, Relation = R>>(subject: &'a S) -> Self {
        Self {
            object: subject.object(),
            optional_relation: subject.relation(),
        }
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
#[serde(
    rename_all = "camelCase",
    bound = "O: Object<Namespace: Deserialize<'de>, Id: Deserialize<'de>>, R: Deserialize<'de>"
)]
struct SerializedSubject<O, R> {
    #[serde(with = "object")]
    object: O,
    #[serde(deserialize_with = "empty_string_as_none")]
    optional_relation: Option<R>,
}

pub(crate) mod subject {
    use serde::{de, Deserialize, Deserializer, Serialize, Serializer};

    use crate::{
        backend::spicedb::serde::{SerializedSubject, SerializedSubjectRef},
        zanzibar::types::{object::Object, subject::Subject},
    };

    #[expect(clippy::trivially_copy_pass_by_ref, reason = "Used in generic context")]
    pub(crate) fn serialize<T, S>(subject: &&T, serializer: S) -> Result<S::Ok, S::Error>
    where
        T: Subject<Object: Object<Namespace: Serialize, Id: Serialize>, Relation: Serialize>,
        S: Serializer,
    {
        SerializedSubjectRef::from_subject(*subject).serialize(serializer)
    }

    pub(crate) fn deserialize<'de, T, D>(deserializer: D) -> Result<T, D::Error>
    where
        T: Subject<
                Object: Object<Namespace: Deserialize<'de>, Id: Deserialize<'de>>,
                Relation: Deserialize<'de>,
            >,
        D: Deserializer<'de>,
    {
        let subject = SerializedSubject::<T::Object, T::Relation>::deserialize(deserializer)?;
        T::new(subject.object, subject.optional_relation).map_err(de::Error::custom)
    }
}

#[derive(Serialize)]
#[serde(
    rename_all = "camelCase",
    bound = "O::Namespace: Serialize, O::Id: Serialize, R: Serialize, S::Object: \
             Object<Namespace: Serialize, Id: Serialize>, S::Relation: Serialize"
)]
struct SerializedRelationshipRef<'a, O: Object, R, S: Subject> {
    #[serde(with = "object")]
    resource: &'a O,
    relation: &'a R,
    #[serde(with = "subject")]
    subject: &'a S,
}

impl<'a, O: Object + 'a, R, S: Subject + 'a> SerializedRelationshipRef<'a, O, R, S> {
    #[must_use]
    pub(crate) fn from_relationship<T: Relationship<Object = O, Relation = R, Subject = S>>(
        relationship: &'a T,
    ) -> Self {
        Self {
            resource: relationship.object(),
            relation: relationship.relation(),
            subject: relationship.subject(),
        }
    }
}

#[derive(Deserialize)]
#[serde(
    rename_all = "camelCase",
    bound = "O: Object<Namespace: Deserialize<'de>, Id: Deserialize<'de>>, R: Deserialize<'de>, \
             S: Subject<Object: Object<Namespace: Deserialize<'de>,Id: Deserialize<'de>>, \
             Relation: Deserialize<'de>>"
)]
struct SerializedRelationship<O, R, S> {
    #[serde(with = "object")]
    resource: O,
    relation: R,
    #[serde(with = "subject")]
    subject: S,
}

pub(crate) mod relationship {
    use serde::{de, Deserialize, Deserializer, Serialize, Serializer};

    use crate::{
        backend::spicedb::serde::{SerializedRelationship, SerializedRelationshipRef},
        zanzibar::types::{object::Object, relationship::Relationship, subject::Subject},
    };

    pub(crate) fn serialize<T, S>(relationship: &T, serializer: S) -> Result<S::Ok, S::Error>
    where
        T: Relationship<
                Object: Object<Namespace: Serialize, Id: Serialize>,
                Relation: Serialize,
                Subject: Subject<
                    Object: Object<Namespace: Serialize, Id: Serialize>,
                    Relation: Serialize,
                >,
            >,
        S: Serializer,
    {
        SerializedRelationshipRef::from_relationship(relationship).serialize(serializer)
    }

    pub(crate) fn deserialize<'de, T, D>(deserializer: D) -> Result<T, D::Error>
    where
        T: Relationship<
                Object: Object<Namespace: Deserialize<'de>, Id: Deserialize<'de>>,
                Relation: Deserialize<'de>,
                Subject: Subject<
                    Object: Object<Namespace: Deserialize<'de>, Id: Deserialize<'de>>,
                    Relation: Deserialize<'de>,
                >,
            >,
        D: Deserializer<'de>,
    {
        let relationship =
            SerializedRelationship::<T::Object, T::Relation, T::Subject>::deserialize(
                deserializer,
            )?;
        T::new(
            relationship.resource,
            relationship.relation,
            relationship.subject,
        )
        .map_err(de::Error::custom)
    }
}

pub(crate) mod relationship_filter {
    use serde::{Serialize, Serializer};

    use crate::zanzibar::types::relationship::RelationshipFilter;

    #[derive(Serialize)]
    #[serde(rename_all = "camelCase")]
    struct SubjectFilterRelationFilter<'a, R> {
        relation: &'a R,
    }

    #[derive(Serialize)]
    #[serde(rename_all = "camelCase")]
    struct SerializedSubjectFilter<'a, N, I, R> {
        subject_type: &'a N,
        #[serde(skip_serializing_if = "Option::is_none")]
        optional_subject_id: Option<&'a I>,
        #[serde(skip_serializing_if = "Option::is_none")]
        optional_relation: Option<SubjectFilterRelationFilter<'a, R>>,
    }

    #[derive(Serialize)]
    #[serde(rename_all = "camelCase")]
    struct SerializedRelationshipFilter<'a, ON, OI, R, SN, SI, SR> {
        resource_type: &'a ON,
        #[serde(skip_serializing_if = "Option::is_none")]
        optional_resource_id: Option<&'a OI>,
        #[serde(skip_serializing_if = "Option::is_none")]
        optional_relation: Option<&'a R>,
        #[serde(skip_serializing_if = "Option::is_none")]
        optional_subject_filter: Option<SerializedSubjectFilter<'a, SN, SI, SR>>,
    }

    pub(crate) fn serialize<ON, OI, R, SN, SI, SR, S>(
        relationship: &RelationshipFilter<'_, ON, OI, R, SN, SI, SR>,
        serializer: S,
    ) -> Result<S::Ok, S::Error>
    where
        ON: Serialize,
        OI: Serialize,
        R: Serialize,
        SN: Serialize,
        SI: Serialize,
        SR: Serialize,
        S: Serializer,
    {
        SerializedRelationshipFilter {
            resource_type: &relationship.object.namespace,
            optional_resource_id: relationship.object.id.as_ref(),
            optional_relation: relationship.relation,
            optional_subject_filter: relationship.subject.as_ref().map(|subject| {
                SerializedSubjectFilter {
                    subject_type: &subject.object.namespace,
                    optional_subject_id: subject.object.id.as_ref(),
                    optional_relation: subject
                        .relation
                        .map(|relation| SubjectFilterRelationFilter { relation }),
                }
            }),
        }
        .serialize(serializer)
    }
}
