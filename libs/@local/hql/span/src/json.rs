use core::fmt::Display;

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum JsonSegment {
    Key(Box<str>),
    Index(usize),
}

impl Display for JsonSegment {
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        match self {
            Self::Key(key) => Display::fmt(key, f),
            Self::Index(index) => Display::fmt(index, f),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct JsonPointer(Vec<JsonSegment>);

impl JsonPointer {
    pub fn new(segments: impl IntoIterator<Item = JsonSegment>) -> Self {
        segments.into_iter().collect()
    }

    pub fn iter(&self) -> core::slice::Iter<'_, JsonSegment> {
        self.0.iter()
    }

    #[must_use]
    pub fn get(&self, index: usize) -> Option<&JsonSegment> {
        self.0.get(index)
    }

    pub fn push(&mut self, segment: JsonSegment) -> &mut Self {
        self.0.push(segment);
        self
    }
}

impl Display for JsonPointer {
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        for segment in &self.0 {
            f.write_str("/")?;
            Display::fmt(segment, f)?;
        }

        Ok(())
    }
}

impl IntoIterator for JsonPointer {
    type IntoIter = alloc::vec::IntoIter<Self::Item>;
    type Item = JsonSegment;

    fn into_iter(self) -> Self::IntoIter {
        self.0.into_iter()
    }
}

impl<'a> IntoIterator for &'a JsonPointer {
    type IntoIter = core::slice::Iter<'a, JsonSegment>;
    type Item = &'a JsonSegment;

    fn into_iter(self) -> Self::IntoIter {
        self.0.iter()
    }
}

impl FromIterator<JsonSegment> for JsonPointer {
    fn from_iter<T: IntoIterator<Item = JsonSegment>>(iter: T) -> Self {
        Self(iter.into_iter().collect())
    }
}
