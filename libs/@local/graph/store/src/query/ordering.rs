use type_system::ontology::id::VersionedUrl;

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash, serde::Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase")]
pub enum Ordering {
    Ascending,
    Descending,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash, serde::Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase")]
pub enum NullOrdering {
    First,
    Last,
}

pub trait Sorting {
    type Cursor;

    fn cursor(&self) -> Option<&Self::Cursor>;

    fn set_cursor(&mut self, cursor: Self::Cursor);
}

pub struct VersionedUrlSorting {
    pub cursor: Option<VersionedUrl>,
}

impl Sorting for VersionedUrlSorting {
    type Cursor = VersionedUrl;

    fn cursor(&self) -> Option<&Self::Cursor> {
        self.cursor.as_ref()
    }

    fn set_cursor(&mut self, cursor: Self::Cursor) {
        self.cursor = Some(cursor);
    }
}
