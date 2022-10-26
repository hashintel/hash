#[cfg(test)]
pub mod test_utils {
    use crate::store::query::{Path, PathSegment};

    pub fn create_path(segments: impl IntoIterator<Item = &'static str>) -> Path {
        Path {
            segments: segments
                .into_iter()
                .map(|segment| PathSegment {
                    identifier: segment.to_owned(),
                })
                .collect(),
        }
    }
}
