'use client';

import { motion } from 'framer-motion';
import { Shield, Lock, Key, AlertTriangle } from 'lucide-react';

export default function SecurityPage() {
  return (
    <div className="min-h-screen bg-background py-20 px-4">
      <div className="container mx-auto max-w-4xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-8"
        >
          {/* Header */}
          <div className="text-center mb-12">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
              <Shield className="h-8 w-8 text-primary" />
            </div>
            <h1 className="text-4xl font-bold mb-4">Security & Privacy</h1>
            <p className="text-muted-foreground text-lg">
              How ContextCache™ protects your data
            </p>
          </div>

          {/* Security Measures */}
          <div className="bg-card border border-border rounded-lg p-8 space-y-6">
            <div className="flex items-start gap-4">
              <Lock className="h-6 w-6 text-primary mt-1" />
              <div>
                <h2 className="text-xl font-semibold mb-2">End-to-End Encryption</h2>
                <p className="text-muted-foreground">
                  All your data is encrypted using XChaCha20-Poly1305 encryption with your master key. 
                  Your master key never leaves your device and is never sent to our servers.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <Key className="h-6 w-6 text-primary mt-1" />
              <div>
                <h2 className="text-xl font-semibold mb-2">Key Derivation</h2>
                <p className="text-muted-foreground">
                  We use Argon2id for key derivation, which is resistant to GPU cracking attacks. 
                  Each user has a unique salt stored securely in our database.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <Shield className="h-6 w-6 text-primary mt-1" />
              <div>
                <h2 className="text-xl font-semibold mb-2">Zero-Knowledge Architecture</h2>
                <p className="text-muted-foreground">
                  We implement a zero-knowledge architecture where the server never has access to your 
                  unencrypted data. All encryption and decryption happens on your device.
                </p>
              </div>
            </div>
          </div>

          {/* Third-Party Disclaimer */}
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-6">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-6 w-6 text-yellow-600 dark:text-yellow-500 mt-1 flex-shrink-0" />
              <div>
                <h3 className="font-semibold text-yellow-900 dark:text-yellow-100 mb-2">
                  Third-Party Services Disclaimer
                </h3>
                <p className="text-sm text-yellow-800 dark:text-yellow-200 mb-3">
                  ContextCache™ uses various third-party services and tools for development, deployment, 
                  and operation including but not limited to:
                </p>
                <ul className="text-sm text-yellow-800 dark:text-yellow-200 space-y-1 ml-4 list-disc">
                  <li>Cloudflare (Frontend hosting & CDN)</li>
                  <li>Google Cloud Run (Backend hosting)</li>
                  <li>Neon (PostgreSQL database)</li>
                  <li>Upstash (Redis cache)</li>
                  <li>Clerk (Authentication)</li>
                  <li>HuggingFace (AI embeddings)</li>
                </ul>
                <p className="text-sm text-yellow-800 dark:text-yellow-200 mt-3 font-medium">
                  In the event that any of these third-party services experience security vulnerabilities, 
                  data breaches, or other incidents, ContextCache™ is not liable for any damages, losses, 
                  or unauthorized access to data resulting from such third-party incidents. Users acknowledge 
                  and accept this risk by using our service.
                </p>
              </div>
            </div>
          </div>

          {/* Reporting Vulnerabilities */}
          <div className="bg-card border border-border rounded-lg p-8">
            <h2 className="text-2xl font-semibold mb-4">Reporting Security Vulnerabilities</h2>
            <p className="text-muted-foreground mb-4">
              If you discover a security vulnerability, please report it responsibly to:
            </p>
            <div className="bg-primary/5 border border-primary/20 rounded-lg p-4">
              <p className="font-mono text-sm">support@thecontextcache.com</p>
            </div>
            <p className="text-muted-foreground mt-4 text-sm">
              We aim to respond within 48 hours. Critical vulnerabilities will be prioritized.
            </p>
          </div>

          {/* Security Practices */}
          <div className="bg-card border border-border rounded-lg p-8">
            <h2 className="text-2xl font-semibold mb-4">Our Security Practices</h2>
            <ul className="space-y-3 text-muted-foreground">
              <li className="flex items-start gap-2">
                <span className="text-primary mt-1">•</span>
                <span>SQL injection prevention through parameterized queries</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-1">•</span>
                <span>JWT authentication with Clerk</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-1">•</span>
                <span>Rate limiting (300 requests/minute, 5000/hour)</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-1">•</span>
                <span>CORS protection with whitelisted origins</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-1">•</span>
                <span>Generic error messages to prevent information leakage</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-1">•</span>
                <span>Regular security audits and updates</span>
              </li>
            </ul>
          </div>

          {/* Contact */}
          <div className="text-center pt-8 border-t border-border">
            <p className="text-muted-foreground">
              Questions about security?{' '}
              <a href="mailto:support@thecontextcache.com" className="text-primary hover:underline">
                Contact us
              </a>
            </p>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

