import React from "react";
import ReactDOM from "react-dom";
import "./index.css";

import("./App").then(app => {
  const App = app.default;
  ReactDOM.render(<App />, document.getElementById("root"));
});
