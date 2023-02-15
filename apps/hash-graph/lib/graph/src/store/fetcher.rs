use async_trait::async_trait;
use error_stack::{IntoReport, Result, ResultExt};
use tokio::net::ToSocketAddrs;
#[cfg(feature = "type-fetcher")]
use tokio_serde::formats::MessagePack;
#[cfg(feature = "type-fetcher")]
use type_fetcher::fetcher::FetcherClient;

use crate::{
    identifier::account::AccountId,
    ontology::domain_validator::DomainValidator,
    store::{AccountStore, InsertionError, StoreError, StorePool},
};

pub struct FetchingPool<P, A> {
    pool: P,
    address: A,
    config: tarpc::client::Config,
    domain_validator: DomainValidator,
}

impl<P, A> FetchingPool<P, A>
where
    A: ToSocketAddrs,
{
    pub fn new(pool: P, address: A, domain_validator: DomainValidator) -> Self {
        Self {
            pool,
            address,
            config: tarpc::client::Config::default(),
            domain_validator,
        }
    }
}

impl<P, A> FetchingPool<P, A>
where
    P: StorePool + Send + Sync,
    A: ToSocketAddrs + Send + Sync + Clone,
{
    /// # Errors
    ///
    /// - If the underlying pool fails to acquire a store.
    pub async fn acquire_fetching_store(&self) -> Result<FetchingStore<P::Store<'_>, A>, P::Error> {
        Ok(FetchingStore {
            store: self.pool.acquire().await?,
            address: self.address.clone(),
            config: self.config.clone(),
            domain_validator: self.domain_validator.clone(),
        })
    }
}

#[async_trait]
impl<P, A> StorePool for FetchingPool<P, A>
where
    P: StorePool + Send + Sync,
    A: ToSocketAddrs + Send + Sync + Clone,
{
    type Error = P::Error;
    type Store<'pool> = P::Store<'pool>;

    async fn acquire(&self) -> Result<Self::Store<'_>, Self::Error> {
        self.pool.acquire().await
    }

    async fn acquire_owned(&self) -> Result<Self::Store<'static>, Self::Error> {
        self.pool.acquire_owned().await
    }

    // type Store<'pool> = FetchingStore<P::Store<'pool>, A>;
    //
    // async fn acquire(&self) -> Result<Self::Store<'_>, Self::Error> {
    //     Ok(FetchingStore {
    //         store: self.pool.acquire().await?,
    //         address: self.address.clone(),
    //         config: self.config.clone(),
    //         domain_validator: self.domain_validator.clone(),
    //     })
    // }
    //
    // async fn acquire_owned(&self) -> Result<Self::Store<'static>, Self::Error> {
    //     Ok(FetchingStore {
    //         store: self.pool.acquire_owned().await?,
    //         address: self.address.clone(),
    //         config: self.config.clone(),
    //         domain_validator: self.domain_validator.clone(),
    //     })
    // }
}

#[async_trait]
impl<S, A> AccountStore for FetchingStore<S, A>
where
    S: AccountStore + Send,
    A: Send + Sync,
{
    async fn insert_account_id(&mut self, account_id: AccountId) -> Result<(), InsertionError> {
        self.store.insert_account_id(account_id).await?;
        Ok(())
    }
}

pub struct FetchingStore<S, A> {
    store: S,
    address: A,
    config: tarpc::client::Config,
    #[expect(
        dead_code,
        reason = "This will be used when dynamically using the type fetcher on creation or \
                  updating of a type"
    )]
    domain_validator: DomainValidator,
}

impl<S, A> FetchingStore<S, A>
where
    S: Send + Sync,
    A: ToSocketAddrs + Send + Sync,
{
    pub async fn fetcher_client(&self) -> Result<FetcherClient, StoreError>
    where
        A: ToSocketAddrs,
    {
        let transport = tarpc::serde_transport::tcp::connect(&self.address, MessagePack::default)
            .await
            .into_report()
            .change_context(StoreError)
            .attach_printable("Could not connect to type fetcher")?;
        Ok(FetcherClient::new(self.config.clone(), transport).spawn())
    }

    pub fn store(&mut self) -> &mut S {
        &mut self.store
    }
}
