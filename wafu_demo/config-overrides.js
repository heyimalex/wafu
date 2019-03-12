const path = require("path");

// Makes create-react-app load wasm. Taken from here:
// https://prestonrichey.com/blog/react-rust-wasm/ though adding wasm-loader
// as a dep actually broke things. I think that webpack has support for
// loading it out of the box?
module.exports = function override(config, env) {
  const wasmExtensionRegExp = /\.wasm$/;

  config.resolve.extensions.push(".wasm");

  config.module.rules.forEach(rule => {
    (rule.oneOf || []).forEach(oneOf => {
      if (oneOf.loader && oneOf.loader.indexOf("file-loader") >= 0) {
        // Make file-loader ignore WASM files
        oneOf.exclude.push(wasmExtensionRegExp);
      }
    });
  });

  return config;
};
