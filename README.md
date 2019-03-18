# wafu

[![npm](https://img.shields.io/npm/v/wafu.svg)](https://www.npmjs.com/package/wafu)

Rust port of [Fuse.js](https://github.com/krisk/Fuse), a javascript fuzzy searching library, compiled to WebAssembly. [Try it out!](http://wafu.s3-website-us-east-1.amazonaws.com)

## Usage

```
npm install wafu
```

Should work in any browser that supports [WebAssembly](https://caniuse.com/#feat=wasm), with [the same caveats as wasm-bindgen](https://rustwasm.github.io/wasm-bindgen/reference/browser-support.html). Otherwise, wafu should be an almost drop-in replacement for Fuse!

```js
import { Wafu } from "wafu";

const books = [
  {
    title: "Old Man's War",
    author: {
      firstName: "John",
      lastName: "Scalzi"
    }
  },
  {
    title: "The Lock Artist",
    author: {
      firstName: "Steve",
      lastName: "Hamilton"
    }
  }
];

const options = {
  keys: ["title", "author.lastName"],
  includeMatches: true
};

const searcher = new Wafu(books, options);
const results = searcher.search("~ query goes here ~");
```

The options are exactly the same as Fuse, with all changes documented [in the section below](#differences-from-fuse).

The story for bundling is a moving target, but webpack 4+ has native support for importing wasm if you do it within an async import block. The gist is you put whatever file _uses_ wafu behind an async import, and then you can go about your life as if loading were synchronous.

You can use it with create-react-app using [react-app-rewired](https://github.com/timarney/react-app-rewired) and this `config-overrides.js` file in your project root.

```js
module.exports = function override(config, env) {
  const wasmExtensionRegExp = /\.wasm$/;
  config.resolve.extensions.push(".wasm");
  config.module.rules.forEach(rule => {
    (rule.oneOf || []).forEach(oneOf => {
      if (oneOf.loader && oneOf.loader.indexOf("file-loader") >= 0) {
        oneOf.exclude.push(wasmExtensionRegExp);
      }
    });
  });
  return config;
};
```

Check the demo folder for a full example!

Node support may be coming at some point, but for now, it requires a bundler to translate the imports.

## Differences from Fuse

The results returned from Fuse and wafu, given the same options and collection, are close but not exactly the same just yet! Work is still being done here to iron out edge cases, but here are some known differences:

- Fuse treats leading and trailing whitespace as separate "tokens" which affects match score, but wafu filters them out.
- Behavior for patterns longer than 32 chars is different than with Fuse. I haven't decided exactly what the plan is here, but hopefully, it doesn't affect too many people.
- Occasionally scores are different by vanishingly small amounts. I'm chalking this up to differences in floating point arithmetic or minor serialization issues as data crosses back and forth between rust and js.
- The output of wafu is always structured as `{ item: T, score: number, matches?: WafuMatch[] }`, which means that Fuse's `id` and `includeScore` options are removed as the item is always the original item and the score is always included. It's trivial for end users to achieve the same effects as these options, and it simplifies the typescript definitions significantly.
- Fuse will return the index in place of the `item` when the original collection is `string[]`. wafu returns the actual string, because why would you do it the other way.
- Fuse's `findAllMatches` option is removed, and wafu behaves as if it's always set to `true`. This simplifies the internal bitap code a little.
- Fuse's `maxPatternLength` option is removed. It's buggy in Fuse and essentially has to be set to 32.
- Fuse's `sortFn` is removed. Hopefully, this isn't used much, but the main reason was I couldn't think of a nice way to do it!
- Not sure how well Fuse does, but wafu should do a good job of handling Unicode. Grapheme clusters are not taken into account; if you've got lots of Unicode text you should probably normalize it first.

## Performance

This initial release was written in the most straightforward way I could think of, so there is a lot of low hanging fruit in terms of improvements. Nevertheless, wafu appears to be _at least_ twice as fast as Fuse out of the box in firefox!

However, the compiled wasm code _alone_ is currently 216KB to Fuse's 12KB. This should improve in the future, but for now, that makes this project kind of a toy ☺

## Development

Requires [rust](https://www.rust-lang.org/), [wasm-pack](https://github.com/rustwasm/wasm-pack) (currently using v0.6.0), [node](https://nodejs.org/en/), and npm to build. I didn't have a great plan when I was structuring this package, but the rust code is in `wafu_rs`, the typescript code is in `wafu_pkg`, and the demo site code is in `wafu_demo`. The `build.sh` script builds everything, and also links wafu into the demo node modules.

### Project Goals

I'm not trying to make the world's best fuzzy search library. This is first and foremost a port of Fuse. I want it to potentially be a drop in replacement for people who _already_ use Fuse. Thats all!
