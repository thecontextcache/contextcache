'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';

export default function ConstructionPage() {
  const [dots, setDots] = useState('');

  useEffect(() => {
    const interval = setInterval(() => {
      setDots((prev) => (prev.length >= 3 ? '' : prev + '.'));
    }, 500);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 px-4">
      {/* Logo */}
      <div className="mb-8 animate-pulse">
        <Image
          src="/logo.png"
          alt="ContextCache"
          width={120}
          height={120}
          className="rounded-2xl"
        />
      </div>

      {/* Title */}
      <h1 className="text-5xl font-bold bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent mb-4">
        ContextCache
      </h1>

      {/* Tagline */}
      <p className="text-xl text-slate-400 mb-8">
        Privacy-First Memory Engine for AI Research
      </p>

      {/* Construction Message */}
      <div className="text-center max-w-2xl px-8">
        <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-2xl p-8 mb-8">
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="w-3 h-3 bg-cyan-500 rounded-full animate-ping" />
            <h2 className="text-2xl font-semibold text-slate-200">
              Building Something Special{dots}
            </h2>
          </div>

          <p className="text-slate-400 leading-relaxed mb-6">
            We're crafting a privacy-first memory engine that transforms documents into
            traceable, explainable knowledge. Every fact will have provenance, every answer
            will be auditable.
          </p>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="bg-slate-900/50 rounded-lg p-4">
              <div className="text-cyan-400 font-semibold mb-1">✓ Phase 1–3</div>
              <div className="text-slate-500">Backend Complete</div>
            </div>
            <div className="bg-slate-900/50 rounded-lg p-4 border-2 border-cyan-500/30">
              <div className="text-cyan-400 font-semibold mb-1">→ Phase 4</div>
              <div className="text-slate-500">UI In Progress</div>
            </div>
          </div>
        </div>

        {/* Status Links */}
        <div className="flex gap-6 justify-center text-sm">
          <a
            href="https://github.com/thecontextcache/contextcache"
            target="_blank"
            rel="noopener noreferrer"
            className="text-slate-400 hover:text-cyan-400 transition-colors flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 0C5.373 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386C24 5.373 18.627 0 12 0z" />
            </svg>
            GitHub
          </a>

          <a
            href="https://thecontextcache.bsky.social"
            target="_blank"
            rel="noopener noreferrer"
            className="text-slate-400 hover:text-cyan-400 transition-colors flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2L2 7v10c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-10-5z" />
            </svg>
            BlueSky
          </a>
        </div>

        {/* Estimated Launch */}
        <p className="text-slate-600 text-xs mt-8">Alpha Release: Coming Soon</p>
      </div>
    </div>
  );
}
