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

Node support is coming at some point, but for now requires a bundler to translate the imports.

## Differences from Fuse

- Currently the results returned aren't exactly the same, though they're pretty close. Need to do more work here uncovering edge cases.
- Fuse's `id` is removed. It's not hard for end users to do the same thing, and it simplifies the typescript types.
- Fuse's `includeScore` is removed. wafu will **always** includes the score. Because of this, output is always nested into an object with `item` and `score` keys.
- Fuse's `findAllMatches` is removed, and wafu behaves as if it's always set to `true`. This simplifies the internal bitap code a little.
- Fuse's `maxPatternLength` is removed. It's buggy in Fuse anyway, and pretty much has to be 32.
- Fuse's `sortFn` is removed. Hopefully this isn't used much, but the main reason was I couldn't think of a nice way to do it!
- Behavior for patterns or tokens longer than 32 chars is _very_ different from Fuse. Neither one is particularly good, so let's just hope this doesn't happen too often. Will need to do some more work here to define this better.
- Not sure how well Fuse does, but wafu should do a good job of handling unicode. Grapheme clusters are not taken into account. If you've got weird text you should probably normalize it first.

## Performance

This initial release was written in the most straightforward way I could think of, so there is a lot of low hanging fruit in terms of performance improvements. Nevertheless, wafu appears to be faster than Fuse out of the box!

However, the compiled wasm code _alone_ is currently 176KB to Fuse's 12KB. This should improve in the future, but for now that makes this project kind of a toy!

## Development

Requires [rust](https://www.rust-lang.org/), [wasm-pack](https://github.com/rustwasm/wasm-pack) (currently using v0.6.0), [node](https://nodejs.org/en/), and npm to build. I didn't have a great plan when I was structuring this package, but the rust code is in `wafu_rs`, the typescript code is in `wafu_pkg`, and the demo site code is in `wafu_demo`. The `build.sh` script builds everything, and also links wafu into the demo node modules.
