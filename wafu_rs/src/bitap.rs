use std::collections::HashMap;
use std::mem;

// Fuse uses the "distance" that a match is found from "expected_location"
// when calculating the score, but the bitap algorithm only can tell where
// a match _ends_. Calculating where it begins isn't as simple as just
// subtracting the pattern length either; the possibility of insertions
// and deletions mean it's a moving target. I could go into more detail,
// but afaict recovering the match start index isn't trivial.
//
// To get around this, we run bitap _backwards_; the place that the match
// "ends" in this reversed bitap is the match beginning in the original
// text.
//
// Reversing the text codepoint by codepoint has consequences, as one
// codepoint doesn't necessarily correspond to one character on the
// screen. See this reddit thread for some details:
// https://www.reddit.com/r/rust/comments/3diqh0/string_reverse_iteration/ct5rfug/
//
// Because fuse doesn't do anything special here, and because supporting
// grapheme clusters is more work than I want to do, we're just going to
// ignore these issues for now and hope everything works out :)

pub struct SearchResult {
    pub is_match: bool,
    pub score: f64,
}

pub struct Searcher {
    pub pattern: UnicodePattern,
    expected_location: usize,
    distance: usize,
    threshold: f64,
}

impl Searcher {
    pub fn new(
        pattern: &Vec<char>,
        expected_location: usize,
        distance: usize,
        threshold: f64,
    ) -> Searcher {
        let pattern = UnicodePattern::new(&reverse_string(pattern)).unwrap();
        return Searcher {
            pattern,
            expected_location,
            distance,
            threshold,
        };
    }

    pub fn search(&self, text: &Vec<char>) -> SearchResult {
        fuse_bitap_search(
            text,
            &self.pattern,
            self.expected_location,
            self.distance,
            self.threshold,
        )
    }

    // Returns true if the passed text is definitely not a match. Checks
    // whether any of the characters in the pattern appear in the source text.
    // Kind of a fast pre-check before we do the full bitap search.
    pub fn definitely_does_not_match(&self, text: &Vec<char>) -> bool {
        for c in text {
            if self.pattern.contains_char(*c) {
                return false
            }
        }
        return true
    }

    pub fn get_matched_indices(&self, text: &Vec<char>, min_match_char_length: usize) -> Vec<(usize, usize)> {
        return matched_indices(text, &self.pattern, min_match_char_length);
    }
}

fn fuse_bitap_search(
    text: &Vec<char>,
    pattern: &UnicodePattern,
    expected_location: usize,
    distance: usize,
    threshold: f64,
) -> SearchResult {
    // Highest score beyond which we give up.
    let mut current_threshold = threshold;
    let mut is_match = false;
    let mut best_score = 1.0;

    // Calculate the maximum error level according to the scoring algorithm.
    // Ultimately anything > 1 is considered a total mismatch, and score has a
    // lower bound of error_level/pattern_length, so the max is
    // floor(threshold * pattern_length)
    let max_error_count = (threshold * pattern.length as f64).trunc() as usize;

    // TODO: I think we can also use the threshold to calculate the upper
    // bound on the "distance" from expected_location that we can find a
    // match, which would let us narrow down the range of the text we actually
    // search.

    // Reverse the text, as laid out in the top level comment. Will optimize later :')
    let text_reversed = reverse_string(text);
    let text_len = text.len();

    for m in pattern.search(&text_reversed, max_error_count) {
        // Un-reverse the match index.
        let actual_match_index = text_len - 1 - m.match_index;
        let score = calculate_score(
            pattern.length,
            m.edit_distance,
            actual_match_index,
            expected_location,
            distance,
        );
        if score < best_score {
            best_score = score;
        }
        if score <= current_threshold {
            current_threshold = score;
            is_match = true;
        }

        // TODO: Plenty of opportunities to break early here; as the best
        // value changes, it also changes max_error_count and the search
        // bounds. But... KISS for now.

        if best_score == 0.0 {
            break;
        }
    }
    return SearchResult {
        is_match: is_match,
        score: if best_score == 0.0 { 0.001 } else { best_score },
    };
}

// This is a hacky error prone way to reverse a string but... whatever.
pub fn reverse_string(s: &Vec<char>) -> Vec<char> {
    s.iter().rev().cloned().collect()
}

#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub struct Match {
    /// The edit distance for this match.
    pub edit_distance: usize,
    /// The position this match was "found" at, which is the last character
    /// index of the matched substring.
    pub match_index: usize,
}

/// UnicodePattern represents a Unicode search string that's compiled to
/// search through other Unicode text with the bitap algorithm.
pub struct UnicodePattern {
    length: usize,
    masks: HashMap<char, usize>,
}

impl UnicodePattern {
    /// Compiles the search pattern. An error will be returned if the pattern
    /// is empty, or if the pattern is longer than the system word size minus
    /// one.
    pub fn new(pattern: &Vec<char>) -> Result<UnicodePattern, &'static str> {
        let mut length = pattern.len();
        if length == 0 {
            return Err("pattern must not be empty");
        }
        if length >= mem::size_of::<usize>() * 8 - 1 {
            return Err("invalid pattern length");
        }
        let mut masks: HashMap<char, usize> = HashMap::new();
        for (i, c) in pattern.iter().enumerate() {
            match masks.get_mut(&c) {
                Some(mask) => {
                    *mask &= !(1usize << i);
                }
                None => {
                    masks.insert(*c, !0usize & !(1usize << i));
                }
            };
        }
        return Ok(UnicodePattern { length, masks });
    }

    #[inline]
    fn get_mask(&self, c: char) -> usize {
        match self.masks.get(&c) {
            Some(m) => *m,
            None => !0usize,
        }
    }

    #[inline]
    pub fn contains_char(&self, c: char) -> bool {
        return self.masks.contains_key(&c);
    }

    pub fn search<'a>(&'a self, text: &'a Vec<char>, k: usize) -> impl Iterator<Item = Match> + 'a {
        let mut r = vec![!1usize; k + 1];

        // Initialize the arrays so that each error level starts with the
        // appropriate number of characters already given: because of the
        // possibility of inserts, we can start with the assumption that the
        // first k characters are already correct.
        for (k, r) in r.iter_mut().enumerate().skip(1) {
            *r <<= k;
        }
        return text.iter().enumerate().filter_map(move |(i, c)| {
            let mask = self.get_mask(*c);
            let mut prev_parent = r[0];
            r[0] |= mask;
            r[0] <<= 1;
            for j in 1..r.len() {
                let prev = r[j];
                let current = (prev | mask) << 1;
                let replace = prev_parent << 1;
                let delete = r[j - 1] << 1;
                let insert = prev_parent;
                r[j] = current & insert & delete & replace;
                prev_parent = prev;
            }
            for (k, rv) in r.iter().enumerate() {
                if 0 == (rv & (1usize << self.length)) {
                    return Some(Match {
                        edit_distance: k,
                        match_index: i,
                    });
                }
            }
            return None;
        });
    }
}

// Scoring algorithm from fuse.
fn calculate_score(
    pattern_length: usize,
    error_count: usize,
    current_location: usize,
    expected_location: usize,
    distance: usize,
) -> f64 {
    let accuracy = error_count as f64 / pattern_length as f64;
    let proximity = (expected_location as isize - current_location as isize).abs();
    if distance == 0 {
        if proximity != 0 {
            1.0
        } else {
            accuracy
        }
    } else {
        accuracy + (proximity as f64 / distance as f64)
    }
}

pub fn matched_indices(
    text: &Vec<char>,
    pattern: &UnicodePattern,
    min_match_char_length: usize,
) -> Vec<(usize, usize)> {
    let mut results = Vec::new();

    let mut start: Option<usize> = None;
    let mut text_len = 0;
    for (i, c) in text.iter().enumerate() {
        text_len += 1;
        let is_match = pattern.contains_char(*c);
        match (is_match, start) {
            (true, None) => {
                start = Some(i);
            }
            (false, Some(start_index)) => {
                let end_index = i - 1;
                if end_index + 1 - start_index >= min_match_char_length {
                    results.push((start_index, end_index))
                }
                start = None;
            }
            (_, _) => {}
        }
    }
    if let Some(start_index) = start {
        let end_index = text_len - 1;
        if end_index + 1 - start_index >= min_match_char_length {
            results.push((start_index, end_index));
        }
    }
    return results;
}

#[cfg(test)]
mod tests {
    use super::*;

    fn text_to_chars(s: &str) -> Vec<char> {
        s.chars().collect()
    }

    #[test]
    fn text_reversed_match_position() {
        let pattern = text_to_chars("abc");
        let text = text_to_chars("----abc");
        let text_len = text.len();
        let matched = UnicodePattern::new(&reverse_string(&pattern))
            .unwrap()
            .search(&reverse_string(&text), 0)
            .map(|m| text_len - 1 - m.match_index)
            .collect::<Vec<_>>();
        assert_eq!(matched, vec![4]);
    }

    #[test]
    fn test_matched_indices() {
        let pattern = UnicodePattern::new(&text_to_chars("a")).unwrap();
        let text = text_to_chars("aaa a aa");
        assert_eq!(
            matched_indices(&text, &pattern, 1),
            vec![(0, 2), (4, 4), (6, 7)]
        );
        assert_eq!(matched_indices(&text, &pattern, 2), vec![(0, 2), (6, 7)]);
        assert_eq!(matched_indices(&text, &pattern, 3), vec![(0, 2)]);
        assert_eq!(matched_indices(&text, &pattern, 4), vec![]);
        let text = text_to_chars(" aa a aaa ");
        assert_eq!(
            matched_indices(&text, &pattern, 1),
            vec![(1, 2), (4, 4), (6, 8)]
        );
        assert_eq!(matched_indices(&text, &pattern, 2), vec![(1, 2), (6, 8)]);
        assert_eq!(matched_indices(&text, &pattern, 3), vec![(6, 8)]);
        assert_eq!(matched_indices(&text, &pattern, 4), vec![]);

        let text = text_to_chars("");
        assert_eq!(matched_indices(&text, &pattern, 0), vec![]);
    }
}
