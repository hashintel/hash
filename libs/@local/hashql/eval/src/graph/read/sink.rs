use hash_graph_store::filter::{Filter, QueryRecord};

pub(crate) enum FilterSink<'a, 'b, R: QueryRecord> {
    And(&'a mut Vec<Filter<'b, R>>),
    Or(&'a mut Vec<Filter<'b, R>>),
    Fail,
}

impl<'a, 'b, R: QueryRecord> FilterSink<'a, 'b, R> {
    pub(crate) const fn from_result<E>(result: &'a mut Result<Vec<Filter<'b, R>>, E>) -> Self {
        match result {
            Ok(filters) => FilterSink::And(filters),
            Err(_) => FilterSink::Fail,
        }
    }

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

    pub(crate) fn push(&mut self, filter: Filter<'b, R>) {
        match self {
            FilterSink::And(inner) | FilterSink::Or(inner) => inner.push(filter),
            FilterSink::Fail => {}
        }
    }
}
