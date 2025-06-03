// This file was generated with `clorinde`. Do not modify.

pub use generic_client::GenericClient;
use tokio_postgres::{Error, Statement};
#[cfg(feature = "deadpool")]
mod deadpool;
mod generic_client;
/// This trait allows you to bind parameters to a query using a single
/// struct, rather than passing each bind parameter as a function parameter.
pub trait Params<'c, 'a, 's, P, O, C> {
    fn params(&'s mut self, client: &'c C, params: &'a P) -> O;
}
/// Cached statement
#[doc(hidden)]
pub struct Stmt {
    query: &'static str,
    cached: Option<Statement>,
}
impl Stmt {
    #[must_use]
    pub fn new(query: &'static str) -> Self {
        Self {
            query,
            cached: None,
        }
    }
    pub async fn prepare<'a, C: GenericClient>(
        &'a mut self,
        client: &C,
    ) -> Result<&'a Statement, Error> {
        if self.cached.is_none() {
            let stmt = client.prepare(self.query).await?;
            self.cached = Some(stmt);
        }
        Ok(unsafe { self.cached.as_ref().unwrap_unchecked() })
    }
}
