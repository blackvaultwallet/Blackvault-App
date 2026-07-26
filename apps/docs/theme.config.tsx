import type { DocsThemeConfig } from "nextra-theme-docs";

const config: DocsThemeConfig = {
  logo: (
    <span style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700, letterSpacing: "0.02em" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo.png" alt="BlackVault" width={26} height={26} style={{ borderRadius: 6 }} />
      BlackVault <span style={{ color: "#d8b45e" }}>Docs</span>
    </span>
  ),
  project: { link: "https://github.com/blackvaultwallet/Blackvault-App" },
  docsRepositoryBase: "https://github.com/blackvaultwallet/Blackvault-App",
  color: { hue: 43, saturation: 55 },
  darkMode: true,
  nextThemes: { defaultTheme: "dark" },
  footer: {
    content: (
      <span>
        © {new Date().getFullYear()} BlackVault — private banking on-chain ·{" "}
        <a href="https://app.blackvault.cash" style={{ color: "#d8b45e" }}>
          app.blackvault.cash
        </a>
      </span>
    ),
  },
  head: (
    <>
      <title>BlackVault Docs</title>
      <meta name="description" content="BlackVault documentation — private banking on Robinhood Chain." />
      <link rel="icon" href="/favicon.png" />
    </>
  ),
  editLink: { component: null },
  feedback: { content: null },
};

export default config;
