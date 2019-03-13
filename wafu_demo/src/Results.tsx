import React, { useMemo } from "react";
import Fuse from "fuse.js";
import stringify from "json-stable-stringify";

import { Wafu, WafuOptions } from "wafu";

export default function Results(props: {
  query: string;
  collection: any[];
  options: WafuOptions;
}) {
  const { query, collection, options } = props;

  const wafuSearcher = useMemo(() => {
    return new Wafu(collection, options);
  }, [collection, options]);

  const fuseSearcher = useMemo(() => {
    const fuseOptions = convertToFuseOptions(options);
    return new Fuse(collection, fuseOptions);
  }, [collection, options]);

  const w = useCachedResults(wafuSearcher, query);
  const f = useCachedResults(fuseSearcher, query);

  return (
    <React.Fragment>
      <h2>Results</h2>
      <p>
        <PerformanceDifference wafu={w.duration} fuse={f.duration} />
      </p>
      <div
        style={{
          display: "flex",
          flexDirection: "row"
        }}
      >
        <SearchResults label="wafu" results={w} />
        <SearchResults label="fuse" results={f} />
      </div>
    </React.Fragment>
  );
}

function PerformanceDifference(props: { wafu: number; fuse: number }) {
  const { wafu, fuse } = props;

  if (fuse === 0) {
    if (wafu === 0) {
      return (
        <React.Fragment>Last search was the same speed as fuse.</React.Fragment>
      );
    } else {
      return (
        <React.Fragment>
          Last search was <span style={{ color: "red" }}>slower</span> than
          fuse.
        </React.Fragment>
      );
    }
  }

  const diff = ((fuse - wafu) / fuse) * 100;
  const abs = Math.abs(diff).toFixed(2);
  if (abs == "0.00") {
    return (
      <React.Fragment>Last search was the same speed as fuse.</React.Fragment>
    );
  }
  const change = diff < 0 ? "slower" : "faster";
  const color = diff < 0 ? "red" : "green";
  return (
    <React.Fragment>
      Last search was{" "}
      <span style={{ color }}>
        {abs}% {change}
      </span>{" "}
      than fuse.
    </React.Fragment>
  );
}

function SearchResults(props: { label: string; results: SearchResults }) {
  return (
    <div style={{ flexGrow: 1 }}>
      <h4>
        {props.label} duration: {props.results.duration.toFixed(3)}ms,{" "}
        {props.results.results.length} results
      </h4>
      <pre>{props.results.serialized}</pre>
    </div>
  );
}

function convertToFuseOptions(opts: WafuOptions): Fuse.FuseOptions<any> {
  return {
    // These are sort of "hardcoded" in wafu, so we set them here.
    id: undefined,
    verbose: false,
    maxPatternLength: 32,
    findAllMatches: true,
    includeScore: true,
    sortFn: undefined,

    // These are effectively the same as in wafu, though a couple of our types
    // are defined a little differently so we need to type assert to any to
    // get around it.
    location: opts.location,
    distance: opts.distance,
    threshold: opts.threshold,
    caseSensitive: opts.caseSensitive,
    keys: opts.keys as any,
    shouldSort: opts.shouldSort,
    getFn: opts.getFn,
    includeMatches: opts.includeMatches,
    minMatchCharLength: opts.minMatchCharLength,
    tokenize: opts.tokenize,
    tokenSeparator: opts.tokenSeparator as any,
    matchAllTokens: opts.matchAllTokens
  };
}

type Searcher<T = any> = {
  search(query: string): T[];
};

interface SearchResults<T = any> {
  duration: number;
  results: T[];
  serialized: string;
}

function useCachedResults<T>(
  searcher: Searcher<T>,
  query: string
): SearchResults<T> {
  return useMemo(() => {
    const start = performance.now();
    const results = searcher.search(query);
    const duration = performance.now() - start;
    const serialized = stringify(results, { space: 2 });
    return {
      duration,
      results,
      serialized
    };
  }, [searcher, query]);
}
