import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import { DocsPage } from "@/pages/docs"

import "./index.css"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <DocsPage />
  </StrictMode>,
)
