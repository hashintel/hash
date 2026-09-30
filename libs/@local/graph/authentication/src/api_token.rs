//! API tokens a user authenticates with on the public Graph API.
//!
//! A token reads `hash_pat_<token-id>_<secret><checksum>`. The token ID is the token's
//! [`ApiTokenId`] as 22 Base62 digits, the secret 43 random Base62 digits, about 256 bits, and the
//! checksum a CRC32 over everything before it as 6 Base62 digits. Base62 digits are `0-9A-Za-z`,
//! and numbers are written most significant digit first. A mistyped token fails the checksum, so
//! it is rejected without a lookup.
//!
//! [`ApiToken`] holds the secret, [`HashedApiToken`] only its SHA-256 hash. Parsing a token yields
//! a [`HashedApiToken`].

use core::{
    fmt::{self, Write as _},
    str::FromStr,
};

use error_stack::{Report, ResultExt as _};
use hash_graph_store::api_token::{ApiTokenId, ApiTokenSecretHash};
use rand::{TryRng as _, rngs::SysRng};
use sha2::{Digest as _, Sha256};
use uuid::{Builder, Uuid};

const PREFIX: &str = "hash_pat_";
const SEPARATOR: char = '_';
const TOKEN_ID_LENGTH: usize = 22;
const SECRET_LENGTH: usize = 43;
const CHECKSUM_LENGTH: usize = 6;
const TOKEN_LENGTH: usize = PREFIX.len() + TOKEN_ID_LENGTH + 1 + SECRET_LENGTH + CHECKSUM_LENGTH;
const SECRET_POOL_LENGTH: usize = 64;
const DISPLAYED_TOKEN_ID_LENGTH: usize = 4;

/// Why a string is not an API token.
#[derive(Debug, Copy, Clone, PartialEq, Eq, derive_more::Display, derive_more::Error)]
pub enum ApiTokenParseError {
    #[display("the API token does not start with `{PREFIX}`")]
    Prefix,
    #[display("the API token does not have {TOKEN_LENGTH} characters")]
    Length,
    #[display("the checksum of the API token does not match")]
    Checksum,
    #[display("the API token is malformed")]
    Encoding,
}

/// Why no API token could be generated.
#[derive(Debug, Copy, Clone, PartialEq, Eq, derive_more::Display, derive_more::Error)]
#[display("the operating system provided no random bytes for the API token")]
pub struct ApiTokenGenerationError;

/// An API token, made of its token ID and its secret.
///
/// Neither the `Debug` nor the `Display` output contains the secret. `Display` shows `hash_pat_`,
/// the first four digits of the token ID and `…`.
#[derive(derive_more::Debug)]
pub struct ApiToken {
    token_id: ApiTokenId,
    // TODO(BE-791): zeroize the secret on drop
    #[debug(skip)]
    secret: [u8; SECRET_LENGTH],
}

impl ApiToken {
    /// Generates a token with a random token ID and secret from the operating system's random
    /// number generator.
    ///
    /// # Errors
    ///
    /// Returns [`ApiTokenGenerationError`] if the operating system provides no random bytes.
    pub fn generate() -> Result<Self, Report<ApiTokenGenerationError>> {
        let mut token_id = [0_u8; 16];
        SysRng
            .try_fill_bytes(&mut token_id)
            .change_context(ApiTokenGenerationError)?;

        let secret = draw_secret(|pool| SysRng.try_fill_bytes(pool))
            .change_context(ApiTokenGenerationError)?;

        Ok(Self {
            token_id: ApiTokenId::new(Builder::from_random_bytes(token_id).into_uuid()),
            secret,
        })
    }

    /// The complete token, secret included.
    // TODO(BE-791): return the token in a type whose `Debug` output leaves out the secret
    #[must_use]
    pub fn expose(&self) -> String {
        let mut token = String::with_capacity(TOKEN_LENGTH);
        token.push_str(PREFIX);
        push_base62::<TOKEN_ID_LENGTH>(&mut token, Uuid::from(self.token_id).as_u128());
        token.push(SEPARATOR);
        token.extend(self.secret.iter().copied().map(char::from));
        let checksum = crc32fast::hash(token.as_bytes());
        push_base62::<CHECKSUM_LENGTH>(&mut token, u128::from(checksum));
        token
    }
}

impl fmt::Display for ApiToken {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt_display(self.token_id, fmt)
    }
}

/// An API token with the SHA-256 hash of its secret in place of the secret.
///
/// Neither the `Debug` nor the `Display` output contains the hash. `Display` shows the token as
/// [`ApiToken`] does.
#[derive(derive_more::Debug, Copy, Clone, PartialEq, Eq)]
pub struct HashedApiToken {
    token_id: ApiTokenId,
    #[debug(skip)]
    secret_hash: ApiTokenSecretHash,
}

impl HashedApiToken {
    #[must_use]
    pub const fn token_id(&self) -> ApiTokenId {
        self.token_id
    }

    #[must_use]
    pub const fn secret_hash(&self) -> ApiTokenSecretHash {
        self.secret_hash
    }
}

impl From<ApiToken> for HashedApiToken {
    fn from(token: ApiToken) -> Self {
        Self {
            token_id: token.token_id,
            secret_hash: hash_secret(&token.secret),
        }
    }
}

impl fmt::Display for HashedApiToken {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt_display(self.token_id, fmt)
    }
}

impl FromStr for HashedApiToken {
    type Err = ApiTokenParseError;

    fn from_str(token: &str) -> Result<Self, Self::Err> {
        let body = token
            .strip_prefix(PREFIX)
            .ok_or(ApiTokenParseError::Prefix)?
            .as_bytes();
        let (token_id, rest) = body
            .split_first_chunk::<TOKEN_ID_LENGTH>()
            .ok_or(ApiTokenParseError::Length)?;
        let (separator, rest) = rest.split_first().ok_or(ApiTokenParseError::Length)?;
        let (secret, checksum) = rest
            .split_first_chunk::<SECRET_LENGTH>()
            .ok_or(ApiTokenParseError::Length)?;
        if checksum.len() != CHECKSUM_LENGTH {
            return Err(ApiTokenParseError::Length);
        }

        let signed = token
            .get(..TOKEN_LENGTH - CHECKSUM_LENGTH)
            .ok_or(ApiTokenParseError::Length)?;
        if parse_base62(checksum) != Some(u128::from(crc32fast::hash(signed.as_bytes()))) {
            return Err(ApiTokenParseError::Checksum);
        }

        if char::from(*separator) != SEPARATOR || !secret.iter().all(u8::is_ascii_alphanumeric) {
            return Err(ApiTokenParseError::Encoding);
        }
        let token_id = parse_base62(token_id).ok_or(ApiTokenParseError::Encoding)?;

        Ok(Self {
            token_id: ApiTokenId::new(Uuid::from_u128(token_id)),
            secret_hash: hash_secret(secret),
        })
    }
}

/// The SHA-256 hash of `secret`.
fn hash_secret(secret: &[u8; SECRET_LENGTH]) -> ApiTokenSecretHash {
    ApiTokenSecretHash::new(Sha256::digest(secret).into())
}

/// Writes the `Display` output of the token with `token_id`: `hash_pat_`, the first
/// [`DISPLAYED_TOKEN_ID_LENGTH`] digits of `token_id` and `…`.
fn fmt_display(token_id: ApiTokenId, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
    let mut digits = String::with_capacity(TOKEN_ID_LENGTH);
    push_base62::<TOKEN_ID_LENGTH>(&mut digits, Uuid::from(token_id).as_u128());
    fmt.write_str(PREFIX)?;
    for digit in digits.chars().take(DISPLAYED_TOKEN_ID_LENGTH) {
        fmt.write_char(digit)?;
    }
    fmt.write_char('\u{2026}')
}

/// Draws a secret of [`SECRET_LENGTH`] Base62 digits from the random bytes `fill` writes.
///
/// A byte stands for the digit of its upper six bits, and for no digit if those are 62 or 63, so
/// every digit is equally likely. The pool is refilled until the secret is complete.
fn draw_secret<E>(
    mut fill: impl FnMut(&mut [u8]) -> Result<(), E>,
) -> Result<[u8; SECRET_LENGTH], E> {
    let mut secret = [0; SECRET_LENGTH];
    let mut filled = 0;
    while filled < SECRET_LENGTH {
        let mut pool = [0; SECRET_POOL_LENGTH];
        fill(&mut pool)?;
        let digits = pool.iter().filter_map(|byte| base62_digit(byte >> 2));
        for (slot, digit) in secret.iter_mut().skip(filled).zip(digits) {
            *slot = digit;
            filled += 1;
        }
    }
    Ok(secret)
}

/// The Base62 digit of `value`, or `None` for a value of 62 or more.
const fn base62_digit(value: u8) -> Option<u8> {
    match value {
        0..=9 => Some(b'0' + value),
        10..=35 => Some(b'A' + (value - 10)),
        36..=61 => Some(b'a' + (value - 36)),
        _ => None,
    }
}

/// The value of the Base62 digit `digit`, or `None` for any other byte.
const fn base62_value(digit: u8) -> Option<u8> {
    match digit {
        b'0'..=b'9' => Some(digit - b'0'),
        b'A'..=b'Z' => Some(digit - b'A' + 10),
        b'a'..=b'z' => Some(digit - b'a' + 36),
        _ => None,
    }
}

/// Appends `value` to `target` as `WIDTH` Base62 digits, the most significant first.
///
/// `value` has to fit in `WIDTH` digits.
#[expect(
    clippy::integer_division_remainder_used,
    reason = "Base62 digits are the remainders of repeated division by 62"
)]
fn push_base62<const WIDTH: usize>(target: &mut String, value: u128) {
    let mut digits = [b'0'; WIDTH];
    let mut remaining = value;
    for digit in digits.iter_mut().rev() {
        *digit = u8::try_from(remaining % 62)
            .ok()
            .and_then(base62_digit)
            .expect("a remainder of the division by 62 should be a Base62 digit");
        remaining /= 62;
    }
    debug_assert_eq!(remaining, 0, "the value should fit in {WIDTH} digits");
    target.extend(digits.iter().copied().map(char::from));
}

/// The value of the Base62 digits `digits`, or `None` if they are not Base62 or overflow.
fn parse_base62(digits: &[u8]) -> Option<u128> {
    digits.iter().try_fold(0_u128, |value, &digit| {
        value
            .checked_mul(62)?
            .checked_add(u128::from(base62_value(digit)?))
    })
}

#[cfg(test)]
mod tests {
    use core::convert::Infallible;

    use hash_graph_store::api_token::{ApiTokenId, ApiTokenSecretHash};
    use uuid::Uuid;

    use super::{
        ApiToken, ApiTokenParseError, CHECKSUM_LENGTH, HashedApiToken, PREFIX, SECRET_LENGTH,
        SECRET_POOL_LENGTH, TOKEN_ID_LENGTH, draw_secret, parse_base62, push_base62,
    };

    const FIXED_TOKEN_ID: u128 = 0x01234567_89AB_CDEF_0123_456789ABCDEF;

    /// A token with a fixed token ID and secret.
    fn fixed_token() -> ApiToken {
        ApiToken {
            token_id: ApiTokenId::new(Uuid::from_u128(FIXED_TOKEN_ID)),
            secret: *b"0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefg",
        }
    }

    /// Appends the checksum of `body` to it, as a well-formed token would carry.
    fn with_checksum(body: &str) -> String {
        let mut token = body.to_owned();
        push_base62::<CHECKSUM_LENGTH>(&mut token, u128::from(crc32fast::hash(body.as_bytes())));
        token
    }

    #[test]
    fn expose_fixed_token() {
        assert_eq!(
            fixed_token().expose(),
            "hash_pat_0296tiiBb3U904RIpygpjj_0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefg1zRvs6",
            "the token should carry its token ID, its secret and the checksum"
        );
    }

    #[test]
    fn hash_fixed_token() {
        let hashed = HashedApiToken::from(fixed_token());

        assert_eq!(
            hashed.token_id(),
            ApiTokenId::new(Uuid::from_u128(FIXED_TOKEN_ID)),
            "the hashed token should keep the token ID"
        );
        assert_eq!(
            hashed.secret_hash(),
            ApiTokenSecretHash::new([
                0x71, 0xD8, 0x4B, 0x18, 0x59, 0xBA, 0xD1, 0x1A, 0xBC, 0xB3, 0xDF, 0xD9, 0x35, 0x3C,
                0x8D, 0x18, 0x73, 0xAA, 0xFD, 0x88, 0x3F, 0xFA, 0xF6, 0xF2, 0xC9, 0xDF, 0x7C, 0xBC,
                0xFC, 0x3E, 0x18, 0x50,
            ]),
            "the hash should be the SHA-256 of the secret"
        );
    }

    #[test]
    fn display_fixed_token() {
        assert_eq!(
            fixed_token().to_string(),
            "hash_pat_0296\u{2026}",
            "the token should show only the start of its token ID"
        );
        assert_eq!(
            HashedApiToken::from(fixed_token()).to_string(),
            "hash_pat_0296\u{2026}",
            "the hashed token should show only the start of its token ID"
        );
    }

    #[test]
    fn debug_redacts_secret() {
        assert_eq!(
            format!("{:?}", fixed_token()),
            format!(
                "ApiToken {{ token_id: {:?}, .. }}",
                ApiTokenId::new(Uuid::from_u128(FIXED_TOKEN_ID))
            ),
            "the debug output should show the token ID and nothing else"
        );
    }

    #[test]
    fn debug_redacts_secret_hash() {
        assert_eq!(
            format!("{:?}", HashedApiToken::from(fixed_token())),
            format!(
                "HashedApiToken {{ token_id: {:?}, .. }}",
                ApiTokenId::new(Uuid::from_u128(FIXED_TOKEN_ID))
            ),
            "the debug output should show the token ID and nothing else"
        );
    }

    #[test]
    fn parse_exposed() {
        let token = ApiToken::generate().expect("the operating system should provide random bytes");
        let exposed = token.expose();
        let hashed = HashedApiToken::from(token);

        assert_eq!(
            exposed
                .parse::<HashedApiToken>()
                .expect("the token should parse"),
            hashed,
            "the parsed token should be the hashed token"
        );
    }

    #[test]
    fn base62_extremes() {
        for value in [0, u128::MAX] {
            let mut encoded = String::new();
            push_base62::<TOKEN_ID_LENGTH>(&mut encoded, value);

            assert_eq!(
                parse_base62(encoded.as_bytes()),
                Some(value),
                "{value} should decode to itself"
            );
        }
    }

    #[test]
    fn draw_secret_skips_non_digits() {
        // The upper six bits of 0xF8 and 0xFC are 62 and 63, which stand for no digit. Those of
        // 0xF4, 0x03 and 0x28 are 61, 0 and 10, the digits `z`, `0` and `A`.
        let mut bytes = [0x28; SECRET_POOL_LENGTH];
        bytes[..4].copy_from_slice(&[0xF8, 0xF4, 0xFC, 0x03]);

        let secret = draw_secret(|pool| {
            pool.copy_from_slice(&bytes);
            Ok::<_, Infallible>(())
        })
        .expect("filling the pool should not fail");

        assert_eq!(
            secret.as_slice(),
            format!("z0{}", "A".repeat(SECRET_LENGTH - 2)).as_bytes(),
            "the secret should skip the bytes that stand for no digit"
        );
    }

    #[test]
    fn draw_secret_short_pool() {
        // The first pool holds only two digits: 0x03 is `0`, and 0xFC stands for no digit. The
        // second pool, all 0x28, completes the secret with `A`.
        let mut first = [0xFC; SECRET_POOL_LENGTH];
        first[..2].fill(0x03);
        let mut pools = [first, [0x28; SECRET_POOL_LENGTH]].into_iter();

        let secret = draw_secret(|pool| {
            pool.copy_from_slice(&pools.next().expect("the secret should need two pools"));
            Ok::<_, Infallible>(())
        })
        .expect("filling the pool should not fail");

        assert_eq!(
            secret.as_slice(),
            format!("00{}", "A".repeat(SECRET_LENGTH - 2)).as_bytes(),
            "the secret should continue in the next pool"
        );
    }

    #[test]
    fn draw_secret_failing_fill() {
        assert_eq!(
            draw_secret(|_| Err("the byte source failed")),
            Err("the byte source failed"),
            "the error of the byte source should end the draw"
        );
    }

    #[test]
    fn parse_checksum_mismatch() {
        let mut token = fixed_token().expose().into_bytes();
        let secret_start = PREFIX.len() + TOKEN_ID_LENGTH + 1;
        token[secret_start] = if token[secret_start] == b'a' {
            b'b'
        } else {
            b'a'
        };
        let token = String::from_utf8(token).expect("the token should stay ASCII");

        assert_eq!(
            token
                .parse::<HashedApiToken>()
                .expect_err("a changed secret should not parse"),
            ApiTokenParseError::Checksum,
            "a changed secret should fail the checksum"
        );
    }

    #[test]
    fn parse_wrong_prefix() {
        let token = fixed_token().expose().replacen("pat", "sat", 1);

        assert_eq!(
            token
                .parse::<HashedApiToken>()
                .expect_err("a foreign prefix should not parse"),
            ApiTokenParseError::Prefix,
            "a foreign prefix should be reported as the wrong prefix"
        );
    }

    #[test]
    fn parse_wrong_length() {
        let mut token = fixed_token().expose();
        token.pop();

        assert_eq!(
            token
                .parse::<HashedApiToken>()
                .expect_err("a truncated token should not parse"),
            ApiTokenParseError::Length,
            "a truncated token should be reported as the wrong length"
        );
    }

    #[test]
    fn parse_token_id_overflow() {
        let body = format!(
            "{PREFIX}{}_{}",
            "z".repeat(TOKEN_ID_LENGTH),
            "a".repeat(SECRET_LENGTH)
        );

        assert_eq!(
            with_checksum(&body)
                .parse::<HashedApiToken>()
                .expect_err("a token ID beyond 128 bits should not parse"),
            ApiTokenParseError::Encoding,
            "a token ID beyond 128 bits should be reported as malformed"
        );
    }
}
