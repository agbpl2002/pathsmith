import React from "react";
import ReactDOM from "react-dom/client";

import App from "./App";
import "./styles-old.css";

// I bootstrap the React tree from the single root element exposed by index.html.
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
