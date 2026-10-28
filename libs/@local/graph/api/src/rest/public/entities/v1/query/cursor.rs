//! The position of a page in the result of a query.

use core::{error::Error, fmt, str::FromStr as _};

use hash_graph_store::{
    entity::{EntityQueryCursor, EntityQueryPath, EntityQuerySorting, EntityQuerySortingRecord},
    query::{CursorField, Ordering},
};
use schemars::JsonSchema;
use serde::Deserialize;
use type_system::knowledge::entity::id::EntityUuid;
use uuid::{Uuid, fmt::Simple};

/// An opaque position in a query's result: the last entity of the previous page.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, JsonSchema)]
#[serde(try_from = "String")]
#[schemars(
    with = "String",
    description = "An opaque position in a query's result.",
    extend("minLength" = 1)
)]
pub(super) struct Cursor(EntityUuid);

impl Cursor {
    /// The position after the entity with `entity_uuid`.
    pub(super) const fn after(entity_uuid: EntityUuid) -> Self {
        Self(entity_uuid)
    }

    /// The order of a query's result, starting after `cursor`.
    ///
    /// The UUID orders the entities totally only while the query reads no drafts and one edition
    /// per entity: drafts and editions share their entity's UUID.
    pub(super) fn sorting(cursor: Option<Self>) -> EntityQuerySorting<'static> {
        EntityQuerySorting {
            paths: vec![EntityQuerySortingRecord {
                path: EntityQueryPath::Uuid,
                ordering: Ordering::Ascending,
                nulls: None,
            }],
            cursor: cursor.map(|Self(entity_uuid)| EntityQueryCursor {
                values: vec![CursorField::Uuid(entity_uuid.into())],
            }),
        }
    }
}

impl fmt::Display for Cursor {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Display::fmt(&Uuid::from(self.0).simple(), fmt)
    }
}

/// The cursor is empty or not in the form the server writes.
#[derive(Debug, derive_more::Display)]
pub(super) enum CursorError {
    #[display("the cursor is empty")]
    Empty,
    #[display("the cursor is not valid")]
    Invalid(uuid::Error),
}

impl Error for CursorError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Empty => None,
            Self::Invalid(error) => Some(error),
        }
    }
}

impl TryFrom<String> for Cursor {
    type Error = CursorError;

    fn try_from(cursor: String) -> Result<Self, Self::Error> {
        if cursor.is_empty() {
            return Err(CursorError::Empty);
        }
        // The server writes a cursor as the 32 hexadecimal digits of a UUID, without hyphens.
        Simple::from_str(&cursor)
            .map(|uuid| Self(EntityUuid::new(uuid.into_uuid())))
            .map_err(CursorError::Invalid)
    }
}

#[cfg(test)]
mod tests {
    use core::assert_matches;

    use hash_graph_store::{
        entity::{EntityQueryCursor, EntityQueryPath},
        query::{CursorField, Ordering},
    };
    use type_system::knowledge::entity::id::EntityUuid;
    use uuid::Uuid;

    use super::{Cursor, CursorError};

    const ENTITY_UUID: u128 = 0xBE2C5B2F_E3E1_4F26_A0C4_0F8B5E9C4A1D;

    fn parse(cursor: &str) -> Result<Cursor, CursorError> {
        Cursor::try_from(cursor.to_owned())
    }

    #[test]
    fn round_trip() {
        let cursor = Cursor::after(EntityUuid::new(Uuid::from_u128(ENTITY_UUID)));
        assert_eq!(
            parse(&cursor.to_string()).expect("should read the written cursor"),
            cursor,
            "a written cursor should read back as the same position"
        );
    }

    #[test]
    fn parse_hyphenated() {
        assert_matches!(
            parse("be2c5b2f-e3e1-4f26-a0c4-0f8b5e9c4a1d"),
            Err(CursorError::Invalid(_))
        );
    }

    #[test]
    fn sorting_after() {
        let sorting = Cursor::sorting(Some(Cursor::after(EntityUuid::new(Uuid::from_u128(
            ENTITY_UUID,
        )))));
        assert_matches!(
            sorting.paths.as_slice(),
            [record] if record.path == EntityQueryPath::Uuid
                && record.ordering == Ordering::Ascending
                && record.nulls.is_none(),
            "the entities should be ordered by ascending UUID"
        );
        assert_matches!(
            sorting.cursor,
            Some(EntityQueryCursor { values })
                if values == [CursorField::Uuid(Uuid::from_u128(ENTITY_UUID))],
            "the query should continue after the cursor's entity"
        );
    }
}
