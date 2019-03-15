import React, { useMemo, useEffect } from "react";
import Fuse from "fuse.js";

import styles from "./Results.module.css";

import { WafuUnsafe, WafuOptions, WafuMatch, WafuResult } from "wafu";

export default function Results(props: {
  query: string;
  collection: any[];
  options: WafuOptions;
}) {
  const { query, collection, options } = props;

  const wafuSearcher = useMemo(() => {
    return new WafuUnsafe(collection, options);
  }, [collection, options]);
  useEffect(() => {
    // Free on unmount.
    return () => {
      wafuSearcher.free();
    };
  }, [wafuSearcher]);

  const fuseSearcher = useMemo(() => {
    const fuseOptions = convertToFuseOptions(options);
    return new Fuse(collection, fuseOptions);
  }, [collection, options]);

  const w = useCachedResults(wafuSearcher, query);
  const f = useCachedResults(fuseSearcher, query);

  const combined = useCombinedResults(
    collection,
    w.results,
    f.results,
    options.shouldSort
  );

  const analysis = analyzeResults(combined);
  const patternLength = Array.from(query).length;

  return (
    <React.Fragment>
      <h2>Results</h2>
      <ul>
        <li>
          <PerformanceDifference wafu={w.duration} fuse={f.duration} />{" "}
          <strong>
            ({w.duration.toFixed(3)}ms vs {f.duration.toFixed(3)}ms)
          </strong>
        </li>
        <Analysis analysis={analysis} patternLength={patternLength} />
      </ul>
      <div
        style={{
          display: "flex",
          flexDirection: "column"
        }}
      >
        {combined.map((c, idx) => (
          <ResultRenderer key={idx} r={c} />
        ))}
      </div>
    </React.Fragment>
  );
}

const SameResults = (
  <React.Fragment>
    Results were <span style={{ color: "green" }}>the same</span> as Fuse
  </React.Fragment>
);
const DifferentResults = (
  <React.Fragment>
    Results were <span style={{ color: "red" }}>different</span> from Fuse
  </React.Fragment>
);

function PerformanceDifference(props: { wafu: number; fuse: number }) {
  const { wafu, fuse } = props;

  if (wafu === 0) {
    if (fuse === 0) {
      return (
        <React.Fragment>Last search was the same speed as fuse.</React.Fragment>
      );
    } else {
      return (
        <React.Fragment>
          Last search was <Green>much faster</Green> than fuse
        </React.Fragment>
      );
    }
  }

  const diff = fuse / wafu;
  const abs = Math.abs(diff);
  if (abs.toFixed(2) == "1.00") {
    return (
      <React.Fragment>Last search was the same speed as fuse</React.Fragment>
    );
  }
  let times = "";
  if (abs >= 2) {
    times = abs.toFixed(0);
  } else {
    times = abs.toFixed(2);
  }

  const className = diff < 1 ? styles.red_bold : styles.green_bold;
  return (
    <React.Fragment>
      Last search was <span className={className}>{times}x as fast</span> as
      fuse
    </React.Fragment>
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
  search(query: string, opts?: { limit?: number }): T[];
};

interface SearchResults<T = any> {
  duration: number;
  results: T[];
}

function useCachedResults<T>(
  searcher: Searcher<T>,
  query: string
): SearchResults<T> {
  return useMemo(() => {
    const start = performance.now();
    const results = searcher.search(query);
    const duration = performance.now() - start;
    return {
      duration,
      results
    };
  }, [searcher, query]);
}

interface CombinedResult {
  item: any;
  wafu?: {
    index: number;
    score: number;
    matches?: WafuMatch[];
  };
  fuse?: {
    index: number;
    score: number;
    matches?: WafuMatch[];
  };
}

interface Analyzed extends CombinedResult {
  wafuOnly: boolean;
  fuseOnly: boolean;
  indexMoved: boolean;
  indexDistance: number;
}

function useCombinedResults<T = any>(
  collection: T[],
  wafuResults: WafuResult<T>[],
  fuseResults: WafuResult<T>[],
  sort: boolean
): CombinedResult[] {
  return useMemo(() => {
    return combineResults(collection, wafuResults, fuseResults, sort);
  }, [collection, wafuResults, fuseResults, sort]);
}

function combineResults<T = any>(
  collection: T[],
  wafuResults: WafuResult<T>[],
  fuseResults: WafuResult<T>[],
  sort: boolean
): CombinedResult[] {
  const combinedMap = new Map<T, CombinedResult>();
  const combined: CombinedResult[] = [];
  wafuResults.forEach((v, idx) => {
    const result: CombinedResult = {
      item: v.item,
      wafu: {
        index: idx,
        score: v.score,
        matches: v.matches
      }
    };
    combined.push(result);
    combinedMap.set(v.item, result);
  });
  fuseResults.forEach((v, idx) => {
    const rs = combinedMap.get(v.item);
    if (rs !== undefined) {
      rs.fuse = {
        index: idx,
        score: v.score,
        matches: v.matches
      };
      return;
    }
    const result: CombinedResult = {
      item: v.item,
      fuse: {
        index: idx,
        score: v.score,
        matches: v.matches
      }
    };
    combined.push(result);
    combinedMap.set(v.item, result);
  });
  // Sort by score so that fuse results that are missing from wafu will be
  // interleaved in the appropriate position.
  if (sort) {
    combined.sort((a, b) => {
      const ascore = a.wafu ? a.wafu.score : a.fuse!.score;
      const bscore = b.wafu ? b.wafu.score : b.fuse!.score;
      return ascore - bscore;
    });
  }
  return combined;
}

function ResultRenderer(props: { r: CombinedResult }) {
  const { r } = props;

  let color: string = "white";
  if (r.wafu === undefined) {
    color = "#f8d7da";
  } else if (r.fuse === undefined) {
    color = "#d4edda";
  }

  let scoreColor = "black";
  if (r.wafu !== undefined && r.fuse !== undefined) {
    const diff = Math.abs(r.wafu.score - r.fuse.score);
    if (diff > 0) {
      if (diff < scoreChangeLimit) {
        scoreColor = "#17a2b8";
      } else {
        scoreColor = "#dc3545";
      }
    }
  }
  return (
    <div className={styles.Result} style={{ backgroundColor: color }}>
      <h3>
        <a href={r.item.html_url}>{r.item.full_name}</a>{" "}
        <small>{ItemIndex(r)}</small>
      </h3>
      <p>{r.item.description}</p>
      <h4>
        Score:{" "}
        {ItemScore(
          r.wafu ? r.wafu.score : undefined,
          r.fuse ? r.fuse.score : undefined
        )}
      </h4>
    </div>
  );
}

function ItemIndex(r: CombinedResult) {
  let className: string | undefined;
  let text: string | undefined;
  if (r.wafu === undefined) {
    text = `#${r.fuse!.index + 1} [FUSE ONLY]`;
    className = styles.red;
  } else if (r.fuse === undefined) {
    text = `#${r.wafu!.index + 1} [WAFU ONLY]`;
    className = styles.green;
  } else if (r.fuse.index !== r.wafu.index) {
    const diff = r.wafu.index - r.fuse.index;
    const direction = diff < 0 ? "UP" : "DOWN";
    const moved = `[MOVED ${direction} ${Math.abs(diff)} FROM #F${r.fuse.index +
      1}]`;
    text = `#${r.wafu.index + 1} ${moved}`;
    className = styles.yellow;
  } else {
    text = `#${r.wafu.index + 1}`;
    className = styles.muted;
  }
  return <span className={className}>{text}</span>;
}

function ItemScore(w: number | undefined, f: number | undefined) {
  if (w === undefined || f === undefined) {
    const original = w !== undefined ? w : f !== undefined ? f : undefined;
    const title = JSON.stringify(original);
    return (
      <span className={styles.red} title={title}>
        {original !== undefined ? original.toFixed(3) : "UNKNOWN SCORE"}
      </span>
    );
  }
  const diff = Math.abs(w - f);
  if (diff === 0) {
    return <span className={styles.muted}>{w.toFixed(3)}</span>;
  }

  const title = `wafu score: ${JSON.stringify(w)}\nfuse score: ${JSON.stringify(
    f
  )}\ndifference: ${JSON.stringify(diff)}`;
  if (diff <= scoreChangeLimit) {
    let diffFixed = diff.toFixed(4);
    if (diffFixed === "0.0000") {
      diffFixed = "< 0.0001";
    }
    return (
      <span className={styles.blue} title={title}>
        {w.toFixed(3)} <small>(DIFF: {diffFixed})</small>
      </span>
    );
  } else {
    return (
      <span className={styles.red} title={title}>
        {w.toFixed(3)} <small>(DIFF: {diff.toFixed(4)})</small>
      </span>
    );
  }
}

interface ResultAnalysis {
  wafuOnly: number;
  fuseOnly: number;
  indexChanged: number;
  minorScoreChange: number;
  majorScoreChange: number;
  total: number;
}

const scoreChangeLimit = 0.01;

function analyzeResults(combined: CombinedResult[]): any {
  const analysis: ResultAnalysis = {
    wafuOnly: 0,
    fuseOnly: 0,
    indexChanged: 0,
    minorScoreChange: 0,
    majorScoreChange: 0,
    total: combined.length
  };
  combined.forEach(r => {
    if (r.fuse === undefined) {
      analysis.wafuOnly += 1;
      return;
    }
    if (r.wafu === undefined) {
      analysis.fuseOnly += 1;
      return;
    }
    if (r.wafu.index !== r.fuse.index) {
      analysis.indexChanged += 1;
    }
    const scoreDiff = Math.abs(r.wafu.score - r.fuse.score);
    if (scoreDiff === 0) {
      return;
    } else if (scoreDiff < scoreChangeLimit) {
      analysis.minorScoreChange += 1;
    } else {
      analysis.majorScoreChange += 1;
    }
  });
  return analysis;
}

function Analysis(props: { analysis: ResultAnalysis; patternLength: number }) {
  const a = props.analysis;
  const mostlyEqual =
    a.wafuOnly === 0 && a.fuseOnly === 0 && a.majorScoreChange === 0;

  const equal = mostlyEqual && a.indexChanged === 0 && a.minorScoreChange === 0;
  if (equal) {
    return (
      <li>
        Results were <Green>exactly the same</Green> as fuse
      </li>
    );
  }

  const items = [];
  if (props.patternLength > 30) {
    items.push(
      <li key="overflow">
        The search string is over 32 characters{" "}
        <Yellow>so major differences are expected</Yellow>
      </li>
    );
  }
  if (mostlyEqual) {
    items.push(
      <li key="status">
        Results were <Green>mostly the same</Green> as fuse
      </li>
    );
  } else {
    items.push(
      <li key="status">
        Results were <Red>different</Red> from fuse
      </li>
    );
  }

  if (a.minorScoreChange) {
    if (a.minorScoreChange === 1) {
      items.push(
        <li key="minor">
          1 item had a <Blue>slightly different score</Blue>
        </li>
      );
    } else {
      items.push(
        <li key="minor">
          {a.minorScoreChange} items had <Blue>slightly different scores</Blue>
        </li>
      );
    }
  }
  if (a.majorScoreChange) {
    if (a.majorScoreChange === 1) {
      items.push(
        <li key="major">
          1 item had a <Red>significantly different score</Red>
        </li>
      );
    } else {
      items.push(
        <li key="major">
          {a.majorScoreChange} items had{" "}
          <Red>significantlyy different scores</Red>
        </li>
      );
    }
  }
  if (a.wafuOnly > 0) {
    if (a.wafuOnly === 1) {
      items.push(
        <li key="wonly">
          1 item was <Green>only in the wafu output</Green>
        </li>
      );
    } else {
      items.push(
        <li key="wonly">
          {a.wafuOnly} items were <Green>only in the wafu output</Green>
        </li>
      );
    }
  }
  if (a.fuseOnly > 0) {
    if (a.fuseOnly === 1) {
      items.push(
        <li key="fonly">
          1 item was <Red>only in the wafu output</Red>
        </li>
      );
    } else {
      items.push(
        <li key="fonly">
          {a.fuseOnly} items were <Red>only in the wafu output</Red>
        </li>
      );
    }
  }
  if (a.indexChanged > 0) {
    if (a.indexChanged === 1) {
      items.push(
        <li key="moved">
          1 item <Yellow>moved positions in the output</Yellow>
        </li>
      );
    } else {
      items.push(
        <li key="moved">
          {a.indexChanged} items <Yellow>moved positions in the output</Yellow>
        </li>
      );
    }
  }
  return <React.Fragment>{items}</React.Fragment>;
}

function Green(props: { children: string }) {
  return <span className={styles.green_bold}>{props.children}</span>;
}

function Red(props: { children: string }) {
  return <span className={styles.red_bold}>{props.children}</span>;
}

function Blue(props: { children: string }) {
  return <span className={styles.blue_bold}>{props.children}</span>;
}

function Yellow(props: { children: string }) {
  return <span className={styles.yellow_bold}>{props.children}</span>;
}
