# wafu

[![npm](https://img.shields.io/npm/v/wafu.svg)](https://www.npmjs.com/package/wafu)

Rust port of [Fuse.js](https://github.com/krisk/Fuse), a javascript fuzzy searching library, compiled to WebAssembly. [Try it out!](http://wafu.s3-website-us-east-1.amazonaws.com)

## Usage

```
npm install wafu
```

Should work in any browser that supports [WebAssembly](https://caniuse.com/#feat=wasm), with [the same caveats as wasm-bindgen](https://rustwasm.github.io/wasm-bindgen/reference/browser-support.html). Otherwise, wafu should be an almost drop in replacement for Fuse!

```ts
import { Wafu, WafuOptions } from "wafu";

const books = [
  {
    title: "Old Man's War fiction",
    author: "John X",
    tags: ["war"]
  },
  {
    title: "Right Ho Jeeves",
    author: "P.D. Mans",
    tags: ["fiction", "war"]
  }
];

const options: WafuOptions = {
  keys: ["title", "author"],
  includeMatches: true
};

const searcher = new Wafu(books, options);
const results = searcher.search("old");
```

The options are the same as Fuse, with some minor differences as documented below.

The story for bundling is changing quickly, but it _looks_ like webpack 4+ has native support for importing wasm if you do it in an async import block. Check the demo folder for an example project, but basically if you put a module that _uses_ wafu behind an async import, you can go about your life as if loading is synchronous.

Node support may be coming at some point, but for now requires a bundler to translate the imports.

## Differences from Fuse

I'm closing in on output being exactly the same between Fuse and wafu! Two well known differences:

- Fuse treats leading and trailing whitespace as separate "tokens", but wafu filters them out.
- Behavior for patterns longer than 32 chars is different from Fuse. I haven't decided exactly what the plan is here, but it should be rare enough that it's not a huge issue.

If you notice any other cases where output diverges in ways other than minor score differences please file an issue!

### Other differences

- The output of wafu is always structured as `{ item: T, score: number, matches?: WafuMatch[] }`, which means that Fuse's `id` and `includeScore` options are removed as the item is always the original item and the score is always included. It's trivial for end users to achieve the same end results as these options, and it simplifies the typescript types significantly.
- Fuse's `findAllMatches` option is removed, and wafu behaves as if it's always set to `true`. This simplifies the internal bitap code a little.
- Fuse's `maxPatternLength` option is removed. It's buggy in Fuse and essentially has to be set to 32.
- Fuse's `sortFn` is removed. Hopefully this isn't used much, but the main reason was I couldn't think of a nice way to do it!
- Not sure how well Fuse does, but wafu should do a good job of handling unicode. Grapheme clusters are not taken into account; if you've got weird text you should probably normalize it first.

## Performance

This initial release was written in the most straightforward way I could think of, so there is a lot of low hanging fruit in terms of improvements. Nevertheless, wafu appears to be faster than Fuse out of the box!

However, the compiled wasm code _alone_ is currently 216KB to Fuse's 12KB. This should improve in the future, but for now that makes this project kind of a toy!

## Development

Requires [rust](https://www.rust-lang.org/), [wasm-pack](https://github.com/rustwasm/wasm-pack) (currently using v0.6.0), [node](https://nodejs.org/en/), and npm to build. I didn't have a great plan when I was structuring this package, but the rust code is in `wafu_rs`, the typescript code is in `wafu_pkg`, and the demo site code is in `wafu_demo`. The `build.sh` script builds everything, and also links wafu into the demo node modules.
