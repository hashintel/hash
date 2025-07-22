// This file was generated with `clorinde`. Do not modify.

pub use generic_client::GenericClient;
#[cfg(feature = "deadpool")]
mod deadpool;
mod generic_client;
use tokio_postgres::{
    Error, Row, RowStream, Statement,
    types::{BorrowToSql, ToSql},
};
/// This trait allows you to bind parameters to a query using a single
/// struct, rather than passing each bind parameter as a function parameter.
pub trait Params<'c, 'a, 's, P, O, C> {
    fn params(&'s self, client: &'c C, params: &'a P) -> O;
}
pub async fn one<C: GenericClient>(
    client: &C,
    query: &str,
    params: &[&(dyn ToSql + Sync)],
    cached: Option<&Statement>,
) -> Result<Row, Error> {
    if let Some(cached) = cached {
        client.query_one(cached, params).await
    } else if C::stmt_cache() {
        let cached = client.prepare(query).await?;
        client.query_one(&cached, params).await
    } else {
        client.query_one(query, params).await
    }
}
pub async fn opt<C: GenericClient>(
    client: &C,
    query: &str,
    params: &[&(dyn ToSql + Sync)],
    cached: Option<&Statement>,
) -> Result<Option<Row>, Error> {
    if let Some(cached) = cached {
        client.query_opt(cached, params).await
    } else if C::stmt_cache() {
        let cached = client.prepare(query).await?;
        client.query_opt(&cached, params).await
    } else {
        client.query_opt(query, params).await
    }
}
pub async fn raw<C: GenericClient, P, I>(
    client: &C,
    query: &str,
    params: I,
    cached: Option<&Statement>,
) -> Result<RowStream, Error>
where
    P: BorrowToSql,
    I: IntoIterator<Item = P> + Sync + Send,
    I::IntoIter: ExactSizeIterator,
{
    if let Some(cached) = cached {
        client.query_raw(cached, params).await
    } else if C::stmt_cache() {
        let cached = client.prepare(query).await?;
        client.query_raw(&cached, params).await
    } else {
        client.query_raw(query, params).await
    }
}
