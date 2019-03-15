import { deepValue } from "./utils/deepValue";

// @ts-ignore: This will be placed in dist on build.
import { search as wasmSearch, Searcher as WasmSearcher } from "./wafu";

export interface WafuOptions<T = any> {
  // Indicates whether comparisons should be case sensitive.
  caseSensitive: boolean;
  // Whether to sort the result list by score.
  shouldSort: boolean;
  // The get function to use when fetching an object's properties.
  // The default will search nested paths *ie foo.bar.baz*. May return an array.
  getFn: (obj: T, path: string) => string | string[];
  // List of properties that will be searched. This also supports nested properties.
  keys: Array<string | { name: string; weight: number }>;
  // When true, the search algorithm will search individual words **and** the full string,
  // computing the final score as a function of both. Note that when `tokenize` is `true`,
  // the `threshold`, `distance`, and `location` are inconsequential for individual tokens.
  tokenize: boolean;
  // Regex used to separate words when searching. Only applicable when `tokenize` is `true`.
  tokenSeparator: Parameters<String["split"]>[0];
  // When true, the result set will only include records that match all tokens. Will only work
  // if `tokenize` is also true.
  matchAllTokens: boolean;
  // Approximately where in the text is the pattern expected to be found?
  location: number;
  // Determines how close the match must be to location (specified above).
  // An exact letter match which is 'distance' characters away from the fuzzy location`
  // would score as a complete mismatch. A distance of '0' requires the match be at
  // the exact location specified, a threshold of '1000' would require a perfect match
  // to be within 800 characters of the fuzzy location to be found using a 0.8 threshold.
  distance: number;
  // At what point does the match algorithm give up. A threshold of '0.0' requires a perfect match
  // (of both letters and location), a threshold of '1.0' would match anything.
  threshold: number;
  // Include matched indicies in the output.
  includeMatches: boolean;
  // Minimum number of characters that must be matched before a result is considered a match
  minMatchCharLength: number;
}

export interface WafuResult<T> {
  item: T;
  score: number;
  matches?: WafuMatch[];
}

export interface WafuMatch {
  indices: Array<[number, number]>;
  value: string;
  key?: string;
  arrayIndex?: number;
}

export interface SearchOpts {
  limit?: number;
}

export const defaultOptions: Readonly<WafuOptions> = {
  location: 0,
  distance: 100,
  threshold: 0.6,
  caseSensitive: false,
  keys: [],
  shouldSort: true,
  getFn: deepValue,
  includeMatches: false,
  minMatchCharLength: 1,
  tokenize: false,
  tokenSeparator: / +/g,
  matchAllTokens: false
};

// TextEncoder isn't showing up, so this is just providing the type definition.
interface TextEncoder {
  readonly encoding: string;
  encode(input?: string): Uint8Array;
}
declare var TextEncoder: {
  prototype: TextEncoder;
  new (): TextEncoder;
};

const cachedTextEncoder = new TextEncoder();
function jsonEncode(v: any): Uint8Array {
  return cachedTextEncoder.encode(JSON.stringify(v));
}

export class Wafu<T> {
  private collection: ReadonlyArray<T>;
  private options: WafuOptions<T>;
  private fields: Field[];

  // This is the constructor parameter for rust's Searcher object serialized
  // as json in utf-8. It saves _some_ of the repeated work of crossing the
  // rust/js barrier.
  private cachedSearcherInput: Uint8Array;

  constructor(collection: T[], opts?: Partial<WafuOptions<T>>) {
    this.options = { ...(defaultOptions as WafuOptions<T>), ...opts };
    this.collection = collection;
    this.fields = buildFields(this.collection, this.options);

    this.cachedSearcherInput = jsonEncode({
      fields: buildRustFields(this.fields),
      options: buildRustOptions(this.options)
    });
  }

  search(pattern: string, opts?: SearchOpts): WafuResult<T>[] {
    if (pattern === "" || this.fields.length === 0) {
      return [];
    }
    const searchInput = buildRustSearchInput(pattern, opts, this.options);

    // @ts-ignore: Can't use a function that ts doesn't know about!
    const rsResults = wasmSearch(this.cachedSearcherInput, searchInput);
    return buildJSResult(this.collection, this.fields, rsResults, this.options);
  }
}

// Similar to the base Wafu, but owns an actual rust Searcher. Unsafe because
// users can potentially leak memory if they don't free, so I'm keeping this
// private for now.
export class WafuUnsafe<T> {
  private collection: ReadonlyArray<T>;
  private options: WafuOptions<T>;
  private fields: Field[];

  private searcher: any;

  constructor(collection: T[], opts?: Partial<WafuOptions<T>>) {
    this.options = { ...(defaultOptions as WafuOptions<T>), ...opts };
    this.collection = collection;
    this.fields = buildFields(this.collection, this.options);

    // @ts-ignore: Can't use a function that ts doesn't know about!
    this.searcher = new WasmSearcher({
      fields: buildRustFields(this.fields),
      options: buildRustOptions(this.options)
    });
  }

  search(pattern: string, opts?: SearchOpts): WafuResult<T>[] {
    if (pattern === "" || this.fields.length === 0) {
      return [];
    }
    const searchInput = buildRustSearchInput(pattern, opts, this.options);

    // @ts-ignore: Can't use a function that ts doesn't know about!
    const rsResults = this.searcher.search(searchInput);
    return buildJSResult(this.collection, this.fields, rsResults, this.options);
  }

  free() {
    this.searcher.free();
    this.searcher = null;
  }
}

// Field represents a searchable field inside of an item in the collection.
// Wafu can be fed objects with a list of keys that point into the objects, so
// think of Field as the normalized/flattened form of that.
interface Field {
  // The original text before potentially converting to lowercase. We need to
  // keep this around for the matched indicies output.
  originalText: string;
  // The text that will actually be searched.
  text: string;
  // The "tokens" of the text.
  tokens?: string[];
  // The index of the item in the original collection that this field corresponds to.
  itemIndex: number;
  // The index in the keys array that this field corresponds to. Note that
  // this will be undefined if the source collection is string[].
  keyIndex?: number;
  // When getFn returns an array, this corresponds to the array index.
  arrayIndex?: number;
  // Actual string that was passed as the key.
  key?: string;
  // Weight that should be given to this field. This is derived from key, but
  // denormalized here.
  weight: number;
}

// Takes the original collection and the passed options and makes a
// normalized/flat version of each searchable field. This is an internal
// pre-processing step that makes passing to rust a little more simple.
function buildFields<T>(
  collection: ReadonlyArray<T>,
  opts: WafuOptions<T>
): Field[] {
  // Normalize keys into a {name, weight} structure.
  let keys = opts.keys.map(key => {
    if (typeof key === "string") {
      return { name: key, weight: 1 };
    } else {
      return { name: key.name, weight: key.weight };
    }
  });

  // Flatten the list of strings that we want to search down into a single
  // array, with references back to their original "locations" as determined
  // by keyIndex and arrayIndex.
  let fields: Field[] = [];
  collection.forEach((item, itemIndex) => {
    // Handle the simple string case.
    if (typeof item === "string") {
      fields.push({
        originalText: item,
        text: item,
        itemIndex,
        weight: 1
      });
      return;
    }

    // Handle the object case.
    keys.forEach((key, keyIndex) => {
      const value = opts.getFn(item, key.name);
      if (typeof value === "string") {
        fields.push({
          originalText: value,
          text: value,
          itemIndex,
          keyIndex,
          key: key.name,
          weight: key.weight
        });
      } else if (Array.isArray(value)) {
        // Technically fuse allows recursive array lookups, but my getFn
        // definition is a little more strict so I'm going to ignore.
        value.forEach((subvalue, arrayIndex) => {
          if (typeof subvalue !== "string") {
            return;
          }
          fields.push({
            originalText: subvalue,
            text: subvalue,
            itemIndex,
            keyIndex,
            arrayIndex,
            key: key.name,
            weight: key.weight
          });
        });
      }
    });
  });

  // Filter out empty fields. I think this is ok, since these fields would
  // almost certainly not be matches, but not _really_ sure.
  fields = fields.filter(field => field.text !== "");

  // Convert all text to lowercase when case sensitive.
  if (!opts.caseSensitive) {
    for (let field of fields) {
      field.text = field.text.toLowerCase();
    }
  }

  // Tokenize all strings when tokenize is true.
  if (opts.tokenize) {
    for (let field of fields) {
      // TODO: Could skip if the result of the split is a single string that's
      // equal to the original string, ie: "fuse".split(/ +/g) is just
      // ["fuse"]. The scores for full and token are averaged, so ultimately
      // the score will be the same if we just don't run on tokens.
      //
      // However, after dealing with the analyze function more deeply I think
      // any optimization like this would change the resulting scores pretty
      // drastically. Will need to think more on this later.

      // NOTE: Leading and trailing whitespace in the text may cause
      // extraneous empty tokens. We filter these out. Ex:
      //
      //   " fuse ".split(/ +/g) returns ["", "fuse", ""]
      //
      // Fuse notably doesn't handle this, but I'm desperately hoping no one
      // is depending on that behavior.
      field.tokens = field.text
        .split(opts.tokenSeparator)
        .filter(v => v.length > 0);
    }
  }

  return fields;
}

interface RustOptions {
  location: number;
  distance: number;
  threshold: number;
  include_matches: boolean;
  min_match_char_length: number;
  tokenize: boolean;
  match_all_tokens: boolean;
  should_sort: boolean;
}

function buildRustOptions(opts: WafuOptions): RustOptions {
  return {
    location: opts.location,
    distance: opts.distance,
    threshold: opts.threshold,
    include_matches: opts.includeMatches,
    min_match_char_length: opts.minMatchCharLength,
    tokenize: opts.tokenize,
    match_all_tokens: opts.matchAllTokens,
    should_sort: opts.shouldSort
  };
}

interface RustField {
  text: string;
  tokens: null | string[];
  item_index: number;
  weight: number;
}

function buildRustFields(fields: Field[]): RustField[] {
  return fields.map(f => ({
    text: f.text,
    tokens: f.tokens ? f.tokens : null,
    item_index: f.itemIndex,
    weight: f.weight
  }));
}

// Passed in to create the Searcher.
interface RustSearcherInput {
  fields: RustField[];
  options: RustOptions;
}

interface RustSearchInput {
  pattern: string;
  pattern_tokens: null | string[];
  limit: null | number;
}

function buildRustSearchInput(
  pattern: string,
  searchOpts: SearchOpts | undefined,
  options: WafuOptions
): RustSearchInput {
  if (!options.caseSensitive) {
    pattern = pattern.toLowerCase();
  }

  // Here we're going to deviate from fuse a bit, only because fuse's solution
  // is hard for me to implement and this shouldn't come up too often. When
  // the pattern or any of the pattern tokens are longer than 32 chars, just
  // truncate to 32 chars. This is a limitation of bitap (kind of). Think more
  // on this later, but avoids a runtime error for now.

  let pattern_tokens: null | string[] = null;
  if (options.tokenize) {
    pattern_tokens = pattern
      .split(options.tokenSeparator)
      .filter(v => v.length > 0)
      .map(s => truncateTo32Chars(s));
  }

  pattern = truncateTo32Chars(pattern);

  return {
    pattern,
    pattern_tokens,
    limit:
      searchOpts && typeof searchOpts.limit === "number"
        ? searchOpts.limit
        : null
  };
}

function truncateTo32Chars(s: string): string {
  const chars = Array.from(s);
  if (chars.length < 31) return s;
  const truncated = chars.slice(0, 30).join("");
  return truncated;
}

interface RustSearchResult {
  item_index: number;
  score: number;
  matches: null | RustMatchedIndices[];
}

interface RustMatchedIndices {
  field_index: number;
  indices: Array<[number, number]>;
}

// Takes the results from rust and combines them with the original collection
// and fields to make the expected output.
function buildJSResult<T>(
  collection: ReadonlyArray<T>,
  fields: Field[],
  results: RustSearchResult[],
  opts: WafuOptions
): WafuResult<T>[] {
  return results.map(rsResult => {
    const jsResult: WafuResult<T> = {
      item: collection[rsResult.item_index],
      score: rsResult.score
    };

    if (opts.includeMatches && rsResult.matches !== null) {
      jsResult.matches = rsResult.matches.map(rsMatch => {
        const field = fields[rsMatch.field_index];
        const jsMatch: WafuMatch = {
          indices: rsMatch.indices,
          value: field.originalText
        };
        if (field.key !== undefined) {
          jsMatch.key = field.key;
        }
        if (field.arrayIndex !== undefined) {
          jsMatch.arrayIndex = field.arrayIndex;
        }
        return jsMatch;
      });
    }

    return jsResult;
  });
}
