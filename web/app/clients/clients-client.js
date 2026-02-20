"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { Terminal, Code2, Chrome, ArrowRight, Download } from "lucide-react";

const CLIENTS = [
    {
        id: "cli",
        title: "Python CLI (cc)",
        icon: <Terminal size={32} color="#00E5A0" />,
        color: "#00E5A0",
        description: "The official command-line interface. Ideal for scripting, CI pipelines, and rapid terminal capture.",
        installCode: "cd cli && pip install -e .",
        features: ["Instant memory commits", "Bulk history backfill", "Manage API Keys"],
        cta: "View Documentation",
        href: "/docs#cli" // Assuming a generic docs anchor for now
    },
    {
        id: "vscode",
        title: "VS Code / Cursor",
        icon: <Code2 size={32} color="#00D4FF" />,
        color: "#00D4FF",
        description: "Connect your IDE context window directly to your project brain. Recall code architecture without switching tabs.",
        installCode: "Coming soon to Marketplace",
        features: ["Automatic .cursorrules generation", "Inline recall snippets", "Syntax-aware context"],
        cta: "Join Waitlist",
        href: "/waitlist"
    },
    {
        id: "chrome",
        title: "Browser Extension",
        icon: <Chrome size={32} color="#7C3AFF" />,
        color: "#7C3AFF",
        description: "Capture findings from Jira, GitHub, or StackOverflow directly into the project brain with one click.",
        installCode: "Coming soon to Web Store",
        features: ["Highlight to capture", "Auto-attaches URL metadata", "Syncs instantly"],
        cta: "Join Waitlist",
        href: "/waitlist"
    }
];

export default function ClientsClient() {
    const containerVariants = {
        hidden: { opacity: 0 },
        show: {
            opacity: 1,
            transition: { staggerChildren: 0.15 }
        }
    };

    const itemVariants = {
        hidden: { opacity: 0, y: 30 },
        show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } }
    };

    return (
        <>
            <section className="l-hero" style={{ minHeight: "50vh", paddingBottom: 60, paddingTop: 120 }}>
                <div className="l-grid-bg" />
                <div
                    className="l-glow-blob"
                    style={{
                        width: 700, height: 700,
                        background: "radial-gradient(circle, rgba(124,58,255,0.15) 0%, transparent 60%)",
                        top: "-20%", left: "50%",
                        transform: "translateX(-50%)"
                    }}
                />

                <motion.div
                    className="l-badge"
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8 }}
                >
                    <span className="l-badge-dot" />
                    Ecosystem Clients
                </motion.div>

                <motion.h1
                    className="l-title"
                    initial={{ opacity: 0, y: 30, filter: "blur(8px)" }}
                    animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                    transition={{ duration: 1, delay: 0.1, ease: "easeOut" }}
                    style={{ fontSize: "clamp(2.4rem, 6vw, 4.5rem)" }}
                >
                    <span className="l-title-white">Connect every tool to your </span>
                    <span className="l-title-grad" style={{ background: "linear-gradient(135deg, #00E5FF 0%, #00E5A0 100%)", WebkitBackgroundClip: "text", color: "transparent" }}>Project Brain.</span>
                </motion.h1>

                <motion.p
                    className="l-tagline"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 1, delay: 0.25, ease: "easeOut" }}
                    style={{ maxWidth: 700 }}
                >
                    TheContextCache is built to be everywhere you work. Download the official clients to seamlessly integrate memory capture and recall into your terminal, IDE, and browser.
                </motion.p>
            </section>

            <div className="l-section" style={{ paddingTop: 0 }}>
                <motion.div
                    className="clients-grid"
                    variants={containerVariants}
                    initial="hidden"
                    animate="show"
                    style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
                        gap: 32,
                        maxWidth: 1200,
                        margin: "0 auto",
                        padding: "0 24px"
                    }}
                >
                    {CLIENTS.map((client) => (
                        <motion.div
                            key={client.id}
                            variants={itemVariants}
                            className="card"
                            style={{
                                display: "flex",
                                flexDirection: "column",
                                background: "rgba(14, 18, 30, 0.4)",
                                backdropFilter: "blur(40px)",
                                border: "1px solid rgba(255, 255, 255, 0.05)",
                                padding: 40,
                                position: "relative",
                                overflow: "hidden"
                            }}
                        >
                            {/* Subtle background glow based on client color */}
                            <div
                                style={{
                                    position: "absolute",
                                    top: -50,
                                    right: -50,
                                    width: 150,
                                    height: 150,
                                    borderRadius: "50%",
                                    background: `${client.color}15`,
                                    filter: "blur(40px)",
                                    pointerEvents: "none"
                                }}
                            />

                            <div style={{ marginBottom: 24, display: "flex", alignItems: "center", gap: 16 }}>
                                <div style={{
                                    width: 64,
                                    height: 64,
                                    borderRadius: 16,
                                    background: "rgba(5, 7, 12, 0.8)",
                                    border: `1px solid ${client.color}30`,
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    boxShadow: `0 8px 32px ${client.color}15`
                                }}>
                                    {client.icon}
                                </div>
                                <h2 style={{ fontSize: "1.5rem", margin: 0 }}>{client.title}</h2>
                            </div>

                            <p style={{ color: "var(--ink-2)", lineHeight: 1.6, flexGrow: 1, minHeight: 80 }}>
                                {client.description}
                            </p>

                            <div style={{ margin: "24px 0" }}>
                                <div style={{
                                    background: "rgba(0,0,0,0.5)",
                                    border: "1px solid rgba(255,255,255,0.1)",
                                    borderRadius: 8,
                                    padding: "16px",
                                    fontFamily: "var(--mono)",
                                    fontSize: "0.85rem",
                                    color: client.color,
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "space-between"
                                }}>
                                    <code>{client.installCode}</code>
                                    <Download size={16} color="var(--ink-3)" />
                                </div>
                            </div>

                            <ul style={{ listStyle: "none", padding: 0, margin: "0 0 32px 0", gap: 12, display: "flex", flexDirection: "column" }}>
                                {client.features.map(f => (
                                    <li key={f} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: "0.9rem", color: "var(--ink)" }}>
                                        <div style={{ width: 6, height: 6, borderRadius: "50%", background: client.color }} />
                                        {f}
                                    </li>
                                ))}
                            </ul>

                            <Link
                                href={client.href}
                                style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: 8,
                                    color: client.color,
                                    fontWeight: 600,
                                    textDecoration: "none",
                                    marginTop: "auto",
                                    padding: "12px 0",
                                    transition: "gap 0.2s ease"
                                }}
                                className="client-link-hover"
                            >
                                {client.cta} <ArrowRight size={18} />
                            </Link>
                        </motion.div>
                    ))}
                </motion.div>
            </div>

            <style jsx global>{`
        .client-link-hover:hover {
          gap: 14px !important;
          text-shadow: 0 0 12px currentColor;
        }
      `}</style>

            {/* Bottom spacer */}
            <div style={{ height: 60 }} />
        </>
    );
}
