export const colors = {
    navy: {
        900: '#0b1020',
        800: '#0f172a',
        700: '#1e293b',
        600: '#334155',
        500: '#475569',
        400: '#64748b',
        300: '#94a3b8',
        200: '#cbd5e1',
        100: '#e2e8f0',
        50: '#f8fafc',
    },
    neon: {
        blue: '#3b82f6',
        teal: '#14b8a6',
        indigo: '#6366f1',
        purple: '#8b5cf6',
    }
};

export const transitions = {
    smooth: { type: "tween", ease: "easeInOut", duration: 0.3 },
    springy: { type: "spring", stiffness: 300, damping: 20 },
    slow: { type: "tween", ease: "easeInOut", duration: 0.6 },
};

export const elevations = {
    hover: "0 10px 15px -3px rgba(0, 0, 0, 0.5), 0 4px 6px -2px rgba(0, 0, 0, 0.3)",
    active: "0 4px 6px -1px rgba(0, 0, 0, 0.5), 0 2px 4px -1px rgba(0, 0, 0, 0.3)",
    glow: "0 0 15px rgba(59, 130, 246, 0.5)",
    glowPurple: "0 0 15px rgba(139, 92, 246, 0.5)",
};
