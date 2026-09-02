import { StrictMode, type ComponentType } from "react"
import { createRoot } from "react-dom/client"

import { AboutPage } from "@/pages/about"
import { CliPage } from "@/pages/cli"
import { ContactPage } from "@/pages/contact"
import { PrivacyPage } from "@/pages/privacy"

import "./index.css"

const pages: Record<string, ComponentType> = {
  about: AboutPage,
  contact: ContactPage,
  privacy: PrivacyPage,
  cli: CliPage,
}

const page = document.documentElement.dataset.page ?? ""
const Page = pages[page]

if (!Page) {
  throw new Error(`Unknown site page: ${page}`)
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Page />
  </StrictMode>,
)
