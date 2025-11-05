'use client'

import { Moon, Sun, Sparkles } from 'lucide-react'
import { useTheme } from './theme-provider'
import { useEffect, useState } from 'react'

export function EnhancedThemeToggle() {
  const { theme, toggleTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  if (!mounted) return null

  const isDark = theme === 'dark'

  return (
    <button
      onClick={toggleTheme}
      className="group relative h-12 w-12 rounded-2xl glass-card hover:scale-110
                 active:scale-95 transition-all duration-300 overflow-hidden"
      aria-label="Toggle theme"
    >
      {/* Animated background gradient */}
      <div
        className={`absolute inset-0 bg-gradient-to-br transition-opacity duration-500 ${
          isDark
            ? 'from-indigo-500/20 via-purple-500/20 to-pink-500/20 opacity-100'
            : 'from-amber-400/20 via-orange-400/20 to-yellow-400/20 opacity-100'
        }`}
      />

      {/* Floating particles effect */}
      <div className="absolute inset-0 overflow-hidden">
        {[...Array(3)].map((_, i) => (
          <div
            key={i}
            className={`absolute h-1 w-1 rounded-full animate-float ${
              isDark ? 'bg-indigo-400' : 'bg-amber-400'
            }`}
            style={{
              left: `${20 + i * 30}%`,
              top: `${30 + i * 20}%`,
              animationDelay: `${i * 0.5}s`,
              opacity: 0.6,
            }}
          />
        ))}
      </div>

      {/* Icon container */}
      <div className="relative z-10 flex h-full w-full items-center justify-center">
        {isDark ? (
          <Moon className="h-5 w-5 text-indigo-300 transition-transform group-hover:rotate-12" />
        ) : (
          <Sun className="h-5 w-5 text-amber-500 transition-transform group-hover:rotate-90" />
        )}
      </div>

      {/* Glow effect on hover */}
      <div
        className={`absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 ${
          isDark ? 'shadow-glow' : 'shadow-glow-accent'
        }`}
      />

      {/* Sparkle effect on click */}
      <Sparkles
        className="absolute top-1 right-1 h-3 w-3 text-white/50 opacity-0
                   group-active:opacity-100 group-active:animate-ping"
      />
    </button>
  )
}
