use duckdb::types::Value;

/// The rows a query returned.
#[derive(Debug)]
pub struct Rows {
    columns: Vec<String>,
    rows: Vec<Vec<Value>>,
}

impl Rows {
    pub(super) const fn new(columns: Vec<String>, rows: Vec<Vec<Value>>) -> Self {
        Self { columns, rows }
    }

    /// Returns the column names, in the order the query returned them.
    #[must_use]
    pub fn columns(&self) -> &[String] {
        &self.columns
    }

    /// Returns each row's values, in the order of [`columns`](Self::columns).
    pub fn iter(&self) -> impl ExactSizeIterator<Item = &[Value]> {
        self.rows.iter().map(Vec::as_slice)
    }
}
