/// Parsed temporal interval from an `//@ axis` directive.
#[derive(Debug, Clone)]
pub(crate) struct AxisInterval {
    pub start: AxisBound,
    pub end: AxisBound,
}

/// A single bound in an axis interval.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum AxisBound {
    Unbounded,
    Included(i128),
    Excluded(i128),
}

/// Parsed axis directives from a test file.
#[derive(Debug, Default)]
pub(crate) struct AxisDirectives {
    pub decision: Option<AxisInterval>,
    pub transaction: Option<AxisInterval>,
}

/// Parses `//@ axis[decision]` and `//@ axis[transaction]` directives from
/// the source text.
///
/// Supported interval syntax:
/// - `(T)` : point interval (pinned)
/// - `[a, b)` / `(a, b]` / `[a, b]` / `(a, b)` : range with bounds
/// - `(, b]` / `(, b)` : unbounded start
/// - `[a,)` / `(a,)` : unbounded end
pub(crate) fn parse_directives(source: &str) -> AxisDirectives {
    let mut directives = AxisDirectives::default();

    for line in source.lines() {
        let trimmed = line.trim();

        let Some(rest) = trimmed.strip_prefix("//@") else {
            // Stop scanning once we hit a non-directive, non-comment line.
            if !trimmed.is_empty() && !trimmed.starts_with("//") {
                break;
            }
            continue;
        };

        let rest = rest.trim();

        let Some(rest) = rest.strip_prefix("axis[") else {
            continue;
        };

        let (axis_name, rest) = rest
            .split_once(']')
            .expect("malformed axis directive: missing ]");

        let rest = rest.trim();
        let rest = rest
            .strip_prefix('=')
            .expect("malformed axis directive: missing =");
        let rest = rest.trim();

        let interval = parse_interval(rest);

        match axis_name {
            "decision" => directives.decision = Some(interval),
            "transaction" => directives.transaction = Some(interval),
            other => panic!("unknown axis name: {other}"),
        }
    }

    directives
}

/// Parses an interval expression like `(T)`, `[a, b)`, `(, b]`, etc.
fn parse_interval(input: &str) -> AxisInterval {
    let input = input.trim();

    let first = input.bytes().next().expect("empty interval expression");
    let start_inclusive = match first {
        b'[' => true,
        b'(' => false,
        other => panic!("unexpected interval start: {}", other as char),
    };

    let last = input
        .bytes()
        .next_back()
        .expect("empty interval expression");
    let end_inclusive = match last {
        b']' => true,
        b')' => false,
        other => panic!("unexpected interval end: {}", other as char),
    };

    // Safe to slice at 1 and len-1: brackets are single-byte ASCII.
    let inner = input.get(1..input.len() - 1).expect("interval too short");

    // Point interval: (T) — bracket style is irrelevant, always [T, T].
    if !inner.contains(',') {
        let timestamp = inner
            .trim()
            .parse::<i128>()
            .expect("could not parse point interval timestamp");

        return AxisInterval {
            start: AxisBound::Included(timestamp),
            end: AxisBound::Included(timestamp),
        };
    }

    // Range interval: split on comma.
    let (start_str, end_str) = inner
        .split_once(',')
        .expect("interval must contain a comma");

    let start = parse_bound(start_str.trim(), start_inclusive);
    let end = parse_bound(end_str.trim(), end_inclusive);

    AxisInterval { start, end }
}

/// Parses a single bound value. Empty string means unbounded.
fn parse_bound(value: &str, inclusive: bool) -> AxisBound {
    if value.is_empty() {
        return AxisBound::Unbounded;
    }

    let timestamp = value
        .parse::<i128>()
        .unwrap_or_else(|error| panic!("could not parse bound {value:?}: {error}"));

    if inclusive {
        AxisBound::Included(timestamp)
    } else {
        AxisBound::Excluded(timestamp)
    }
}
