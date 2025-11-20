'use client';

import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { Shield, Lock, Brain, Zap, Code, GitBranch, ArrowRight, Sparkles } from 'lucide-react';

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
      description: 'Build semantic knowledge graphs with multiple AI providers including HuggingFace, Ollama, and OpenAI.',
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
      description: 'Specialized MCP servers for seamless AI agent integration and workflow automation.',
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <section className="relative pt-32 pb-20 px-4 overflow-hidden">
        {/* Background gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-secondary/5 to-transparent" />
        
        <div className="container mx-auto max-w-6xl relative">
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
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-primary/20 bg-primary/5"
            >
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium text-foreground">Privacy-First AI Knowledge Management</span>
            </motion.div>

            {/* Main Title */}
            <h1 className="text-5xl md:text-7xl font-bold text-foreground leading-tight max-w-4xl mx-auto">
              Build Knowledge Graphs with{' '}
              <span className="bg-gradient-primary bg-clip-text text-transparent">
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
                className="group px-8 py-4 bg-gradient-primary text-white font-semibold rounded-xl
                           shadow-lg hover:shadow-xl transition-all flex items-center gap-2"
              >
                Get Started
                <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
              </motion.button>
              <motion.button
                onClick={() => window.open('https://github.com/thecontextcache/contextcache', '_blank')}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="px-8 py-4 bg-card border border-border font-semibold rounded-xl
                           hover:border-primary/50 transition-all"
              >
                View Documentation
              </motion.button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-20 px-4 bg-card/50">
        <div className="container mx-auto max-w-6xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center mb-16"
          >
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
              Enterprise-Grade Features
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Built for researchers, analysts, and teams who need AI-powered answers they can trust and verify.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: index * 0.1 }}
                className="group p-6 rounded-xl bg-card border border-border hover:border-primary/50 
                           hover:shadow-lg transition-all duration-300"
              >
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-lg 
                                bg-gradient-primary text-white mb-4 group-hover:scale-110 transition-transform">
                  {feature.icon}
                </div>
                <h3 className="text-xl font-semibold text-foreground mb-2">
                  {feature.title}
                </h3>
                <p className="text-muted-foreground leading-relaxed">
                  {feature.description}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Technology Stack */}
      <section className="py-20 px-4">
        <div className="container mx-auto max-w-6xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center"
          >
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
              Modern Technology Stack
            </h2>
            <p className="text-lg text-muted-foreground mb-12 max-w-2xl mx-auto">
              Built with cutting-edge technologies for performance, security, and scalability.
            </p>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              {[
                { name: 'Next.js 15', category: 'Frontend' },
                { name: 'FastAPI', category: 'Backend' },
                { name: 'PostgreSQL', category: 'Database' },
                { name: 'Redis', category: 'Cache' },
                { name: 'Cloudflare', category: 'Edge' },
                { name: 'Cloud Run', category: 'Compute' },
                { name: 'Clerk', category: 'Auth' },
                { name: 'pgvector', category: 'Embeddings' },
              ].map((tech, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, scale: 0.9 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.4, delay: index * 0.05 }}
                  className="p-4 rounded-lg bg-card border border-border hover:border-secondary/50 
                             transition-all text-center"
                >
                  <p className="font-semibold text-foreground">{tech.name}</p>
                  <p className="text-sm text-muted-foreground mt-1">{tech.category}</p>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4 bg-gradient-primary">
        <div className="container mx-auto max-w-4xl text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="space-y-6"
          >
            <h2 className="text-3xl md:text-4xl font-bold text-white">
              Ready to Get Started?
            </h2>
            <p className="text-lg text-white/90 max-w-2xl mx-auto">
              Create your first project and start building your private knowledge graph today.
            </p>
            <motion.button
              onClick={() => router.push('/dashboard')}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="px-8 py-4 bg-white text-primary font-semibold rounded-xl
                         shadow-lg hover:shadow-xl transition-all inline-flex items-center gap-2"
            >
              Start Building
              <ArrowRight className="h-5 w-5" />
            </motion.button>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-4 border-t border-border bg-card/50">
        <div className="container mx-auto max-w-6xl">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-center md:text-left">
            <div>
              <h3 className="font-semibold text-foreground mb-3">ContextCache</h3>
              <p className="text-sm text-muted-foreground">
                Privacy-first knowledge graphs for AI research and analysis.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-foreground mb-3">Resources</h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><a href="/docs" className="hover:text-primary transition-colors">Documentation</a></li>
                <li><a href="https://github.com/thecontextcache/contextcache" className="hover:text-primary transition-colors">GitHub</a></li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold text-foreground mb-3">Legal</h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><a href="/LICENSE" className="hover:text-primary transition-colors">License</a></li>
                <li><a href="/SECURITY.md" className="hover:text-primary transition-colors">Security</a></li>
              </ul>
            </div>
          </div>
          <div className="mt-8 pt-8 border-t border-border text-center text-sm text-muted-foreground">
            <p>© 2024-2025 ContextCache. All rights reserved. Proprietary software.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
