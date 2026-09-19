mod credentials;

mod entities;
mod types;

use aide::transform::TransformOpenApi;

use self::credentials::Credentials;
use super::Api;

pub(super) fn apis() -> impl Iterator<Item = Api> {
    entities::api().into_iter().chain(types::api())
}

const fn document(document: TransformOpenApi<'_>) -> TransformOpenApi<'_> {
    document
}
