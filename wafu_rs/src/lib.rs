#[macro_use]
extern crate serde_derive;

extern crate cfg_if;
extern crate wasm_bindgen;

mod bitap;

use cfg_if::cfg_if;
use std::cmp;
use std::collections::HashMap;
use wasm_bindgen::prelude::*;

cfg_if! {
    // When the `wee_alloc` feature is enabled, use `wee_alloc` as the global
    // allocator.
    if #[cfg(feature = "wee_alloc")] {
        extern crate wee_alloc;
        #[global_allocator]
        static ALLOC: wee_alloc::WeeAlloc = wee_alloc::WeeAlloc::INIT;
    }
}

#[derive(Deserialize)]
pub struct Options {
    pub location: usize,
    pub distance: usize,
    pub threshold: f64,
    pub include_matches: bool,
    pub min_match_char_length: usize,
    pub tokenize: bool,
    pub match_all_tokens: bool,
    pub should_sort: bool,
}

#[derive(Deserialize)]
pub struct Field {
    pub text: String,
    pub tokens: Option<Vec<String>>,
    pub item_index: usize,
    pub weight: f64,
}

#[derive(Deserialize)]
pub struct SearchInput {
    pub pattern: String,
    pub pattern_tokens: Option<Vec<String>>,
    pub limit: Option<usize>,
    pub fields: Vec<Field>,
    pub options: Options,
}

#[derive(Serialize)]
pub struct SearchResult {
    pub item_index: usize,
    pub score: f64,
    pub matches: Option<Vec<MatchIndices>>,
}

#[derive(Serialize)]
pub struct MatchIndices {
    pub field_index: usize,
    pub indices: Vec<(usize, usize)>,
}

// Just trying to get this first iteration to work, we're using serde to pass
// data back and forth, which is _probably_ very very slow but I want to get
// this done :')
#[wasm_bindgen(js_name = search)]
pub fn wrapped_search(val: &JsValue) -> JsValue {
    let input: SearchInput = val.into_serde().unwrap();
    let output = search(&input);
    return JsValue::from_serde(&output).unwrap();
}

/// ItemScore is an internal representation of an item's current score, and
/// whichever fields it has that are considered matches. Handles some
/// weirdness with how fuse calculates item scores from individual match
/// scores.
struct ItemScore {
    item_index: usize,
    current_score: f64,
    best_score: f64,
    matched_fields: Vec<usize>,
}

impl ItemScore {
    fn new(item_index: usize) -> ItemScore {
        ItemScore {
            item_index,
            current_score: 1.0,
            best_score: 1.0,
            matched_fields: Vec::new(),
        }
    }

    fn add_score(&mut self, score: f64, weight: f64) {
        // Why it's done this way I truly do not understand, but it matches
        // fuse's computeScore logic and we're making a drop in replacement.
        let score = if weight != 1.0 && score == 0.0 {
            0.001
        } else {
            score
        };
        let weighted_score = weight * score;

        if weight == 1.0 {
            self.current_score *= weighted_score;
        } else if self.best_score.gt(&weighted_score) {
            self.best_score = weighted_score;
        }
    }

    #[inline]
    fn get_score(&self) -> f64 {
        // How it works in fuse.
        if self.best_score == 1.0 {
            self.current_score
        } else {
            self.best_score
        }
    }
}

fn search(input: &SearchInput) -> Vec<SearchResult> {
    let searchers = create_searchers(&input.pattern, &input.pattern_tokens, &input.options);

    let mut item_scores: Vec<ItemScore> = Vec::new();

    // Mapping from item_index => item_scores[index]. Instead of keeping
    // references to the actual ItemScore, we just track the index in
    // item_scores. This saves us from needing to clone anything.
    let mut item_score_map: HashMap<usize, usize> = HashMap::new();

    // Analyze all fields, tracking those that matched.
    for (i, field) in input.fields.iter().enumerate() {
        let score = analyze(
            &searchers,
            &field.text,
            &field.tokens,
            input.options.tokenize,
            input.options.match_all_tokens,
        );
        if let Some(score) = score {
            let weight = field.weight;

            // Kinda convoluted, but check whether there's an index in the
            // score map. If there is then update that entry, otherwise insert
            // a new entry into the list and then insert the index of that
            // entry into the score map.
            match item_score_map.get(&field.item_index) {
                Some(index) => {
                    if let Some(entry) = item_scores.get_mut(*index) {
                        entry.add_score(score, weight);
                        entry.matched_fields.push(i);
                    }
                }
                None => {
                    let mut entry = ItemScore::new(field.item_index);
                    entry.add_score(score, weight);
                    entry.matched_fields.push(i);
                    item_scores.push(entry);

                    let idx = item_scores.len() - 1;
                    item_score_map.insert(field.item_index, idx);
                }
            };
        }
    }

    // Sort by best score with ties broken by item_index. Even if should_sort
    // is false, sort by the original item_index so that output is stable.
    if input.options.should_sort {
        // Sort by best score,
        item_scores.sort_by(|a, b| {
            let a_score = a.get_score();
            let b_score = b.get_score();
            let ord = a_score.partial_cmp(&b_score).unwrap();
            match ord {
                cmp::Ordering::Equal => a.item_index.cmp(&b.item_index),
                _ => ord,
            }
        });
    } else {
        item_scores.sort_by(|a, b| a.item_index.cmp(&b.item_index));
    }

    let take_this_many = input.limit.unwrap_or(item_scores.len());
    let results: Vec<SearchResult> = item_scores
        .iter()
        .take(take_this_many)
        .map(|s| SearchResult {
            item_index: s.item_index,
            score: s.get_score(),
            matches: if !input.options.include_matches {
                None
            } else {
                Some(
                    s.matched_fields
                        .iter()
                        .filter_map(|field_index| {
                            let indices = searchers.full.get_matched_indices(
                                &input.fields.get(*field_index).unwrap().text,
                                input.options.min_match_char_length,
                            );
                            // Don't inclue fields where none of the matches
                            // were long enough to pass min_match_char_length.
                            if indices.len() == 0 {
                                return None;
                            } else {
                                return Some(MatchIndices {
                                    field_index: *field_index,
                                    indices,
                                });
                            }
                        })
                        .collect(),
                )
            },
        })
        .collect();

    return results;
}

struct Searchers {
    full: bitap::Searcher,
    token: Option<Vec<bitap::Searcher>>,
}

fn create_searchers(pattern: &str, tokens: &Option<Vec<String>>, opts: &Options) -> Searchers {
    let full = bitap::Searcher::new(pattern, opts.location, opts.distance, opts.threshold);
    let token = tokens.as_ref().map(|tokens| {
        tokens
            .iter()
            .map(|token| bitap::Searcher::new(token, opts.location, opts.distance, opts.threshold))
            .collect()
    });
    return Searchers {
        full: full,
        token: token,
    };
}

// Analyze computes the score by running the searchers on the passed text and
// tokens. Returns the score if there was a match, or None if there was not.
//
// This algorithm is pretty convoluted, but it's based on what fuse does.
fn analyze(
    searchers: &Searchers,
    text: &str,
    tokens: &Option<Vec<String>>,
    tokenize: bool,
    match_all_tokens: bool,
) -> Option<f64> {

    // Performance improvement. Check whether any characters in the text
    // match any characters in the pattern as a quick pre-filter, since it's
    // definitely not a match if that's not the case.
    if searchers.full.definitely_does_not_match(text) {
        return None
    }

    let full_result = searchers.full.search(text);
    if !tokenize {
        return if full_result.is_match {
            Some(full_result.score)
        } else {
            None
        };
    }

    // These _should_ be set if opts.tokenize is true.
    let tokens = tokens.as_ref().unwrap();
    let token_searchers = searchers.token.as_ref().unwrap();

    let mut is_match = full_result.is_match;
    let mut token_score_total: f64 = 0.0;
    let mut token_score_count: usize = 0;

    for searcher in token_searchers.iter() {
        let mut token_has_match = false;
        for token in tokens.iter() {
            let result = searcher.search(token);
            if result.is_match {
                token_has_match = true;
                token_score_total += result.score;
                token_score_count += 1;
            } else if match_all_tokens == false {
                // This doesn't make sense to me: why would we only add the
                // score if match_all_tokens was false? But this is taken
                // directly from fuse.
                token_score_total += 1.0;
                token_score_count += 1;
            }
        }

        // Return early if match_all_tokens is true and the last token
        // searcher didn't match anything.
        if !token_has_match && match_all_tokens {
            return None;
        }

        // Consider this a match if any of the tokens matched.
        if token_has_match {
            is_match = true
        }
    }

    if !is_match {
        return None;
    }

    let mut final_score = full_result.score;
    if token_score_count > 0 {
        let avg_token_score = token_score_total / token_score_count as f64;
        final_score = (final_score + avg_token_score) / 2.0;
    }
    return Some(final_score);
}
