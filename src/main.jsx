import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./index.css";
// Side-effect import: arms the 15s splash failsafe at entry-chunk execution,
// independent of the lazy scene chunk (or any component) ever loading.
import "./lib/initialLoader";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
