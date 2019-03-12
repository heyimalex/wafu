import React, { Component } from "react";
import Fuse from "fuse.js";
import stringify from "json-stable-stringify";

import { Wafu, WafuOptions, defaultOptions as defaultWafuOptions } from "wafu";
import { defaultCollection } from "./collection";

import { Options, useOptionsReducer } from "./Options";
import Results from "./Results";

export default function App() {
  const [options, optionsDispatch] = useOptionsReducer();
  const [query, setQuery] = React.useState("");
  const [optionsHidden, setOptionsHidden] = React.useState(true);
  const toggleHidden = React.useCallback(() => {
    setOptionsHidden(v => !v);
  }, [setOptionsHidden]);
  return (
    <div>
      <h1>wafu</h1>
      <p>
        Rust port of <a href="https://fusejs.io/">fuse.js</a>, compiled to
        webassembly.{" "}
        <a href="https://github.com/heyimalex/wafu">Check it out on github.</a>
      </p>
      <h3>
        Options{" "}
        <button onClick={toggleHidden}>{optionsHidden ? "+" : "-"}</button>
      </h3>
      {optionsHidden ? null : (
        <Options state={options} dispatch={optionsDispatch} />
      )}
      <h3>Query</h3>
      <p>Enter your query below.</p>
      <input
        type="text"
        value={query}
        onChange={e => setQuery(e.target.value)}
      />
      <Results options={options} collection={defaultCollection} query={query} />
    </div>
  );
}
