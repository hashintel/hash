//! API tokens a user authenticates with on the public Graph API.
//!
//! A token reads `hsh_<type>_<environment>_<token-id>_<secret><checksum>`:
//!
//! - The type is the three letters of an [`ApiTokenType`].
//! - The environment is the two letters of an [`Environment`].
//! - The token ID is the token's [`ApiTokenId`] as 22 Base62 digits, with the [`ApiTokenVersion`]
//!   in its first digit.
//! - The secret is 43 random Base62 digits, about 256 bits.
//! - The checksum is a CRC32 over everything before it as 6 Base62 digits. A mistyped token fails
//!   the checksum, so it is rejected without a lookup.
//!
//! [`ApiToken`] holds the secret, [`HashedApiToken`] only its SHA-256 hash. Parsing a token yields
//! a [`HashedApiToken`]. An [`ApiTokenEncryptionKey`] encrypts that hash for a store, bound to the
//! [`AssociatedData`] of the token and its row.
#![expect(clippy::empty_enums, reason = "zerocopy uses them in the derive")]

mod encryption;

use core::{
    fmt::{self, Write as _},
    str::FromStr,
};

use aws_lc_rs::error::Unspecified;
use error_stack::Report;
use hash_graph_store::api_token::{ApiTokenId, ApiTokenSecretHash, ApiTokenType, ApiTokenVersion};
use sha2::{Digest as _, Sha256};
use type_system::principal::{actor::ActorEntityUuid, actor_group::WebId};
use uuid::Uuid;
use zerocopy::{Immutable, IntoBytes, KnownLayout, TryFromBytes};

pub use self::encryption::{ApiTokenDecryptionError, ApiTokenEncryptionKey, AssociatedData};

const PREFIX: &str = "hsh_";
const PREFIX_BYTES: [u8; PREFIX.len()] = match PREFIX.as_bytes().first_chunk() {
    Some(prefix) => *prefix,
    None => unreachable!(),
};
const SEPARATOR: char = '_';
const TYPE_LENGTH: usize = 3;
const ENVIRONMENT_LENGTH: usize = 2;
const TOKEN_ID_LENGTH: usize = 22;
const SECRET_LENGTH: usize = 43;
const CHECKSUM_LENGTH: usize = 6;
const TOKEN_LENGTH: usize = size_of::<TokenLayout>();
const SECRET_POOL_LENGTH: usize = 64;
const DISPLAYED_TOKEN_ID_LENGTH: usize = 4;

/// The first token-ID digit in a token holds the leading digit of the token ID in its lowest three
/// bits and the version above them.
const VERSION_SHIFT: u8 = 3;
const LEADING_DIGIT_MASK: u8 = 0b111;

/// The bytes of a token, part by part.
///
/// Viewing a token's bytes as this layout checks its size and its separators. Parsing checks the
/// prefix and the checksum on the bytes before, so that their errors come first.
#[derive(TryFromBytes, IntoBytes, KnownLayout, Immutable)]
#[repr(C)]
struct TokenLayout {
    prefix: [u8; PREFIX.len()],
    token_type: [u8; TYPE_LENGTH],
    type_separator: Separator,
    environment: [u8; ENVIRONMENT_LENGTH],
    environment_separator: Separator,
    token_id: [u8; TOKEN_ID_LENGTH],
    token_id_separator: Separator,
    secret: [u8; SECRET_LENGTH],
    checksum: [u8; CHECKSUM_LENGTH],
}

#[derive(TryFromBytes, IntoBytes, KnownLayout, Immutable)]
#[repr(u8)]
enum Separator {
    Underscore = SEPARATOR as u8,
}

/// The environment an API token belongs to.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum Environment {
    /// The production environment.
    Production,
    /// The staging environment.
    Staging,
    /// A deployment on a developer's machine or in CI.
    Local,
}

impl Environment {
    const fn code(self) -> &'static [u8; ENVIRONMENT_LENGTH] {
        match self {
            Self::Production => b"pd",
            Self::Staging => b"sg",
            Self::Local => b"lc",
        }
    }

    const fn from_code(code: [u8; ENVIRONMENT_LENGTH]) -> Option<Self> {
        match &code {
            b"pd" => Some(Self::Production),
            b"sg" => Some(Self::Staging),
            b"lc" => Some(Self::Local),
            _ => None,
        }
    }
}

/// Why a string is not an API token.
#[derive(Debug, derive_more::Display, derive_more::Error)]
pub enum ApiTokenParseError {
    #[display("the API token does not start with `{PREFIX}`")]
    Prefix,
    #[display("the API token does not have {TOKEN_LENGTH} characters")]
    Length,
    #[display("the checksum of the API token does not match")]
    Checksum,
    #[display("the API token is malformed")]
    Encoding,
    #[display("the API token has an unknown type")]
    Type,
    #[display("the API token has an unknown environment")]
    Environment,
    #[display("the API token has an unknown version")]
    Version,
}

/// Why no API token could be generated.
#[derive(Debug, derive_more::Display, derive_more::Error)]
#[display("the random number generator provided no bytes for the API token")]
pub struct ApiTokenGenerationError;

/// An API token, made of its type, environment, version, token ID and secret.
///
/// `Display` shows the token up to the first four digits of the token ID and `…`, such as
/// `hsh_pat_pd_0296…`.
#[derive(derive_more::Debug)]
pub struct ApiToken {
    token_type: ApiTokenType,
    environment: Environment,
    version: ApiTokenVersion,
    token_id: ApiTokenId,
    // TODO(BE-791): zeroize the secret on drop
    #[debug(skip)]
    secret: [u8; SECRET_LENGTH],
}

impl ApiToken {
    /// Generates a token of `token_type` for `environment`, with a random token ID and secret from
    /// AWS-LC's random number generator.
    ///
    /// # Errors
    ///
    /// Returns [`ApiTokenGenerationError`] if the random number generator fails.
    pub fn generate(
        token_type: ApiTokenType,
        environment: Environment,
    ) -> Result<Self, Report<ApiTokenGenerationError>> {
        let mut token_id = [0_u8; 16];
        fill_random(&mut token_id)?;

        Ok(Self {
            token_type,
            environment,
            version: ApiTokenVersion::V0,
            token_id: ApiTokenId::new(uuid::Builder::from_random_bytes(token_id).into_uuid()),
            secret: draw_secret(fill_random)?,
        })
    }

    /// The complete token, secret included.
    // TODO(BE-791): return the token in a type whose `Debug` output leaves out the secret
    #[must_use]
    pub fn expose(&self) -> String {
        let mut token = TokenLayout {
            prefix: PREFIX_BYTES,
            token_type: *self.token_type.code(),
            type_separator: Separator::Underscore,
            environment: *self.environment.code(),
            environment_separator: Separator::Underscore,
            token_id: encode_token_id(self.version, self.token_id),
            token_id_separator: Separator::Underscore,
            secret: self.secret,
            checksum: [0; CHECKSUM_LENGTH],
        };
        let (signed, _) = token.as_bytes().split_at(TOKEN_LENGTH - CHECKSUM_LENGTH);
        token.checksum = encode_base62(u128::from(crc32fast::hash(signed)));
        token.as_bytes().iter().copied().map(char::from).collect()
    }
}

impl fmt::Display for ApiToken {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt_display(
            self.token_type,
            self.environment,
            self.version,
            self.token_id,
            fmt,
        )
    }
}

/// An API token with the SHA-256 hash of its secret in place of the secret.
///
/// `Display` shows the token as [`ApiToken`] does.
#[derive(derive_more::Debug)]
pub struct HashedApiToken {
    token_type: ApiTokenType,
    environment: Environment,
    version: ApiTokenVersion,
    token_id: ApiTokenId,
    #[debug(skip)]
    secret_hash: ApiTokenSecretHash,
}

impl HashedApiToken {
    #[must_use]
    pub const fn token_type(&self) -> ApiTokenType {
        self.token_type
    }

    #[must_use]
    pub const fn environment(&self) -> Environment {
        self.environment
    }

    #[must_use]
    pub const fn version(&self) -> ApiTokenVersion {
        self.version
    }

    #[must_use]
    pub const fn token_id(&self) -> ApiTokenId {
        self.token_id
    }

    #[must_use]
    pub const fn secret_hash(&self) -> ApiTokenSecretHash {
        self.secret_hash
    }

    /// The associated data that binds the secret hash of this token to the row of `actor_id` and
    /// `web_id`.
    #[must_use]
    pub const fn associated_data(
        &self,
        actor_id: ActorEntityUuid,
        web_id: WebId,
    ) -> AssociatedData {
        AssociatedData {
            token_type: self.token_type,
            environment: self.environment,
            version: self.version,
            token_id: self.token_id,
            actor_id,
            web_id,
        }
    }
}

impl From<ApiToken> for HashedApiToken {
    fn from(token: ApiToken) -> Self {
        Self {
            token_type: token.token_type,
            environment: token.environment,
            version: token.version,
            token_id: token.token_id,
            secret_hash: hash_secret(&token.secret),
        }
    }
}

impl fmt::Display for HashedApiToken {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt_display(
            self.token_type,
            self.environment,
            self.version,
            self.token_id,
            fmt,
        )
    }
}

impl FromStr for HashedApiToken {
    type Err = ApiTokenParseError;

    fn from_str(token: &str) -> Result<Self, Self::Err> {
        if !token.starts_with(PREFIX) {
            return Err(ApiTokenParseError::Prefix);
        }
        if token.len() != TOKEN_LENGTH {
            return Err(ApiTokenParseError::Length);
        }
        if !token.is_ascii() {
            return Err(ApiTokenParseError::Encoding);
        }

        let (signed, checksum) = token.as_bytes().split_at(TOKEN_LENGTH - CHECKSUM_LENGTH);
        if checksum != encode_base62::<CHECKSUM_LENGTH>(u128::from(crc32fast::hash(signed))) {
            return Err(ApiTokenParseError::Checksum);
        }

        let token = TokenLayout::try_ref_from_bytes(token.as_bytes())
            .map_err(|_error| ApiTokenParseError::Encoding)?;
        let token_type =
            ApiTokenType::from_code(token.token_type).ok_or(ApiTokenParseError::Type)?;
        let environment =
            Environment::from_code(token.environment).ok_or(ApiTokenParseError::Environment)?;
        let (version, token_id) = decode_token_id(&token.token_id)?;

        if !token.secret.iter().all(u8::is_ascii_alphanumeric) {
            return Err(ApiTokenParseError::Encoding);
        }

        Ok(Self {
            token_type,
            environment,
            version,
            token_id,
            secret_hash: hash_secret(&token.secret),
        })
    }
}

/// The SHA-256 hash of `secret`.
fn hash_secret(secret: &[u8; SECRET_LENGTH]) -> ApiTokenSecretHash {
    ApiTokenSecretHash::new(Sha256::digest(secret).into())
}

/// Writes the `Display` output of a token: the token up to the first
/// [`DISPLAYED_TOKEN_ID_LENGTH`] digits of the token ID, and `…`.
fn fmt_display(
    token_type: ApiTokenType,
    environment: Environment,
    version: ApiTokenVersion,
    token_id: ApiTokenId,
    fmt: &mut fmt::Formatter<'_>,
) -> fmt::Result {
    fmt.write_str(PREFIX)?;
    write_ascii(fmt, token_type.code())?;
    fmt.write_char(SEPARATOR)?;
    write_ascii(fmt, environment.code())?;
    fmt.write_char(SEPARATOR)?;
    write_ascii(
        fmt,
        encode_token_id(version, token_id)
            .iter()
            .take(DISPLAYED_TOKEN_ID_LENGTH),
    )?;
    fmt.write_char('\u{2026}')
}

/// Writes the ASCII bytes `bytes` as characters.
fn write_ascii<'bytes>(
    fmt: &mut fmt::Formatter<'_>,
    bytes: impl IntoIterator<Item = &'bytes u8>,
) -> fmt::Result {
    bytes
        .into_iter()
        .try_for_each(|&byte| fmt.write_char(char::from(byte)))
}

/// The digits of `token_id` in a token of `version`: `token_id` as Base62 digits, with the version
/// in the first digit as [`VERSION_SHIFT`] describes.
fn encode_token_id(version: ApiTokenVersion, token_id: ApiTokenId) -> [u8; TOKEN_ID_LENGTH] {
    let mut digits = encode_base62::<TOKEN_ID_LENGTH>(Uuid::from(token_id).as_u128());
    let [first, ..] = &mut digits;
    *first = base62_value(*first)
        .and_then(|leading| base62_digit((version.number() << VERSION_SHIFT) | leading))
        .expect("the version should fit in the first digit");
    digits
}

/// The version and the token ID of the token-ID digits `digits` of a token.
///
/// Fails with [`ApiTokenParseError::Version`] for an unknown version, and with
/// [`ApiTokenParseError::Encoding`] if `digits` are not the Base62 digits of a 128-bit number.
fn decode_token_id(
    digits: &[u8; TOKEN_ID_LENGTH],
) -> Result<(ApiTokenVersion, ApiTokenId), ApiTokenParseError> {
    let [first, rest @ ..] = digits;
    let first = base62_value(*first).ok_or(ApiTokenParseError::Encoding)?;
    let version =
        ApiTokenVersion::from_number(first >> VERSION_SHIFT).ok_or(ApiTokenParseError::Version)?;
    let token_id = rest
        .iter()
        .try_fold(u128::from(first & LEADING_DIGIT_MASK), |value, &digit| {
            value
                .checked_mul(62)?
                .checked_add(u128::from(base62_value(digit)?))
        })
        .ok_or(ApiTokenParseError::Encoding)?;

    Ok((version, ApiTokenId::new(Uuid::from_u128(token_id))))
}

/// Fills `bytes` from AWS-LC's random number generator.
fn fill_random(bytes: &mut [u8]) -> Result<(), Report<ApiTokenGenerationError>> {
    match aws_lc_rs::rand::fill(bytes) {
        Ok(()) => Ok(()),
        Err(Unspecified) => Err(Report::new(ApiTokenGenerationError)),
    }
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

/// `value` as `WIDTH` Base62 digits, the most significant first.
///
/// `value` has to fit in `WIDTH` digits.
#[expect(
    clippy::integer_division_remainder_used,
    reason = "Base62 digits are the remainders of repeated division by 62"
)]
fn encode_base62<const WIDTH: usize>(value: u128) -> [u8; WIDTH] {
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
    digits
}

#[cfg(test)]
mod tests {
    use core::{assert_matches, convert::Infallible};

    use hash_graph_store::api_token::{ApiTokenId, ApiTokenSecretHash};
    use rstest::rstest;
    use uuid::Uuid;

    use super::{
        ApiToken, ApiTokenParseError, ApiTokenType, ApiTokenVersion, CHECKSUM_LENGTH, Environment,
        HashedApiToken, PREFIX, SECRET_LENGTH, SECRET_POOL_LENGTH, TOKEN_ID_LENGTH, TOKEN_LENGTH,
        decode_token_id, draw_secret, encode_base62, encode_token_id,
    };

    const FIXED_TOKEN_ID: u128 = 0x01234567_89AB_CDEF_0123_456789ABCDEF;

    /// A token with a fixed token ID and secret.
    fn fixed_token() -> ApiToken {
        ApiToken {
            token_type: ApiTokenType::User,
            environment: Environment::Production,
            version: ApiTokenVersion::V0,
            token_id: ApiTokenId::new(Uuid::from_u128(FIXED_TOKEN_ID)),
            secret: *b"0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefg",
        }
    }

    /// The fields of `token`.
    fn fields(
        token: &HashedApiToken,
    ) -> (
        ApiTokenType,
        Environment,
        ApiTokenVersion,
        ApiTokenId,
        ApiTokenSecretHash,
    ) {
        (
            token.token_type(),
            token.environment(),
            token.version(),
            token.token_id(),
            token.secret_hash(),
        )
    }

    /// Appends the checksum of `body` to it, as a well-formed token would carry.
    fn with_checksum(body: &str) -> String {
        let mut token = body.to_owned();
        token.extend(
            encode_base62::<CHECKSUM_LENGTH>(u128::from(crc32fast::hash(body.as_bytes())))
                .map(char::from),
        );
        token
    }

    /// A token of the given parts with a matching checksum.
    fn token_of_parts(token_type: &str, environment: &str, token_id: &str, secret: &str) -> String {
        with_checksum(&format!(
            "{PREFIX}{token_type}_{environment}_{token_id}_{secret}"
        ))
    }

    #[test]
    fn expose_fixed_token() {
        assert_eq!(
            fixed_token().expose(),
            "hsh_pat_pd_0296tiiBb3U904RIpygpjj_0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefg39B9Yp",
            "the token should carry its type, environment, token ID, secret and the checksum"
        );
    }

    #[test]
    fn hash_fixed_token() {
        let hashed = HashedApiToken::from(fixed_token());

        assert_eq!(
            (
                hashed.token_type(),
                hashed.environment(),
                hashed.version(),
                hashed.token_id()
            ),
            (
                ApiTokenType::User,
                Environment::Production,
                ApiTokenVersion::V0,
                ApiTokenId::new(Uuid::from_u128(FIXED_TOKEN_ID))
            ),
            "the hashed token should keep the type, environment, version and token ID"
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
            "hsh_pat_pd_0296\u{2026}",
            "the token should show only the start of its token ID"
        );
        assert_eq!(
            HashedApiToken::from(fixed_token()).to_string(),
            "hsh_pat_pd_0296\u{2026}",
            "the hashed token should show only the start of its token ID"
        );
    }

    #[test]
    fn debug_redacts_secret() {
        assert_eq!(
            format!("{:?}", fixed_token()),
            format!(
                "ApiToken {{ token_type: User, environment: Production, version: V0, token_id: \
                 {:?}, .. }}",
                ApiTokenId::new(Uuid::from_u128(FIXED_TOKEN_ID))
            ),
            "the debug output should show everything but the secret"
        );
    }

    #[test]
    fn debug_redacts_secret_hash() {
        assert_eq!(
            format!("{:?}", HashedApiToken::from(fixed_token())),
            format!(
                "HashedApiToken {{ token_type: User, environment: Production, version: V0, \
                 token_id: {:?}, .. }}",
                ApiTokenId::new(Uuid::from_u128(FIXED_TOKEN_ID))
            ),
            "the debug output should show everything but the secret hash"
        );
    }

    #[rstest]
    #[case::production(Environment::Production)]
    #[case::staging(Environment::Staging)]
    #[case::local(Environment::Local)]
    fn parse_exposed(#[case] environment: Environment) {
        let token = ApiToken::generate(ApiTokenType::User, environment)
            .expect("the random number generator should provide bytes");
        let exposed = token.expose();
        let hashed = HashedApiToken::from(token);
        let parsed = exposed
            .parse::<HashedApiToken>()
            .expect("the token should parse");

        assert_eq!(
            fields(&parsed),
            fields(&hashed),
            "the parsed token should be the hashed token"
        );
    }

    #[test]
    fn token_id_extremes() {
        for value in [0, u128::MAX] {
            let token_id = ApiTokenId::new(Uuid::from_u128(value));

            assert_matches!(
                decode_token_id(&encode_token_id(ApiTokenVersion::V0, token_id)),
                Ok((ApiTokenVersion::V0, id)) if token_id == id,
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
        let last_secret_digit = TOKEN_LENGTH - CHECKSUM_LENGTH - 1;
        token[last_secret_digit] = if token[last_secret_digit] == b'a' {
            b'b'
        } else {
            b'a'
        };
        let token = String::from_utf8(token).expect("the token should stay ASCII");

        assert_matches!(
            token
                .parse::<HashedApiToken>()
                .expect_err("a changed secret should not parse"),
            ApiTokenParseError::Checksum,
            "a changed secret should fail the checksum"
        );
    }

    #[test]
    fn parse_wrong_prefix() {
        let token = fixed_token().expose().replacen("hsh", "hsx", 1);

        assert_matches!(
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

        assert_matches!(
            token
                .parse::<HashedApiToken>()
                .expect_err("a truncated token should not parse"),
            ApiTokenParseError::Length,
            "a truncated token should be reported as the wrong length"
        );
    }

    #[test]
    fn parse_non_ascii() {
        // `é` takes two bytes, so the token keeps its length in bytes.
        let token = fixed_token().expose().replacen("abcdefg", "abcde\u{e9}", 1);

        assert_matches!(
            token
                .parse::<HashedApiToken>()
                .expect_err("a non-ASCII token should not parse"),
            ApiTokenParseError::Encoding,
            "a non-ASCII token should be reported as malformed"
        );
    }

    #[test]
    fn parse_missing_separator() {
        let token = with_checksum(&format!(
            "{PREFIX}pat_pd_{}0{}",
            "0".repeat(TOKEN_ID_LENGTH),
            "a".repeat(SECRET_LENGTH)
        ));

        assert_matches!(
            token
                .parse::<HashedApiToken>()
                .expect_err("a token without a separator should not parse"),
            ApiTokenParseError::Encoding,
            "a missing separator should be reported as malformed"
        );
    }

    #[test]
    fn parse_unknown_type() {
        let token = token_of_parts(
            "sat",
            "pd",
            &"0".repeat(TOKEN_ID_LENGTH),
            &"a".repeat(SECRET_LENGTH),
        );

        assert_matches!(
            token
                .parse::<HashedApiToken>()
                .expect_err("an unknown type should not parse"),
            ApiTokenParseError::Type,
            "an unknown type should be reported as such"
        );
    }

    #[test]
    fn parse_unknown_environment() {
        let token = token_of_parts(
            "pat",
            "xx",
            &"0".repeat(TOKEN_ID_LENGTH),
            &"a".repeat(SECRET_LENGTH),
        );

        assert_matches!(
            token
                .parse::<HashedApiToken>()
                .expect_err("an unknown environment should not parse"),
            ApiTokenParseError::Environment,
            "an unknown environment should be reported as such"
        );
    }

    #[test]
    fn parse_unknown_version() {
        // `8` is the smallest first digit that holds a version other than 0.
        let token = token_of_parts(
            "pat",
            "pd",
            &format!("8{}", "0".repeat(TOKEN_ID_LENGTH - 1)),
            &"a".repeat(SECRET_LENGTH),
        );

        assert_matches!(
            token
                .parse::<HashedApiToken>()
                .expect_err("an unknown version should not parse"),
            ApiTokenParseError::Version,
            "an unknown version should be reported as such"
        );
    }

    #[test]
    fn parse_token_id_overflow() {
        // `7` is the largest first digit of version 0, and the remaining digits push the token ID
        // beyond 128 bits.
        let token = token_of_parts(
            "pat",
            "pd",
            &format!("7{}", "z".repeat(TOKEN_ID_LENGTH - 1)),
            &"a".repeat(SECRET_LENGTH),
        );

        assert_matches!(
            token
                .parse::<HashedApiToken>()
                .expect_err("a token ID beyond 128 bits should not parse"),
            ApiTokenParseError::Encoding,
            "a token ID beyond 128 bits should be reported as malformed"
        );
    }

    #[test]
    fn parse_non_base62_secret() {
        let token = token_of_parts(
            "pat",
            "pd",
            &"0".repeat(TOKEN_ID_LENGTH),
            &format!("-{}", "a".repeat(SECRET_LENGTH - 1)),
        );

        assert_matches!(
            token
                .parse::<HashedApiToken>()
                .expect_err("a secret with a non-Base62 character should not parse"),
            ApiTokenParseError::Encoding,
            "a secret with a non-Base62 character should be reported as malformed"
        );
    }
}
