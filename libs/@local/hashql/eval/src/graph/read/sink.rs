use hash_graph_store::filter::{Filter, QueryRecord};

/// A mutable sink for building filter expressions during query evaluation.
pub(crate) enum FilterSink<'a, 'b, R: QueryRecord> {
    /// Collects filters that will be combined with AND logic.
    And(&'a mut Vec<Filter<'b, R>>),
    /// Collects filters that will be combined with OR logic.
    Or(&'a mut Vec<Filter<'b, R>>),
    /// Represents a failed state where filters are discarded.
    Fail,
}

impl<'a, 'b, R: QueryRecord> FilterSink<'a, 'b, R> {
    /// Create a sink from a result.
    ///
    /// Converts `Ok` to `And` and `Err` to `Fail`.
    pub(crate) const fn from_result<E>(result: &'a mut Result<Vec<Filter<'b, R>>, E>) -> Self {
        match result {
            Ok(filters) => FilterSink::And(filters),
            Err(_) => FilterSink::Fail,
        }
    }

    /// Creates an AND filter sink.
    ///
    /// In the case that the existing sink is already an AND sink, the same vector is returned,
    /// otherwise a new vector is created as a child.
    ///
    /// If the sink persists the `Fail` state.
    pub(crate) fn and(&mut self) -> FilterSink<'_, 'b, R> {
        match self {
            FilterSink::And(inner) => FilterSink::And(inner),
            FilterSink::Or(inner) => {
                let Filter::All(inner) = inner.push_mut(Filter::All(Vec::new())) else {
                    unreachable!()
                };

                FilterSink::And(inner)
            }
            FilterSink::Fail => FilterSink::Fail,
        }
    }

    /// Creates an OR filter sink.
    ///
    /// In the case that the existing sink is already an OR sink, the same vector is returned,
    /// otherwise a new vector is created as a child.
    pub(crate) fn or(&mut self) -> FilterSink<'_, 'b, R> {
        match self {
            FilterSink::And(inner) => {
                let Filter::Any(inner) = inner.push_mut(Filter::Any(Vec::new())) else {
                    unreachable!()
                };

                FilterSink::Or(inner)
            }
            FilterSink::Or(inner) => FilterSink::Or(inner),
            FilterSink::Fail => FilterSink::Fail,
        }
    }

    /// Pushes a filter into the sink.
    ///
    /// Pushes to the current vector, corresponding to either AND or OR. In the case of a failed
    /// state, the filter is discarded.
    pub(crate) fn push(&mut self, filter: Filter<'b, R>) {
        match self {
            FilterSink::And(inner) | FilterSink::Or(inner) => inner.push(filter),
            FilterSink::Fail => {}
        }
    }
}
