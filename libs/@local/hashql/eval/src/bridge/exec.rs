use alloc::sync::Arc;
use core::pin::pin;

use crossfire::{AsyncRx, MAsyncRx, MAsyncTx, MTx, Rx, mpsc};
use futures_lite::StreamExt as _;
use hash_graph_postgres_store::store::{AsClient, PostgresStore};
use postgres_types::ToSql;
use tokio_postgres::GenericClient as _;
use tokio_util::task::TaskTracker;

pub enum ExecuteQueryResponse {
    Finish {
        statement: String,
        params: Vec<Box<dyn ToSql + Send + Sync>>,
    },
    Row(tokio_postgres::Row),
    Error(tokio_postgres::Error),
}

pub struct ExecuteQuery {
    statement: String,
    params: Vec<Box<dyn ToSql + Send + Sync>>,

    tx: MAsyncTx<mpsc::Array<ExecuteQueryResponse>>,
}

pub enum Command {
    ExecuteQuery(ExecuteQuery),
}

pub struct Ipc {
    tx: MTx<mpsc::Array<Command>>,
}

impl Ipc {
    pub fn execute_query(
        &self,
        statement: String,
        params: Vec<Box<dyn ToSql + Send + Sync>>,
    ) -> Rx<mpsc::Array<ExecuteQueryResponse>> {
        const BUFFER_SIZE: usize = 16;

        let (tx, rx) = mpsc::build(mpsc::Array::new(BUFFER_SIZE));

        let query = ExecuteQuery {
            statement,
            params,

            tx,
        };

        self.tx.send(Command::ExecuteQuery(query));

        rx
    }
}

struct Executor<C> {
    store: Arc<PostgresStore<C>>,
    tasks: TaskTracker,
    rx: MAsyncRx<mpsc::Array<Command>>,
}

impl<C: AsClient + 'static> Executor<C> {
    async fn poll(&self) {
        while let Ok(command) = self.rx.recv().await {
            match command {
                Command::ExecuteQuery(query) => {
                    self.tasks.spawn({
                        let store = Arc::clone(&self.store);

                        execute_query(store, query)
                    });
                }
            }
        }
    }
}

async fn execute_query<C: AsClient>(store: impl AsRef<PostgresStore<C>>, query: ExecuteQuery) {
    let returns = query.tx.clone();
    if let Err(error) = execute_query_impl(store.as_ref(), query).await {
        returns.send(ExecuteQueryResponse::Error(error)).await;
    }
}

async fn execute_query_impl<C: AsClient>(
    store: &PostgresStore<C>,
    ExecuteQuery {
        statement,
        params,
        tx: returns,
    }: ExecuteQuery,
) -> Result<(), tokio_postgres::Error> {
    let client = store.as_client();
    let response = client
        .query_raw(
            &statement,
            params.iter().map(|param| &**param as &(dyn ToSql + Sync)),
        )
        .await?;

    let mut response = pin!(response);
    while let Some(row) = response.next().await {
        let row = row?;
        returns.send(ExecuteQueryResponse::Row(row)).await;
    }

    returns
        .send(ExecuteQueryResponse::Finish { statement, params })
        .await;

    Ok(())
}
