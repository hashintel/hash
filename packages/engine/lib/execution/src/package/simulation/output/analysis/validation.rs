use std::{fmt::Write, sync::Arc};

use crate::{
    package::simulation::output::analysis::analyzer::{AnalysisOperationRepr, AnalysisSourceRepr},
    Error, Result,
};

impl AnalysisSourceRepr {
    pub fn validate_def(&self) -> Result<()> {
        let results: Vec<(Arc<String>, Option<String>)> = self
            .outputs
            .iter()
            .map(|(name, operations)| {
                let mut error = ErrorBuilder::new();
                if operations.is_empty() {
                    error.add("Must have at least one operation".into());
                    return Ok((name.clone(), error.finish()));
                }

                if let Some(why) = operations[0].is_not_valid_first_operation()? {
                    error.add(why)
                }

                let mut prev_operation = &operations[0];
                for operation in operations.iter().skip(1) {
                    if let Some(err) =
                        operation.is_not_valid_subsequent_operation(prev_operation)?
                    {
                        error.add(err);
                    }
                    prev_operation = operation;
                }

                Ok((name.clone(), error.finish()))
            })
            .collect::<Result<_>>()?;

        if results.iter().any(|(_name, b)| b.is_some()) {
            let mut error_string = String::new();
            for (output, error) in results {
                if let Some(error_str) = error {
                    let _ = write!(
                        error_string,
                        "Output with name '{}' has an incorrect definition, errors: {{{}}}. ",
                        output, error_str
                    );
                }
            }
            Err(Error::from(format!(
                "Analysis file (analysis.json) contains error(s): {}",
                error_string
            )))
        } else {
            Ok(())
        }
    }
}

impl AnalysisOperationRepr {
    pub fn is_not_valid_first_operation(&self) -> Result<Option<String>> {
        let mut error = ErrorBuilder::new();
        if !(self.is_filter() || self.is_map() || self.is_count()) {
            error.add("The first operation must either be 'filter', 'sum' or 'count'".into());
        }

        if let AnalysisOperationRepr::Filter {
            field,
            comparison: _,
            value: _,
        } = self
        {
            if !field.is_string() {
                if let Ok(field_repr) = serde_json::to_string(field) {
                    error.add(format!(
                        "The first operation (a 'filter') must access a field of an agent by \
                         string, however the current 'field' value is {}",
                        field_repr
                    ));
                } else {
                    error.add(
                        "The first operation (a 'filter') must access a field of an agent by \
                         string"
                            .into(),
                    );
                }
            }
        }

        Ok(error.finish())
    }

    pub fn is_not_valid_subsequent_operation(&self, preceding: &Self) -> Result<Option<String>> {
        let result = match preceding {
            AnalysisOperationRepr::Filter {
                field,
                comparison: _,
                value: _,
            } => {
                let mut error = ErrorBuilder::new();
                if !(field.is_string() || field.is_u64()) {
                    error.add(
                        "A 'filter' operation must access a field (by string) or an element of an \
                         array (by non-negative integer)"
                            .into(),
                    );
                }

                if !(self.is_filter() || self.is_map() || self.is_count()) {
                    error.add(
                        "A 'filter' operation must be followed either by 'filter', 'get' or \
                         'count' operations"
                            .into(),
                    );
                }
                error.finish()
            }
            AnalysisOperationRepr::Get { field } => {
                let mut error = None;
                if !(field.is_string() || field.is_u64()) {
                    error = Some(
                        "A 'get' operation must access a field (by string) or an element of an \
                         array (by non-negative integer)"
                            .into(),
                    );
                }
                error
            }
            _ => Some(format!(
                "A '{}' operation must be terminal",
                serde_json::to_string(preceding)?
            )),
        };

        Ok(result)
    }
}

struct ErrorBuilder {
    inner: Vec<String>,
}

impl ErrorBuilder {
    fn new() -> ErrorBuilder {
        ErrorBuilder { inner: Vec::new() }
    }

    fn add(&mut self, error: String) {
        self.inner.push(error)
    }

    fn finish(self) -> Option<String> {
        if self.inner.is_empty() {
            return None;
        }

        let mut finished = String::new();
        self.inner.iter().enumerate().for_each(|(i, error)| {
            finished.push_str(error);
            if i != self.inner.len() - 1 {
                finished.push_str(". ");
            }
        });
        Some(finished)
    }
}
