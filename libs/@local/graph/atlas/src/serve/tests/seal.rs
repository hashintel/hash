//! The sealed-blob battery: round trips, binding refusals, the clock rule, and the spec reference.

use super::*;

/// A fixed set of seal bindings for the blob tests.
///
/// `issued_at` is `1_000_000` seconds; the generation is a synthetic digest, never a published
/// root.
fn seal_bindings() -> crate::serve::seal::SealBindings {
    crate::serve::seal::SealBindings {
        purpose: crate::serve::seal::SealPurpose::Authorization,
        scope: [7; 32],
        generation: "1111111111111111111111111111111111111111111111111111111111111111"
            .parse()
            .expect("the synthetic digest parses"),
        issued_at: core::time::Duration::from_secs(1_000_000),
    }
}

/// Sealing and opening are exact inverses under equal bindings.
///
/// The recovered bitmap is bit-identical, sealing is deterministic under a fixed
/// nonce (restart survival: equal inputs, equal bytes), and the empty bitmap round-trips.
#[test]
fn sealed_blob_round_trips_bit_identical() {
    let bindings = seal_bindings();
    let secret = b"test-secret";
    let nonce = [3; 24];

    let mut bitmap = roaring::RoaringBitmap::new();
    for row in [0, 1, 5, 100_000] {
        bitmap.insert(row);
    }
    let blob = crate::serve::seal::seal(&bitmap, &bindings, secret, &nonce);
    assert_eq!(
        crate::serve::seal::seal(&bitmap, &bindings, secret, &nonce),
        blob,
        "equal inputs seal to equal bytes",
    );

    let opened = crate::serve::seal::open(
        &blob,
        bindings.purpose,
        bindings.scope,
        bindings.generation,
        secret,
        bindings.issued_at + core::time::Duration::from_secs(1),
        ServeLimits::default().seal,
    )
    .expect("the authentic blob opens");
    assert_eq!(opened, bitmap);

    let empty = crate::serve::seal::seal(&roaring::RoaringBitmap::new(), &bindings, secret, &nonce);
    assert_eq!(
        crate::serve::seal::open(
            &empty,
            bindings.purpose,
            bindings.scope,
            bindings.generation,
            secret,
            bindings.issued_at,
            ServeLimits::default().seal,
        )
        .expect("the empty bitmap opens"),
        roaring::RoaringBitmap::new(),
    );
}

/// Every foreign binding refuses, and malformed envelopes never reach the key.
#[test]
fn sealed_blob_refuses_every_foreign_binding() {
    use crate::serve::seal::{SealError, SealPurpose};

    let bindings = seal_bindings();
    let secret = b"test-secret";
    let limits = ServeLimits::default().seal;
    let now = bindings.issued_at + core::time::Duration::from_secs(1);

    let mut bitmap = roaring::RoaringBitmap::new();
    bitmap.insert_range(0..48);
    let blob = crate::serve::seal::seal(&bitmap, &bindings, secret, &nonce_of(9));

    let open = |blob: &[u8], purpose, scope, generation: &str, secret: &[u8], now| {
        crate::serve::seal::open(
            blob,
            purpose,
            scope,
            generation.parse().expect("the digest parses"),
            secret,
            now,
            limits,
        )
    };
    let ours = "1111111111111111111111111111111111111111111111111111111111111111";
    let theirs = "2222222222222222222222222222222222222222222222222222222222222222";

    // Foreign bindings: cross-generation, cross-purpose, cross-scope,
    // wrong secret - authentication failures, never remaps.
    for (case, result) in [
        (
            "cross-generation",
            open(&blob, bindings.purpose, bindings.scope, theirs, secret, now),
        ),
        (
            "cross-purpose",
            open(
                &blob,
                SealPurpose::Filter,
                bindings.scope,
                ours,
                secret,
                now,
            ),
        ),
        (
            "cross-scope",
            open(&blob, bindings.purpose, [8; 32], ours, secret, now),
        ),
        (
            "wrong secret",
            open(&blob, bindings.purpose, bindings.scope, ours, b"other", now),
        ),
    ] {
        assert_eq!(result, Err(SealError::Authentication), "{case}");
    }

    // Tampered bytes: one ciphertext byte, one tag byte, and the
    // clear issue time (bound by the associated data) all refuse.
    for index in [40, blob.len() - 1, 2] {
        let mut tampered = blob.clone();
        tampered[index] ^= 1;
        assert_eq!(
            open(
                &tampered,
                bindings.purpose,
                bindings.scope,
                ours,
                secret,
                now
            ),
            Err(SealError::Authentication),
            "tampering byte {index} refuses",
        );
    }

    // Malformed envelopes: truncation, a foreign format version, and
    // an unknown key id refuse before any cryptography runs.
    for (case, mangled) in [
        ("truncated", blob[..33].to_vec()),
        ("foreign version", {
            let mut foreign = blob.clone();
            foreign[0] = 2;
            foreign
        }),
        ("unknown key id", {
            let mut foreign = blob.clone();
            foreign[1] = 1;
            foreign
        }),
    ] {
        assert_eq!(
            open(
                &mangled,
                bindings.purpose,
                bindings.scope,
                ours,
                secret,
                now
            ),
            Err(SealError::Envelope),
            "{case}",
        );
    }
}

/// The clock rule accepts through the hard cap and refuses beyond it, in both directions.
///
/// Age equal to the cap is the last accepted instant (`now - issued_at ≤ T_hard`); one
/// second past refuses, and a future-dated blob refuses outright.
#[test]
fn sealed_blob_clock_accepts_through_the_hard_cap() {
    use core::time::Duration;

    use crate::serve::seal::SealError;

    let bindings = seal_bindings();
    let secret = b"test-secret";
    let limits = ServeLimits::default().seal;
    let mut bitmap = roaring::RoaringBitmap::new();
    bitmap.insert(1);
    let blob = crate::serve::seal::seal(&bitmap, &bindings, secret, &nonce_of(1));

    let open_at = |now| {
        crate::serve::seal::open(
            &blob,
            bindings.purpose,
            bindings.scope,
            bindings.generation,
            secret,
            now,
            limits,
        )
    };

    assert_eq!(limits.hard, Duration::from_mins(15));
    assert_eq!(limits.soft, Duration::from_mins(10));
    assert!(open_at(bindings.issued_at).is_ok(), "age zero accepts");
    assert!(
        open_at(bindings.issued_at + Duration::from_mins(15)).is_ok(),
        "age at the hard cap accepts",
    );
    assert_eq!(
        open_at(bindings.issued_at + Duration::from_secs(901)),
        Err(SealError::Stale),
        "age past the hard cap refuses",
    );
    assert_eq!(
        open_at(
            bindings
                .issued_at
                .checked_sub(Duration::from_secs(1))
                .expect("the fixture issue time is past the epoch")
        ),
        Err(SealError::Stale),
        "a future-dated blob refuses",
    );
}

/// Padding quantizes serialized-size leakage to a power-of-two bucket.
///
/// Every bitmap in the floor bucket seals to the same 1074 bytes (34-byte header + 1 KiB padded
/// plaintext + 16-byte tag), hiding one row of a larger set moves nothing, and
/// every padded width is a power of two at or above the floor. Bucket transitions remain
/// correlated with cardinality and container layout - the 502/503 boundary below is that
/// correlation made exact - so the certificate is quantization, never length-hiding.
///
/// The sets scatter their rows (step 3) so roaring stores array containers - contiguous ranges
/// collapse to run containers a few bytes wide and would never leave the floor bucket. One
/// scattered container serializes to `16 + 2n` bytes, so with the 4-byte length prefix the floor
/// bucket holds exactly the cardinalities through 502.
#[test]
fn sealed_blob_length_quantizes_to_the_padding_bucket() {
    let bindings = seal_bindings();
    let secret = b"test-secret";

    let scattered = |cardinality: u32| {
        (0..cardinality)
            .map(|index| index * 3)
            .collect::<roaring::RoaringBitmap>()
    };
    let of_cardinality = |cardinality: u32| {
        crate::serve::seal::seal(&scattered(cardinality), &bindings, secret, &nonce_of(5)).len()
    };

    // Cardinalities 0 through the 502 boundary: one floor bucket.
    assert_eq!(of_cardinality(0), 34 + 1024 + 16);
    assert_eq!(of_cardinality(1), 34 + 1024 + 16);
    assert_eq!(of_cardinality(300), 34 + 1024 + 16);
    assert_eq!(of_cardinality(502), 34 + 1024 + 16, "the last floor row");

    // One more row crosses the bucket edge; hiding one row of the
    // larger set moves nothing.
    assert_eq!(of_cardinality(503), 34 + 2048 + 16, "the first row past");
    let mut perturbed = scattered(700);
    assert_eq!(of_cardinality(700), 34 + 2048 + 16);
    perturbed.remove(3 * 17);
    assert_eq!(
        crate::serve::seal::seal(&perturbed, &bindings, secret, &nonce_of(5)).len(),
        34 + 2048 + 16,
    );

    // A thirty-thousand-row scattered bitmap still pads to a power
    // of two.
    let padded = of_cardinality(30_000) - 34 - 16;
    assert!(padded.is_power_of_two() && padded >= 1024);
}

/// Builds a distinct 24-byte nonce for the seal tests.
fn nonce_of(tag: u8) -> [u8; 24] {
    [tag; 24]
}

/// A second expression of the sealed-blob construction.
///
/// Envelope layout, key derivation, the associated-data map, framing, and padding are all
/// expressed a second time from the pinned construction, with the CBOR hand-encoded rather than
/// shared with the production writer. Agreement between this module and [`crate::serve::seal`]
/// freezes the blob format as two implementations, not one; disagreement fails the pin, whichever
/// side drifted.
mod seal_reference {
    use chacha20poly1305::{
        Key, KeyInit as _, XChaCha20Poly1305, XNonce,
        aead::{Aead as _, Payload},
    };
    use hkdf::Hkdf;
    use sha2::Sha256;

    use crate::serve::seal::{SealBindings, SealPurpose};

    /// The envelope's fixed format version.
    const VERSION: u8 = 1;

    /// The envelope's fixed key id.
    const KEY_ID: u8 = 0;

    /// The padding bucket floor in bytes.
    const PAD_FLOOR: usize = 1024;

    /// Derives one purpose key: HKDF-SHA256 salted by the generation digest over the secret.
    fn key(bindings: &SealBindings, secret: &[u8]) -> [u8; 32] {
        let label: &[u8] = match bindings.purpose {
            SealPurpose::Authorization => b"atlas.seal.authz.v0",
            SealPurpose::Filter => b"atlas.seal.filter.v0",
        };
        let mut key = [0_u8; 32];
        Hkdf::<Sha256>::new(Some(&bindings.generation.digest().to_bytes()), secret)
            .expand(label, &mut key)
            .expect("thirty-two bytes is a valid HKDF-SHA256 output length");
        key
    }

    /// Appends one canonical-CBOR unsigned integer: shortest form, big-endian.
    #[expect(
        clippy::big_endian_bytes,
        reason = "canonical CBOR is pinned big-endian"
    )]
    fn cbor_uint(out: &mut Vec<u8>, value: u64) {
        match value {
            0..24 => out.push(u8::try_from(value).expect("the value is below 24")),
            24..=0xFF => {
                out.push(0x18);
                out.push(u8::try_from(value).expect("the value fits one byte"));
            }
            0x100..=0xFFFF => {
                out.push(0x19);
                out.extend_from_slice(&u16::try_from(value).expect("two bytes").to_be_bytes());
            }
            0x1_0000..=0xFFFF_FFFF => {
                out.push(0x1A);
                out.extend_from_slice(&u32::try_from(value).expect("four bytes").to_be_bytes());
            }
            _ => {
                out.push(0x1B);
                out.extend_from_slice(&value.to_be_bytes());
            }
        }
    }

    /// Encodes the associated data: a five-entry map, integer keys ascending, definite lengths.
    fn associated_data(bindings: &SealBindings) -> Vec<u8> {
        let purpose = match bindings.purpose {
            SealPurpose::Authorization => 0_u64,
            SealPurpose::Filter => 1_u64,
        };
        let mut out = vec![0xA5];
        cbor_uint(&mut out, 0);
        cbor_uint(&mut out, purpose);
        cbor_uint(&mut out, 1);
        out.push(0x58);
        out.push(32);
        out.extend_from_slice(&bindings.scope);
        cbor_uint(&mut out, 2);
        out.push(0x58);
        out.push(32);
        out.extend_from_slice(&bindings.generation.digest().to_bytes());
        cbor_uint(&mut out, 3);
        cbor_uint(&mut out, bindings.issued_at.as_secs());
        cbor_uint(&mut out, 4);
        cbor_uint(&mut out, u64::from(VERSION));
        out
    }

    /// Seals an arbitrary plaintext under the bindings - malformed bodies included.
    ///
    /// The production seal cannot produce a malformed plaintext; this path exists so the format
    /// negatives are reachable at all.
    pub(super) fn seal_raw(
        plaintext: &[u8],
        bindings: &SealBindings,
        secret: &[u8],
        nonce: &[u8; 24],
    ) -> Vec<u8> {
        let cipher = XChaCha20Poly1305::new(Key::from_slice(&key(bindings, secret)));
        let sealed = cipher
            .encrypt(
                XNonce::from_slice(nonce),
                Payload {
                    msg: plaintext,
                    aad: &associated_data(bindings),
                },
            )
            .expect("encryption of an in-memory payload succeeds");

        let mut blob = vec![VERSION, KEY_ID];
        blob.extend_from_slice(&bindings.issued_at.as_secs().to_le_bytes());
        blob.extend_from_slice(nonce);
        blob.extend_from_slice(&sealed);
        blob
    }

    /// Seals a bitmap: length-prefixed roaring portable bytes, zero-padded to the bucket.
    pub(super) fn seal(
        bitmap: &roaring::RoaringBitmap,
        bindings: &SealBindings,
        secret: &[u8],
        nonce: &[u8; 24],
    ) -> Vec<u8> {
        seal_raw(&frame(bitmap), bindings, secret, nonce)
    }

    /// Frames a bitmap: `u32 LE` length, portable bytes, zero padding to the power-of-two bucket.
    pub(super) fn frame(bitmap: &roaring::RoaringBitmap) -> Vec<u8> {
        let mut body = Vec::new();
        bitmap
            .serialize_into(&mut body)
            .expect("serializing into a vector cannot fail");
        let mut framed = Vec::from(
            u32::try_from(body.len())
                .expect("the bitmap fits u32")
                .to_le_bytes(),
        );
        framed.extend_from_slice(&body);
        let padded = framed.len().next_power_of_two().max(PAD_FLOOR);
        framed.resize(padded, 0);
        framed
    }

    /// Opens one blob independently: envelope parse, decrypt, strict unframe.
    ///
    /// Panics on any malformation - the reference opens known-good blobs; refusal taxonomy is the
    /// production `open`'s contract, not this module's.
    pub(super) fn open(
        blob: &[u8],
        bindings: &SealBindings,
        secret: &[u8],
    ) -> roaring::RoaringBitmap {
        assert!(blob.len() > 34, "the envelope holds its header and a tag");
        assert_eq!(blob[0], VERSION, "the version leads the envelope");
        assert_eq!(blob[1], KEY_ID, "the key id follows");
        let issued = u64::from_le_bytes(blob[2..10].try_into().expect("eight issued-at bytes"));
        assert_eq!(
            issued,
            bindings.issued_at.as_secs(),
            "issued-at travels in the clear"
        );
        let nonce = &blob[10..34];
        let cipher = XChaCha20Poly1305::new(Key::from_slice(&key(bindings, secret)));
        let plaintext = cipher
            .decrypt(
                XNonce::from_slice(nonce),
                Payload {
                    msg: &blob[34..],
                    aad: &associated_data(bindings),
                },
            )
            .expect("the tag authenticates");
        let length =
            u32::from_le_bytes(plaintext[..4].try_into().expect("four length bytes")) as usize;
        let framed = 4 + length;
        assert!(
            plaintext[framed..].iter().all(|&byte| byte == 0),
            "padding is zero"
        );
        assert_eq!(plaintext.len(), framed.next_power_of_two().max(PAD_FLOOR));
        roaring::RoaringBitmap::deserialize_from(&plaintext[4..framed])
            .expect("the body is portable roaring")
    }
}

/// The production seal and the independent reference agree, byte for byte, both ways.
///
/// Equal inputs give equal blobs across purposes, scopes, generations, issue times, and bitmap
/// shapes - the pinned construction is the format, witnessed by two implementations. The
/// reference also opens the production blobs independently, and the production `open` accepts
/// the reference's: the refusal negatives' positive complement, and the round-trip's
/// bit-identity in a second expression.
#[test]
fn sealed_blob_agrees_with_the_spec_reference() {
    let secret = b"reference-seal-secret";
    let mut scattered = roaring::RoaringBitmap::new();
    for row in 0..600_u32 {
        scattered.insert(row * 97);
    }
    let mut small = roaring::RoaringBitmap::new();
    for row in [3_u32, 44, 1_000_000] {
        small.insert(row);
    }
    let cases: [(
        roaring::RoaringBitmap,
        crate::serve::seal::SealBindings,
        [u8; 24],
    ); 3] = [
        (roaring::RoaringBitmap::new(), seal_bindings(), [1; 24]),
        (
            small,
            {
                let mut bindings = seal_bindings();
                bindings.purpose = crate::serve::seal::SealPurpose::Filter;
                bindings.scope = [9; 32];
                bindings
            },
            [2; 24],
        ),
        (
            scattered,
            {
                let mut bindings = seal_bindings();
                bindings.generation =
                    "2222222222222222222222222222222222222222222222222222222222222222"
                        .parse()
                        .expect("the synthetic digest parses");
                bindings.issued_at = core::time::Duration::from_secs(123_456_789);
                bindings
            },
            [3; 24],
        ),
    ];

    for (bitmap, bindings, nonce) in &cases {
        let production = crate::serve::seal::seal(bitmap, bindings, secret, nonce);
        let reference = seal_reference::seal(bitmap, bindings, secret, nonce);
        assert_eq!(production, reference, "two expressions, one blob");

        assert_eq!(
            &seal_reference::open(&production, bindings, secret),
            bitmap,
            "the reference opens the production blob"
        );
        assert_eq!(
            &crate::serve::seal::open(
                &reference,
                bindings.purpose,
                bindings.scope,
                bindings.generation,
                secret,
                bindings.issued_at,
                crate::serve::seal::SealLimits::default(),
            )
            .expect("the production open accepts the reference blob"),
            bitmap,
        );
    }
}

/// Malformed plaintexts refuse as `Format`, reachable only through the reference.
///
/// The production seal cannot emit them, so the reference seals them by hand: a length prefix
/// claiming more than the body holds, an undecodable roaring body, and nonzero padding. A control
/// case seals a well-formed frame through the same raw path and opens - the negatives fail on
/// format alone, nothing else in the pipeline.
#[test]
fn sealed_blob_refuses_malformed_plaintexts() {
    let secret = b"reference-seal-secret";
    let bindings = seal_bindings();
    let nonce = [4_u8; 24];
    let open = |plaintext: &[u8]| {
        crate::serve::seal::open(
            &seal_reference::seal_raw(plaintext, &bindings, secret, &nonce),
            bindings.purpose,
            bindings.scope,
            bindings.generation,
            secret,
            bindings.issued_at,
            crate::serve::seal::SealLimits::default(),
        )
    };

    // The length prefix claims more than the plaintext holds.
    let mut overclaim = vec![0_u8; 1024];
    overclaim[..4].copy_from_slice(&2000_u32.to_le_bytes());
    assert_eq!(open(&overclaim), Err(crate::serve::seal::SealError::Format));

    // The prefix is honest, the body is not portable roaring.
    let mut garbage = vec![0_u8; 1024];
    garbage[..4].copy_from_slice(&64_u32.to_le_bytes());
    garbage[4..68].fill(0xDE);
    assert_eq!(open(&garbage), Err(crate::serve::seal::SealError::Format));

    // A well-formed frame whose padding carries a nonzero byte.
    let mut unpadded = seal_reference::frame(&roaring::RoaringBitmap::new());
    *unpadded.last_mut().expect("the frame is padded") = 0xFF;
    assert_eq!(open(&unpadded), Err(crate::serve::seal::SealError::Format));

    // Control: the same raw path with a canonical frame opens.
    assert_eq!(
        open(&seal_reference::frame(&roaring::RoaringBitmap::new())),
        Ok(roaring::RoaringBitmap::new()),
    );
}
