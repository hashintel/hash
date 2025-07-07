//! # HaRPC Codec
//!
//! ## Workspace dependencies
#![cfg_attr(doc, doc = simple_mermaid::mermaid!("../docs/dependency-diagram.mmd"))]
#![feature(
    // Language Features
    impl_trait_in_assoc_type,
    macro_metavar_expr,

    // Library Features
    error_generic_member_access,
)]

use bytes::Buf;
use futures_core::{Stream, TryStream};

use crate::{decode::Decoder, encode::Encoder};

pub mod decode;
pub mod encode;
pub mod error;
#[cfg(feature = "json")]
pub mod json;

pub trait Codec: Encoder + Decoder {}

impl<T> Codec for T where T: Encoder + Decoder {}

/// A codec that separates encoding and decoding into two separate components.
///
/// This struct allows you to combine any encoder and decoder into a single codec
/// that implements both the `Encoder` and `Decoder` traits. This is useful when
/// you want to use different implementations for encoding and decoding while
/// still using the structure as a unified codec.
///
/// # Type Parameters
///
/// * `E` - The encoder component type
/// * `D` - The decoder component type
pub struct SplitCodec<E, D> {
    pub encoder: E,
    pub decoder: D,
}

impl<E, D> Encoder for SplitCodec<E, D>
where
    E: Encoder,
    D: Decoder,
{
    type Buf = E::Buf;
    type Error = E::Error;
    type Output<Input>
        = E::Output<Input>
    where
        Input: Stream + Send;

    fn encode<T, S>(self, input: S) -> Self::Output<S>
    where
        S: Stream<Item = T> + Send,
        T: serde::Serialize,
    {
        self.encoder.encode(input)
    }
}

impl<E, D> Decoder for SplitCodec<E, D>
where
    E: Encoder,
    D: Decoder,
{
    type Error = D::Error;
    type Output<T, Input>
        = D::Output<T, Input>
    where
        T: serde::de::DeserializeOwned,
        Input: TryStream<Ok: Buf> + Send;

    fn decode<T, S>(self, items: S) -> Self::Output<T, S>
    where
        T: serde::de::DeserializeOwned,
        S: TryStream<Ok: Buf> + Send,
    {
        self.decoder.decode(items)
    }
}
