import React from "react";
import ReactDOM from "react-dom/client";
import { I18nextProvider } from "react-i18next";
import { registerSW } from "virtual:pwa-register";
import App from "./App";
import { ThemeProvider } from "./contexts/ThemeContext";
import i18n from "./i18n";
import { setPWAUpdateHandler } from "./services/updateService";
import "./index.css";

const updateSW = registerSW({ immediate: true });
setPWAUpdateHandler(updateSW);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <I18nextProvider i18n={i18n}>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </I18nextProvider>
  </React.StrictMode>,
);
