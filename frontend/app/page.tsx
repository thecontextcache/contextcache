'use client';

import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { Sparkles, Shield, Brain, Lock, Zap, LineChart } from 'lucide-react';

export default function Home() {
  const router = useRouter();

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Floating orbs background */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-20 left-10 w-96 h-96 rounded-full bg-gradient-to-r from-indigo-500/20 to-purple-500/20 blur-3xl animate-float" />
        <div className="absolute bottom-20 right-10 w-96 h-96 rounded-full bg-gradient-to-r from-pink-500/20 to-violet-500/20 blur-3xl animate-float" style={{ animationDelay: '1s' }} />
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full bg-gradient-to-r from-cyan-500/10 to-blue-500/10 blur-3xl animate-spin-slow" />
      </div>

      <div className="container mx-auto px-4 py-20 relative z-10">
        {/* Hero Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="max-w-4xl mx-auto text-center space-y-8"
        >
          {/* Logo */}
          <motion.div
            initial={{ scale: 0.8 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="mb-6 flex justify-center"
          >
            <img 
              src="/logo.png" 
              alt="ContextCache Logo" 
              className="w-24 h-24 md:w-32 md:h-32 object-contain drop-shadow-xl"
            />
          </motion.div>

          {/* Badge */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.1 }}
            className="inline-flex items-center gap-2 px-4 py-2 glass-card rounded-full"
          >
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">Zero-Knowledge AI Knowledge Graphs</span>
          </motion.div>

          {/* Title */}
          <h1 className="text-5xl md:text-8xl font-bold bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 dark:from-indigo-400 dark:via-purple-400 dark:to-pink-400 bg-clip-text text-transparent leading-tight">
            ContextCache
          </h1>

          {/* Subtitle */}
          <p className="text-xl md:text-3xl text-foreground/80 font-semibold max-w-3xl mx-auto leading-snug">
            Your Knowledge, <span className="gradient-mesh bg-clip-text text-transparent">Encrypted</span> & <span className="bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">Private</span>
          </p>

          {/* Description */}
          <p className="text-base md:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Build traceable knowledge graphs with <span className="text-primary font-semibold">zero-knowledge encryption</span>. Your passphrase never leaves your device. Cloud-native, multi-tenant, and fully auditable.
          </p>

          {/* CTA Buttons */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="flex flex-col sm:flex-row gap-4 justify-center items-center pt-8"
          >
            <motion.button
              onClick={() => router.push('/dashboard')}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="group relative px-8 py-4 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500
                         text-white font-semibold rounded-2xl shadow-lg shadow-indigo-500/30
                         hover:shadow-indigo-500/50 transition-all overflow-hidden"
            >
              <span className="relative z-10 flex items-center gap-2">
                Get Started
                <Sparkles className="h-4 w-4 animate-pulse" />
              </span>
              <div className="absolute inset-0 bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 opacity-0 group-hover:opacity-100 transition-opacity" />
            </motion.button>
            <motion.button
              onClick={() => window.open('https://github.com/thecontextcache/contextcache', '_blank')}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="px-8 py-4 glass-card font-semibold rounded-2xl hover:shadow-glow transition-all"
            >
              View on GitHub
            </motion.button>
          </motion.div>

          {/* Features Grid */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
            className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-16"
          >
            {[
              {
                icon: <Lock className="h-8 w-8" />,
                color: 'from-indigo-500 to-purple-500',
                title: 'Zero-Knowledge',
                description: 'End-to-end encryption with local-first architecture',
              },
              {
                icon: <Brain className="h-8 w-8" />,
                color: 'from-purple-500 to-pink-500',
                title: 'AI-Powered',
                description: 'Multiple ranking models including hybrid and neural reranking',
              },
              {
                icon: <Shield className="h-8 w-8" />,
                color: 'from-pink-500 to-violet-500',
                title: 'Auditable',
                description: 'Cryptographic chains verify every operation transparently',
              },
            ].map((feature, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.7 + i * 0.1 }}
                whileHover={{ y: -5 }}
                className="group relative p-6 glass-card rounded-2xl hover:shadow-glow transition-all"
              >
                <div className={`inline-flex p-3 rounded-xl bg-gradient-to-br ${feature.color} text-white mb-4 shadow-lg`}>
                  {feature.icon}
                </div>
                <h3 className="text-lg font-bold mb-2">
                  {feature.title}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {feature.description}
                </p>
                {/* Hover effect */}
                <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity"
                     style={{ boxShadow: '0 0 40px rgba(var(--primary), 0.2)' }} />
              </motion.div>
            ))}
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}