use memory::arrow::{ColumnChange, IntoArrowChange};

use crate::Result;

pub struct StateColumn {
    inner: Box<dyn IntoArrowChange + Send + Sync>,
}

impl StateColumn {
    pub fn get_arrow_change(&self, range: std::ops::Range<usize>) -> Result<ColumnChange> {
        Ok(self.inner.get_arrow_change(range)?)
    }

    pub fn new(inner: Box<dyn IntoArrowChange + Send + Sync>) -> StateColumn {
        StateColumn { inner }
    }
}
