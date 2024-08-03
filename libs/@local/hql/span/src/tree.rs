use core::fmt::Debug;

use text_size::TextRange;

use crate::file::FileId;

#[derive(Clone, PartialEq, Eq, Hash)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct SpanTree<E> {
    pub file: FileId,
    #[cfg_attr(feature = "serde", serde(with = "crate::encoding::text_range"))]
    pub range: TextRange,
    pub parent: Option<Box<SpanTree<E>>>,
    pub extra: Option<E>,
}

impl<E> Debug for SpanTree<E> {
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        f.debug_struct("SpanTree")
            .field("file", &self.file)
            .field("span", &self.range)
            .field("parent", &self.parent)
            .field("extra", &"..")
            .finish_non_exhaustive()
    }
}
