'use client';

import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { Shield, Lock, Brain, Zap, Code, GitBranch, ArrowRight } from 'lucide-react';

export default function Home() {
  const router = useRouter();

  const features = [
    {
      icon: <Lock className="h-6 w-6" />,
      title: 'Zero-Knowledge Encryption',
      description: 'End-to-end encryption with local-first architecture. Your passphrase never leaves your device.',
    },
    {
      icon: <Brain className="h-6 w-6" />,
      title: 'AI-Powered Knowledge Graphs',
      description: 'Build semantic knowledge graphs with multiple ranking models including hybrid and neural reranking.',
    },
    {
      icon: <Shield className="h-6 w-6" />,
      title: 'Cryptographically Auditable',
      description: 'Immutable audit chains verify every operation with BLAKE3 hash-linked event logs.',
    },
    {
      icon: <GitBranch className="h-6 w-6" />,
      title: 'Multi-Tenant & Isolated',
      description: 'Complete data isolation per user with Clerk authentication and Neon PostgreSQL.',
    },
    {
      icon: <Zap className="h-6 w-6" />,
      title: 'Serverless & Scalable',
      description: 'Auto-scaling across Cloudflare Workers, Google Cloud Run, and Upstash Redis.',
    },
    {
      icon: <Code className="h-6 w-6" />,
      title: 'Model Context Protocol',
      description: 'Five specialized MCP servers for seamless AI agent integration and workflow automation.',
    },
  ];

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="relative pt-32 pb-20 px-4 overflow-hidden">
        <div className="container mx-auto max-w-6xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center space-y-8"
          >
            {/* Badge */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.1 }}
              className="inline-flex items-center gap-2 px-4 py-2 glass-card rounded-full border border-primary/20"
            >
              <Shield className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium text-foreground">Privacy-First AI Knowledge Management</span>
            </motion.div>

            {/* Main Title */}
            <h1 className="text-5xl md:text-7xl font-bold text-foreground leading-tight max-w-4xl mx-auto">
              Build Knowledge Graphs with{' '}
              <span className="bg-gradient-to-r from-primary via-accent to-violet-500 bg-clip-text text-transparent">
                Zero-Knowledge Security
              </span>
            </h1>

            {/* Subtitle */}
            <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              ContextCache is a privacy-first knowledge graph engine for AI research and analysis.
              Your passphrase never leaves your device. Cloud-native, multi-tenant, and fully auditable.
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center pt-4">
              <motion.button
                onClick={() => router.push('/dashboard')}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="group px-8 py-4 bg-primary text-primary-foreground font-semibold rounded-xl
                           shadow-lg hover:shadow-xl transition-all flex items-center gap-2"
              >
                Get Started
                <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
              </motion.button>
              <motion.button
                onClick={() => window.open('https://github.com/thecontextcache/contextcache', '_blank')}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="px-8 py-4 glass-card font-semibold rounded-xl border border-border
                           hover:border-primary/50 transition-all"
              >
                View on GitHub
              </motion.button>
            </div>

            {/* Stats */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="grid grid-cols-3 gap-8 pt-16 max-w-2xl mx-auto"
            >
              {[
                { value: '256-bit', label: 'XChaCha20 Encryption' },
                { value: '5', label: 'MCP Servers' },
                { value: '100%', label: 'Open Source' },
              ].map((stat, i) => (
                <div key={i} className="text-center">
                  <div className="text-2xl md:text-3xl font-bold text-primary">{stat.value}</div>
                  <div className="text-sm text-muted-foreground mt-1">{stat.label}</div>
                </div>
              ))}
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 px-4 bg-muted/30">
        <div className="container mx-auto max-w-6xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-3xl md:text-5xl font-bold text-foreground mb-4">
              Built for Privacy and Performance
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Enterprise-grade security meets cutting-edge AI technology
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1, duration: 0.5 }}
                viewport={{ once: true }}
                whileHover={{ y: -4 }}
                className="p-6 glass-card rounded-xl border border-border hover:border-primary/30 transition-all group"
              >
                <div className="inline-flex p-3 rounded-lg bg-primary/10 text-primary mb-4 group-hover:bg-primary/20 transition-colors">
                  {feature.icon}
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-2">
                  {feature.title}
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {feature.description}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Technical Stack Section */}
      <section className="py-20 px-4">
        <div className="container mx-auto max-w-6xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-3xl md:text-5xl font-bold text-foreground mb-4">
              Modern, Production-Ready Stack
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Built with cutting-edge technologies for reliability and scale
            </p>
          </motion.div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {[
              { name: 'Next.js 15', desc: 'React Framework' },
              { name: 'FastAPI', desc: 'Python Backend' },
              { name: 'PostgreSQL', desc: 'Neon + pgvector' },
              { name: 'Cloudflare', desc: 'Edge Deployment' },
              { name: 'Clerk', desc: 'Authentication' },
              { name: 'Argon2id', desc: 'Key Derivation' },
              { name: 'XChaCha20', desc: 'Encryption' },
              { name: 'BLAKE3', desc: 'Hash Chains' },
            ].map((tech, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.05, duration: 0.4 }}
                viewport={{ once: true }}
                className="p-4 glass-card rounded-lg border border-border text-center hover:border-primary/30 transition-all"
              >
                <div className="font-semibold text-foreground">{tech.name}</div>
                <div className="text-xs text-muted-foreground mt-1">{tech.desc}</div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4">
        <div className="container mx-auto max-w-4xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true }}
            className="p-12 glass-card rounded-2xl border border-border text-center"
          >
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
              Ready to Get Started?
            </h2>
            <p className="text-lg text-muted-foreground mb-8 max-w-2xl mx-auto">
              Join researchers and teams building knowledge graphs with industry-leading security and privacy
            </p>
            <motion.button
              onClick={() => router.push('/dashboard')}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="px-8 py-4 bg-primary text-primary-foreground font-semibold rounded-xl
                         shadow-lg hover:shadow-xl transition-all inline-flex items-center gap-2"
            >
              Create Your First Project
              <ArrowRight className="h-4 w-4" />
            </motion.button>
          </motion.div>
        </div>
      </section>
    </div>
  );
}
