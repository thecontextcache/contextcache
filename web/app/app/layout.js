// SERVER COMPONENT — no "use client" directive.
// Server components are rendered to static HTML and never hydrated,
// so they cannot cause React hydration mismatches (errors #418 / #425).
// Client-side behaviour (org name, active link state) lives in the
// isolated child components OrgBadge.js and ActiveLink.js.

import OrgBadge from "./OrgBadge";
import { ActiveLink } from "./ActiveLink";

const NAV_ITEMS = [
  { href: "/app",          icon: "⬡",  label: "Dashboard",    exact: true },
  { href: "/app/api-keys", icon: "🔑", label: "API Keys" },
  { href: "/app/orgs",     icon: "🏢", label: "Organisation" },
];

export default function AppLayout({ children }) {
  return (
    <div style={{ display: "flex", width: "100%" }}>
      {/* Sidebar */}
      <aside style={{
        width: 200,
        flexShrink: 0,
        borderRight: "1px solid var(--line, rgba(255,255,255,0.08))",
        display: "flex",
        flexDirection: "column",
        paddingTop: 20,
        paddingBottom: 20,
      }}>
        {/* Workspace name — client component, reads localStorage after mount */}
        <OrgBadge />

        <nav style={{ padding: "0 8px", display: "flex", flexDirection: "column", gap: 2 }}>
          {NAV_ITEMS.map(({ href, icon, label, exact }) => (
            <ActiveLink key={href} href={href} exact={exact} icon={icon} label={label} />
          ))}
        </nav>
      </aside>

      {/* Page content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {children}
      </div>
    </div>
  );
}
