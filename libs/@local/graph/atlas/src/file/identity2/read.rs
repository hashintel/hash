use super::FileHeader;
use crate::file::region::header::HeaderMap;

pub(crate) struct IdentifyFile {
    map: HeaderMap<FileHeader>,
}

impl IdentifyFile {
    pub(crate) const fn new(map: HeaderMap<FileHeader>) -> Self {
        Self { map }
    }
}
