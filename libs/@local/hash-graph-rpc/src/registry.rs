use core::slice::SlicePattern;
use std::future::Future;

use bincode::Decode;
use bytes::Bytes;
use tarpc::{context::Context, server::Serve, Transport};

pub struct RegistryServe<T> {
    services: T,
}

struct Header {
    service: usize,
}

struct RegistryRequest {
    header: Header,
    body: Bytes,
}

struct RegistryResponse {
    header: Header,
    body: Bytes,
}

impl<T> Serve<RegistryRequest> for RegistryServe<T>
where
    T: RegistryServer,
{
    type Resp = RegistryResponse;

    type Fut = impl Future<Output = RegistryResponse>;

    fn method(&self, request: &RegistryRequest) -> Option<&'static str> {
        self.services.method(request.header.service, &request.body)
    }

    fn serve(self, ctx: Context, req: RegistryRequest) -> Self::Fut {
        self.services.serve(ctx, req.header.service, req.body)
    }
}

trait RegistryServer {
    type Requests;

    fn method(&self, offset: usize, body: &Bytes) -> Option<&'static str>;

    fn serve(
        self,
        ctx: Context,
        offset: usize,
        body: Bytes,
    ) -> impl Future<Output = RegistryResponse>;
}

impl<T1, R1> RegistryServer for (T1,)
where
    T1: Serve<R1>,
    R1: Decode,
{
    type Requests = (R1,);

    fn method(&self, offset: usize, body: &Bytes) -> Option<&'static str> {
        if offset != 0 {
            return None;
        }

        let (body, _) =
            bincode::decode_from_slice(body.as_slice(), bincode::config::Configuration::default())
                .ok()?;

        self.0.method(&body)
    }

    async fn serve(self, ctx: Context, offset: usize, body: Bytes) -> RegistryResponse {
        if offset != 0 {
            return unimplemented!("invalid offset");
        }

        let (body, _) =
            bincode::decode_from_slice(body.as_slice(), bincode::config::Configuration::default())
                .expect("unimplemented");

        self.0.serve(ctx, body).await
    }
}

impl<T1, R1, T2, R2> RegistryServer for (T1, T2)
where
    T1: Serve<R1>,
    R1: Decode,
    T2: Serve<R2>,
    R2: Decode,
{
    type Requests = (R1, R2);

    fn method(&self, offset: usize, body: &Bytes) -> Option<&'static str> {
        match offset {
            0 => {
                let (body, _) = bincode::decode_from_slice(
                    body.as_slice(),
                    bincode::config::Configuration::default(),
                )
                .ok()?;

                self.0.method(&body)
            }
            1 => {
                let (body, _) = bincode::decode_from_slice(
                    body.as_slice(),
                    bincode::config::Configuration::default(),
                )
                .ok()?;

                self.1.method(&body)
            }
            _ => None,
        }
    }

    async fn serve(self, ctx: Context, offset: usize, body: Bytes) -> RegistryResponse {
        match offset {
            0 => {
                let (body, _) = bincode::decode_from_slice(
                    body.as_slice(),
                    bincode::config::Configuration::default(),
                )
                .expect("unimplemented");

                self.0.serve(ctx, body).await
            }
            1 => {
                let (body, _) = bincode::decode_from_slice(
                    body.as_slice(),
                    bincode::config::Configuration::default(),
                )
                .expect("unimplemented");

                self.1.serve(ctx, body).await
            }
            _ => unimplemented!("invalid offset"),
        }
    }
}
