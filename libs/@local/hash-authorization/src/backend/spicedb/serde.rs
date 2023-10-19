use serde::{de::IntoDeserializer, Deserialize, Deserializer, Serialize};

use crate::zanzibar::types::Object;

pub(crate) mod object {
    use serde::{de, Deserialize, Deserializer, Serialize, Serializer};

    use crate::zanzibar::types::Object;

    #[derive(Serialize, Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct SerializedObject<N, I> {
        object_type: N,
        object_id: I,
    }

    pub(crate) fn serialize<T, S>(object: &T, serializer: S) -> Result<S::Ok, S::Error>
    where
        T: Object<Namespace: Serialize, Id: Serialize>,
        S: Serializer,
    {
        let (object_type, object_id) = object.to_parts();
        SerializedObject {
            object_type,
            object_id,
        }
        .serialize(serializer)
    }

    pub(crate) fn deserialize<'de, T, D>(deserializer: D) -> Result<T, D::Error>
    where
        T: Object<Namespace: Deserialize<'de>, Id: Deserialize<'de>>,
        D: Deserializer<'de>,
    {
        let object = SerializedObject::<T::Namespace, T::Id>::deserialize(deserializer)?;
        T::from_parts(object.object_type, object.object_id).map_err(de::Error::custom)
    }
}

pub(crate) mod object_ref {
    use serde::{Serialize, Serializer};

    use crate::zanzibar::types::Object;

    #[expect(clippy::trivially_copy_pass_by_ref, reason = "Used in generic context")]
    pub(crate) fn serialize<T, S>(object: &&T, serializer: S) -> Result<S::Ok, S::Error>
    where
        T: Object<Namespace: Serialize, Id: Serialize>,
        S: Serializer,
    {
        super::object::serialize(*object, serializer)
    }
}

#[derive(Serialize, Deserialize)]
#[serde(
    rename_all = "camelCase",
    bound(
        serialize = "O: Object<Namespace: Serialize, Id: Serialize>, R: Serialize",
        deserialize = "O: Object<Namespace: Deserialize<'de>, Id: Deserialize<'de>>, R: \
                       Deserialize<'de>"
    )
)]
struct SerializedSubject<O, R> {
    #[serde(with = "object")]
    object: O,
    #[serde(deserialize_with = "empty_string_as_none")]
    optional_relation: Option<R>,
}

pub(crate) mod subject_ref {
    use serde::{Serialize, Serializer};

    use crate::{
        backend::spicedb::serde::SerializedSubject,
        zanzibar::types::{Object, Subject},
    };

    #[expect(clippy::trivially_copy_pass_by_ref, reason = "Used in generic context")]
    pub(crate) fn serialize<T, S>(subject: &&T, serializer: S) -> Result<S::Ok, S::Error>
    where
        T: Subject<Object: Object<Namespace: Serialize, Id: Serialize>, Relation: Serialize>,
        S: Serializer,
    {
        let (object, optional_relation) = subject.to_parts();
        SerializedSubject {
            object,
            optional_relation,
        }
        .serialize(serializer)
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

pub(crate) mod relationship {
    use serde::{de, Deserialize, Deserializer, Serialize, Serializer};

    use crate::{
        backend::spicedb::serde::SerializedSubject,
        zanzibar::{
            types::{Object, Relationship},
            Affiliation,
        },
    };

    #[derive(Serialize, Deserialize)]
    #[serde(
        rename_all = "camelCase",
        bound(
            serialize = "O: Object<Namespace: Serialize, Id: Serialize>, R: Serialize, S: \
                         Object<Namespace: Serialize, Id: Serialize>, SR: Serialize",
            deserialize = "O: Object<Namespace: Deserialize<'de>, Id: Deserialize<'de>>, R: \
                           Deserialize<'de>, S: Object<Namespace: Deserialize<'de>, Id: \
                           Deserialize<'de>>, SR: Deserialize<'de>"
        )
    )]
    struct SerializedRelationship<O, R, S, SR> {
        #[serde(with = "super::object")]
        resource: O,
        relation: R,
        subject: SerializedSubject<S, SR>,
    }

    pub(crate) fn serialize<T, S>(relationship: &T, serializer: S) -> Result<S::Ok, S::Error>
    where
        T: Relationship<
                Object: Object<Namespace: Serialize, Id: Serialize>,
                Relation: Affiliation<T::Object> + Serialize,
                Subject: Object<Namespace: Serialize, Id: Serialize>,
                SubjectSet: Affiliation<T::Subject> + Serialize,
            >,
        S: Serializer,
    {
        let (object, relation, subject, subject_set) = relationship.to_parts();
        SerializedRelationship {
            resource: object,
            relation,
            subject: SerializedSubject {
                object: subject,
                optional_relation: subject_set,
            },
        }
        .serialize(serializer)
    }

    pub(crate) fn deserialize<'de, T, D>(deserializer: D) -> Result<T, D::Error>
    where
        T: Relationship<
                Object: Object<Namespace: Deserialize<'de>, Id: Deserialize<'de>>,
                Relation: Affiliation<T::Object> + Deserialize<'de>,
                Subject: Object<Namespace: Deserialize<'de>, Id: Deserialize<'de>>,
                SubjectSet: Affiliation<T::Subject> + Deserialize<'de>,
            >,
        D: Deserializer<'de>,
    {
        let relationship = SerializedRelationship::deserialize(deserializer)?;
        T::from_parts(
            relationship.resource,
            relationship.relation,
            relationship.subject.object,
            relationship.subject.optional_relation,
        )
        .map_err(de::Error::custom)
    }
}

pub(crate) mod relationship_filter {
    use serde::{Serialize, Serializer};

    use crate::zanzibar::types::RelationshipFilter;

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
        relationship: &RelationshipFilter<ON, OI, R, SN, SI, SR>,
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
            optional_relation: relationship.relation.as_ref(),
            optional_subject_filter: relationship.subject.as_ref().map(|subject| {
                SerializedSubjectFilter {
                    subject_type: &subject.object.namespace,
                    optional_subject_id: subject.object.id.as_ref(),
                    optional_relation: subject
                        .relation
                        .as_ref()
                        .map(|relation| SubjectFilterRelationFilter { relation }),
                }
            }),
        }
        .serialize(serializer)
    }
}
