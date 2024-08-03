use hql_span::file::FileId;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Source {
    pub id: FileId,
    pub text: Box<str>,
}
