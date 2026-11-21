import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import { I18nProvider } from "./i18n.jsx";
import { AppStateProvider } from "./state.jsx";
import "./index.css";
import "leaflet/dist/leaflet.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <I18nProvider>
        <AppStateProvider>
          <App />
        </AppStateProvider>
      </I18nProvider>
    </BrowserRouter>
  </React.StrictMode>
);
