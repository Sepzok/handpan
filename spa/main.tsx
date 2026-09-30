import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HandpanApp } from "@/components/HandpanApp";
import "@/app/globals.css";

const root = document.getElementById("root");
if (!root) {
  throw new Error("Missing #root");
}

createRoot(root).render(
  <StrictMode>
    <HandpanApp />
  </StrictMode>,
);
