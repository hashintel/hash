mod span;
use alloc::borrow::Cow;

pub use self::span::{AbsoluteDiagnosticSpan, DiagnosticSpan};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct SourceId(u32);

pub struct Source<'source> {
    pub path: Option<Cow<'source, str>>,
    pub content: Cow<'source, str>,
}

impl<'source> Source<'source> {
    pub fn new(content: impl Into<Cow<'source, str>>) -> Self {
        Self {
            path: None,
            content: content.into(),
        }
    }

    #[must_use]
    pub fn with_path(self, path: impl Into<Cow<'source, str>>) -> Self {
        Self {
            path: Some(path.into()),
            content: self.content,
        }
    }
}

#[derive(Debug)]
pub(crate) struct ResolvedSource<'source> {
    pub id: SourceId,
    pub path: Option<Cow<'source, str>>,
    pub content: Cow<'source, str>,
}

#[derive(Debug)]
pub struct Sources<'source> {
    sources: Vec<ResolvedSource<'source>>,
}

impl<'source> Sources<'source> {
    #[must_use]
    pub const fn new() -> Self {
        Self {
            sources: Vec::new(),
        }
    }

    #[expect(clippy::cast_possible_truncation)]
    pub fn push(&mut self, source: Source<'source>) -> SourceId {
        assert!(self.sources.len() < u32::MAX as usize);

        let id = SourceId(self.sources.len() as u32);

        self.sources.push(ResolvedSource {
            id,
            path: source.path,
            content: source.content,
        });

        id
    }

    pub(crate) fn get(&self, id: SourceId) -> Option<&ResolvedSource<'source>> {
        self.sources.get(id.0 as usize)
    }
}

impl const Default for Sources<'_> {
    fn default() -> Self {
        Self::new()
    }
}
