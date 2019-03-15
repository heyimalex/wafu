import React, { Component } from "react";
import Fuse from "fuse.js";

import { Wafu, WafuOptions, defaultOptions as defaultWafuOptions } from "wafu";

import { packages } from "./rust-packages";
import { Options, useOptionsReducer } from "./Options";
import Results from "./Results";

export default function App() {
  const [options, optionsDispatch] = useOptionsReducer();
  const [query, setQuery] = React.useState("");
  const [optionsHidden, setOptionsHidden] = React.useState(true);
  const toggleHidden = React.useCallback(() => {
    setOptionsHidden(v => !v);
  }, [setOptionsHidden]);

  // This is _kind of_ cheating because it papers over a difference between
  // fuse and wafu; that trailing whitespace is considered an empty "token" by
  // fuse. By removing trailing whitespace, we don't show this difference.
  // It's done to make checking whether the outputs are exactly the same more
  // stable; without it every space typed would show as "different", when
  // really I only care about unexpected differences.
  const trimmedQuery = query.trim();
  return (
    <div>
      <h1>wafu</h1>
      <p>
        Rust port of <a href="https://fusejs.io/">Fuse.js</a>, the fuzzy
        searching library, compiled to WebAssembly.{" "}
        <a href="https://github.com/heyimalex/wafu">Check it out on github!</a>
      </p>
      <h3>
        Options{" "}
        <button
          role="switch"
          aria-pressed={!optionsHidden}
          aria-label={optionsHidden ? "Show options" : "Hide options"}
          onClick={toggleHidden}
        >
          {optionsHidden ? "+" : "-"}
        </button>
      </h3>
      {optionsHidden ? null : (
        <Options state={options} dispatch={optionsDispatch} />
      )}
      <h3>Try me!</h3>
      <p>
        Search through some popular rust projects by entering your query below.
      </p>
      <input
        type="text"
        value={query}
        onChange={e => setQuery(e.target.value)}
      />

      <Results options={options} collection={packages} query={trimmedQuery} />
    </div>
  );
}
