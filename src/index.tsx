import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App";
import AuthProvider from "./contexts/AuthProvider";
import RunsProvider from "./contexts/RunsProvider";
import CacheProvider from "./contexts/CacheProvider";
import { AutocompleteProvider } from "./contexts/AutocompleteProvider";
const root = ReactDOM.createRoot(
    document.getElementById("root") as HTMLElement
);
root.render(
    <React.StrictMode>
        <RunsProvider>
            <AuthProvider>
                <CacheProvider>
                    <AutocompleteProvider>
                        <App />
                    </AutocompleteProvider>
                </CacheProvider>
            </AuthProvider>
        </RunsProvider>
    </React.StrictMode>
);
