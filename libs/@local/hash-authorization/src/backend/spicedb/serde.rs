use serde::{de::IntoDeserializer, Deserialize, Deserializer, Serialize};

use crate::zanzibar::types::Resource;

pub(crate) mod resource {
    use serde::{de, Deserialize, Deserializer, Serialize, Serializer};

    use crate::zanzibar::types::Resource;

    #[derive(Serialize, Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct SerializedResource<N, I> {
        object_type: N,
        object_id: I,
    }

    pub(crate) fn serialize<T, S>(resource: &T, serializer: S) -> Result<S::Ok, S::Error>
    where
        T: Resource<Kind: Serialize, Id: Serialize>,
        S: Serializer,
    {
        let (resource_type, resource_id) = resource.to_parts();
        SerializedResource {
            object_type: resource_type,
            object_id: resource_id,
        }
        .serialize(serializer)
    }

    pub(crate) fn deserialize<'de, T, D>(deserializer: D) -> Result<T, D::Error>
    where
        T: Resource<Kind: Deserialize<'de>, Id: Deserialize<'de>>,
        D: Deserializer<'de>,
    {
        let resource = SerializedResource::<T::Kind, T::Id>::deserialize(deserializer)?;
        T::from_parts(resource.object_type, resource.object_id).map_err(de::Error::custom)
    }
}

pub(crate) mod resource_ref {
    use serde::{Serialize, Serializer};

    use crate::zanzibar::types::Resource;

    #[expect(clippy::trivially_copy_pass_by_ref, reason = "Used in generic context")]
    pub(crate) fn serialize<T, S>(resource: &&T, serializer: S) -> Result<S::Ok, S::Error>
    where
        T: Resource<Kind: Serialize, Id: Serialize>,
        S: Serializer,
    {
        super::resource::serialize(*resource, serializer)
    }
}

pub(crate) mod relation {
    use alloc::borrow::Cow;

    use serde::{de, de::IntoDeserializer, ser, Deserialize, Deserializer, Serialize, Serializer};

    use crate::zanzibar::types::LeveledRelation;

    pub(crate) fn serialize<N, S>(
        relation: &LeveledRelation<N>,
        serializer: S,
    ) -> Result<S::Ok, S::Error>
    where
        N: Serialize,
        S: Serializer,
    {
        format_args!(
            "level_{:02}_{}",
            relation.level,
            serde_plain::to_string(&relation.name).map_err(ser::Error::custom)?,
        )
        .serialize(serializer)
    }

    pub(crate) fn deserialize<'de, N, D>(deserializer: D) -> Result<LeveledRelation<N>, D::Error>
    where
        N: Deserialize<'de>,
        D: Deserializer<'de>,
    {
        const ERROR_MSG: &str =
            "Invalid relation name, expected a relation name in the form of `level_XX_NAME`";

        let string: Cow<'de, str> = Deserialize::deserialize(deserializer)?;

        let (level_str, tail) = string
            .split_once('_')
            .ok_or_else(|| de::Error::custom(ERROR_MSG))?;
        if level_str != "level" {
            return Err(de::Error::custom(ERROR_MSG));
        }
        let (level, name) = tail
            .split_once('_')
            .ok_or_else(|| de::Error::custom(ERROR_MSG))?;

        Ok(LeveledRelation {
            name: N::deserialize(name.into_deserializer())?,
            level: serde_plain::from_str(level).map_err(de::Error::custom)?,
        })
    }
}

#[derive(Serialize, Deserialize)]
#[serde(
    rename_all = "camelCase",
    bound(
        serialize = "O: Resource<Kind: Serialize, Id: Serialize>, R: Serialize",
        deserialize = "O: Resource<Kind: Deserialize<'de>, Id: Deserialize<'de>>, R: \
                       Deserialize<'de>"
    )
)]
struct SerializedSubject<O, R> {
    #[serde(with = "resource")]
    object: O,
    #[serde(deserialize_with = "empty_string_as_none")]
    optional_relation: Option<R>,
}

pub(crate) mod subject_ref {
    use serde::{Serialize, Serializer};

    use crate::{
        backend::spicedb::serde::SerializedSubject,
        zanzibar::types::{Resource, Subject},
    };

    #[expect(clippy::trivially_copy_pass_by_ref, reason = "Used in generic context")]
    pub(crate) fn serialize<T, S>(subject: &&T, serializer: S) -> Result<S::Ok, S::Error>
    where
        T: Subject<Resource: Resource<Kind: Serialize, Id: Serialize>, Relation: Serialize>,
        S: Serializer,
    {
        let (resource, optional_relation) = subject.to_parts();
        SerializedSubject {
            object: resource,
            optional_relation,
        }
        .serialize(serializer)
    }
}

pub(crate) mod subject {
    use serde::{de, Deserialize, Deserializer, Serialize, Serializer};

    use crate::{
        backend::spicedb::serde::SerializedSubject,
        zanzibar::types::{Resource, Subject},
    };

    pub(crate) fn serialize<T, S>(subject: &T, serializer: S) -> Result<S::Ok, S::Error>
    where
        T: Subject<Resource: Resource<Kind: Serialize, Id: Serialize>, Relation: Serialize>,
        S: Serializer,
    {
        let (resource, optional_relation) = subject.to_parts();
        SerializedSubject {
            object: resource,
            optional_relation,
        }
        .serialize(serializer)
    }

    pub(crate) fn deserialize<'de, T, D>(deserializer: D) -> Result<T, D::Error>
    where
        T: Subject<
                Resource: Resource<Kind: Deserialize<'de>, Id: Deserialize<'de>>,
                Relation: Deserialize<'de>,
            >,
        D: Deserializer<'de>,
    {
        let subject: SerializedSubject<T::Resource, T::Relation> =
            Deserialize::deserialize(deserializer)?;
        T::from_parts(subject.object, subject.optional_relation).map_err(de::Error::custom)
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
            types::{LeveledRelation, Relationship, RelationshipParts, Resource},
            Relation,
        },
    };

    #[derive(Serialize, Deserialize)]
    #[serde(
        rename_all = "camelCase",
        bound(
            serialize = "O: Resource<Kind: Serialize, Id: Serialize>, R: Serialize, S: \
                         Resource<Kind: Serialize, Id: Serialize>, SR: Serialize",
            deserialize = "O: Resource<Kind: Deserialize<'de>, Id: Deserialize<'de>>, R: \
                           Deserialize<'de>, S: Resource<Kind: Deserialize<'de>, Id: \
                           Deserialize<'de>>, SR: Deserialize<'de>"
        )
    )]
    struct SerializedRelationship<O, R, S, SR> {
        #[serde(with = "super::resource")]
        resource: O,
        #[serde(with = "super::relation")]
        relation: LeveledRelation<R>,
        subject: SerializedSubject<S, SR>,
    }

    pub(crate) fn serialize<T, S>(relationship: &T, serializer: S) -> Result<S::Ok, S::Error>
    where
        T: Relationship<
                Resource: Resource<Kind: Serialize, Id: Serialize>,
                Relation: Relation<T::Resource> + Serialize,
                Subject: Resource<Kind: Serialize, Id: Serialize>,
                SubjectSet: Relation<T::Subject> + Serialize,
            >,
        S: Serializer,
    {
        let RelationshipParts {
            resource,
            relation,
            subject,
            subject_set,
        } = relationship.to_parts();

        SerializedRelationship {
            resource,
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
                Resource: Resource<Kind: Deserialize<'de>, Id: Deserialize<'de>>,
                Relation: Relation<T::Resource> + Deserialize<'de>,
                Subject: Resource<Kind: Deserialize<'de>, Id: Deserialize<'de>>,
                SubjectSet: Relation<T::Subject> + Deserialize<'de>,
            >,
        D: Deserializer<'de>,
    {
        let relationship = SerializedRelationship::deserialize(deserializer)?;
        T::from_parts(RelationshipParts {
            resource: relationship.resource,
            relation: relationship.relation,
            subject: relationship.subject.object,
            subject_set: relationship.subject.optional_relation,
        })
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
            resource_type: &relationship.resource.kind,
            optional_resource_id: relationship.resource.id.as_ref(),
            optional_relation: relationship.relation.as_ref(),
            optional_subject_filter: relationship.subject.as_ref().map(|subject| {
                SerializedSubjectFilter {
                    subject_type: &subject.resource.kind,
                    optional_subject_id: subject.resource.id.as_ref(),
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
