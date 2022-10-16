use std::borrow::Cow;

use type_system::DataType;

use crate::store::query::QueryRecord;

/// A path to a [`DataType`] field.
///
/// Note: [`DataType`]s currently don't reference other [`DataType`]s, so the path can only be a
/// single field.
///
/// [`DataType`]: type_system::DataType
#[derive(Debug, PartialEq, Eq)]
pub enum DataTypeQueryPath<'q> {
    OwnedById,
    BaseUri,
    VersionedUri,
    Version,
    Title,
    Description,
    Type,
    Custom(Cow<'q, str>),
}

impl QueryRecord for DataType {
    type Path<'q> = DataTypeQueryPath<'q>;
}
