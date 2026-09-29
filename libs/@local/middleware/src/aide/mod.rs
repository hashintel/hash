use aide::{
    OperationOutput, generate::in_context, openapi::ReferenceOr, transform::TransformOperation,
};

#[cfg(test)]
mod tests;

pub(crate) fn document_rejection<R: OperationOutput>(
    mut transform: TransformOperation<'_>,
) -> TransformOperation<'_> {
    // Tower layers do not participate in Aide's handler inference.
    in_context(|context| {
        let operation = transform.inner_mut();
        let inferred = R::inferred_responses(context, operation);
        let responses = operation.responses.get_or_insert_with(Default::default);
        for (status, response) in inferred {
            if let Some(status) = status {
                responses
                    .responses
                    .entry(status)
                    .or_insert(ReferenceOr::Item(response));
            } else {
                responses.default.get_or_insert(ReferenceOr::Item(response));
            }
        }
    });
    transform
}
