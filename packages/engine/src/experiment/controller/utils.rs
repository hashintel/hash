pub fn parse_range(range: &str) -> Option<(f64, f64)> {
    let number_match = r"([+-]?\d+(?:\.\d*)?|(?:\.\d+))";
    let range_pat = regex::Regex::new(&format!(
        "{}{}{}{}{}",
        r"^\s*", number_match, r"\s*-\s*", number_match, r"\s*$"
    ))
    .unwrap();
    if let Some(captures) = range_pat.captures(range) {
        let start_match = captures.get(1).map(|m| m.as_str());
        let end_match = captures.get(2).map(|m| m.as_str());
        if let (Some(start), Some(end)) = (start_match, end_match) {
            if let (Ok(start), Ok(end)) = (start.parse(), end.parse()) {
                return Some((start, end));
            }
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn range_parsing() {
        assert_eq!(parse_range(".123-24"), Some((0.123, 24.0)));
        assert_eq!(parse_range("+23.123--24.123"), Some((23.123, -24.123)));
        assert_eq!(parse_range("+23-+24"), Some((23.0, 24.0)));
        assert_eq!(parse_range("  23  -  24  "), Some((23.0, 24.0)));
    }
}
