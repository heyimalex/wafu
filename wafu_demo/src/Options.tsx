import React, { useReducer, useState, useCallback } from "react";

import { WafuOptions, defaultOptions as defaultWafuOptions } from "wafu";

// The default options we're actually going to use in the ui.
const defaultOptions: WafuOptions = {
  ...defaultWafuOptions,
  keys: ["title", "author.firstName"],
  tokenize: true
};

type BoolPropertyNames<T> = {
  [K in keyof T]: T[K] extends boolean ? K : never
}[keyof T];

type NumericPropertyNames<T> = {
  [K in keyof T]: T[K] extends number ? K : never
}[keyof T];

type Action =
  | {
      type: "TOGGLE_OPTION";
      payload: {
        key: BoolPropertyNames<WafuOptions>;
      };
    }
  | {
      type: "SET_OPTION";
      payload: {
        key: NumericPropertyNames<WafuOptions>;
        value: number;
      };
    }
  | {
      type: "ADD_KEY";
      payload: {
        key: string;
      };
    }
  | {
      type: "REMOVE_KEY";
      payload: {
        key: string;
      };
    }
  | {
      type: "SET_KEY_WEIGHT";
      payload: {
        key: string;
        weight: number;
      };
    };

function reducer(state: WafuOptions, action: Action): WafuOptions {
  switch (action.type) {
    case "TOGGLE_OPTION":
      return {
        ...state,
        [action.payload.key]: !state[action.payload.key]
      };
    case "SET_OPTION":
      if (state[action.payload.key] === action.payload.value) {
        return state;
      }
      return {
        ...state,
        [action.payload.key]: action.payload.value
      };
    case "ADD_KEY":
      const newKey = action.payload.key.trim();
      if (newKey === "" || keyExists(state.keys, newKey)) {
        return state;
      }
      return {
        ...state,
        keys: [...state.keys, { name: newKey, weight: 1 }]
      };
    case "REMOVE_KEY":
      const keyToRemove = action.payload.key;
      if (!keyExists(state.keys, keyToRemove)) {
        return state;
      }
      return {
        ...state,
        keys: state.keys.filter(k =>
          typeof k === "string" ? k !== keyToRemove : k.name !== keyToRemove
        )
      };
    case "SET_KEY_WEIGHT":
      if (action.payload.weight <= 0 || action.payload.weight > 1) {
        return state;
      }
      const keyToUpdate = action.payload.key;
      const index = state.keys.findIndex(k =>
        typeof k === "string" ? k === keyToUpdate : k.name === keyToUpdate
      );
      if (index === -1) return state;
      const nextKeys = [...state.keys];
      nextKeys[index] = {
        name: keyToUpdate,
        weight: action.payload.weight
      };
      return {
        ...state,
        keys: nextKeys
      };
    default:
      return state;
  }
}

function keyExists(keys: WafuOptions["keys"], key: string): boolean {
  return keys.some(k => (typeof k === "string" ? k === key : k.name === key));
}

function BoolInput(props: {
  label: string;
  optkey: BoolPropertyNames<WafuOptions>;
  state: WafuOptions;
  dispatch: React.Dispatch<Action>;
}) {
  const onChange = useCallback(() => {
    props.dispatch({
      type: "TOGGLE_OPTION",
      payload: {
        key: props.optkey
      }
    });
  }, [props.dispatch, props.optkey]);
  return (
    <li>
      <input
        aria-label={props.label}
        type="checkbox"
        checked={props.state[props.optkey]}
        onChange={onChange}
      />{" "}
      {props.label}
    </li>
  );
}

function NumericInput(props: {
  label: string;
  optkey: NumericPropertyNames<WafuOptions>;
  state: WafuOptions;
  dispatch: React.Dispatch<Action>;
  min?: number;
  max?: number;
  step?: number;
}) {
  const onChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const parsed = parseFloat(e.target.value);
      if (Number.isNaN(parsed)) return;
      props.dispatch({
        type: "SET_OPTION",
        payload: {
          key: props.optkey,
          value: parsed
        }
      });
    },
    [props.dispatch, props.optkey]
  );
  return (
    <li>
      <input
        aria-label={props.label}
        type="number"
        value={props.state[props.optkey]}
        onChange={onChange}
        step={props.step}
        min={props.min}
        max={props.max}
      />{" "}
      {props.label}
    </li>
  );
}

function KeysList(props: {
  state: WafuOptions;
  dispatch: React.Dispatch<Action>;
}) {
  return (
    <li>
      Keys:
      <ul>
        {props.state.keys.map(k => {
          const key = typeof k === "string" ? { name: k, weight: 1 } : k;
          return (
            <KeyListItem
              key={key.name}
              name={key.name}
              weight={key.weight}
              dispatch={props.dispatch}
            />
          );
        })}
        <li key="____add_key_input">
          <AddKeyInput dispatch={props.dispatch} />
        </li>
      </ul>
    </li>
  );
}

function KeyListItem(props: {
  name: string;
  weight: number;
  dispatch: React.Dispatch<Action>;
}) {
  const onChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const parsed = parseFloat(e.target.value);
      if (Number.isNaN(parsed)) return;
      props.dispatch({
        type: "SET_KEY_WEIGHT",
        payload: {
          key: props.name,
          weight: parsed
        }
      });
    },
    [props.dispatch, props.name]
  );
  const onRemove = useCallback(() => {
    props.dispatch({
      type: "REMOVE_KEY",
      payload: {
        key: props.name
      }
    });
  }, [props.dispatch, props.name]);
  return (
    <li>
      <strong>{JSON.stringify(props.name)}</strong>{" "}
      <ul>
        <li>
          weight:{" "}
          <input
            type="number"
            value={props.weight}
            onChange={onChange}
            min={0}
            max={1}
            step={0.1}
          />
        </li>
        <li>
          <button onClick={onRemove}>Remove</button>
        </li>
      </ul>
    </li>
  );
}

function AddKeyInput(props: { dispatch: React.Dispatch<Action> }) {
  const [value, setValue] = useState("");
  const onAdd = useCallback(() => {
    props.dispatch({
      type: "ADD_KEY",
      payload: {
        key: value
      }
    });
    setValue("");
  }, [value, setValue, props.dispatch]);
  const onChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setValue(e.target.value);
    },
    [setValue]
  );
  const addIsDisabled = value.trim() === "";
  return (
    <li>
      <input type="text" value={value} onChange={onChange} />
      <button onClick={onAdd} disabled={addIsDisabled}>
        Add
      </button>
    </li>
  );
}

export function useOptionsReducer(): [WafuOptions, React.Dispatch<Action>] {
  return useReducer(reducer, defaultOptions);
}

export function Options(props: {
  state: WafuOptions;
  dispatch: React.Dispatch<Action>;
}) {
  return (
    <ul>
      <BoolInput
        label={"Case sensitive"}
        state={props.state}
        dispatch={props.dispatch}
        optkey={"caseSensitive"}
      />
      <BoolInput
        label={"Sort"}
        state={props.state}
        dispatch={props.dispatch}
        optkey={"shouldSort"}
      />
      <BoolInput
        label={"Tokenize"}
        state={props.state}
        dispatch={props.dispatch}
        optkey={"tokenize"}
      />
      <BoolInput
        label={"Match all tokens"}
        state={props.state}
        dispatch={props.dispatch}
        optkey={"matchAllTokens"}
      />
      <BoolInput
        label={"Include matches"}
        state={props.state}
        dispatch={props.dispatch}
        optkey={"includeMatches"}
      />
      <NumericInput
        label={"Threshold"}
        state={props.state}
        dispatch={props.dispatch}
        optkey={"threshold"}
        min={0}
        max={1}
        step={0.1}
      />
      <NumericInput
        label={"Distance"}
        state={props.state}
        dispatch={props.dispatch}
        optkey={"distance"}
        min={0}
        max={1000}
        step={1}
      />
      <NumericInput
        label={"Location"}
        state={props.state}
        dispatch={props.dispatch}
        optkey={"location"}
        min={0}
        max={1000}
        step={1}
      />
      <NumericInput
        label={"Min match char length"}
        state={props.state}
        dispatch={props.dispatch}
        optkey={"minMatchCharLength"}
        min={1}
        max={100}
        step={1}
      />
      <KeysList state={props.state} dispatch={props.dispatch} />
    </ul>
  );
}
