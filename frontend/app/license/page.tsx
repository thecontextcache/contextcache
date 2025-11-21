'use client';

import { motion } from 'framer-motion';
import { FileText, AlertCircle } from 'lucide-react';

export default function LicensePage() {
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
              <FileText className="h-8 w-8 text-primary" />
            </div>
            <h1 className="text-4xl font-bold mb-4">Proprietary Software License</h1>
            <p className="text-muted-foreground text-lg">
              thecontextcache™ Licensing Terms
            </p>
          </div>

          {/* Copyright Notice */}
          <div className="bg-card border border-border rounded-lg p-8">
            <h2 className="text-2xl font-semibold mb-4">Copyright Notice</h2>
            <p className="text-muted-foreground mb-2">
              Copyright © 2024-2025 thecontextcache™. All Rights Reserved.
            </p>
            <p className="text-muted-foreground text-sm">
              <strong>Note:</strong> The ™ symbol indicates a trademark claim. thecontextcache is not currently 
              registered with any trademark office. No LLC has been formed yet.
            </p>
          </div>

          {/* License Grant */}
          <div className="bg-card border border-border rounded-lg p-8 space-y-4">
            <h2 className="text-2xl font-semibold">License Grant</h2>
            <p className="text-muted-foreground">
              This software and associated documentation files (the "Software") are proprietary and confidential. 
              The Software is licensed, not sold.
            </p>
            
            <div className="mt-6">
              <h3 className="text-lg font-semibold mb-3">Development License</h3>
              <p className="text-muted-foreground">
                During the development phase, this Software is provided for internal development and testing 
                purposes only. No rights are granted to use, copy, modify, merge, publish, distribute, 
                sublicense, or sell copies of the Software without explicit written permission from the 
                copyright holder.
              </p>
            </div>
          </div>

          {/* Restrictions */}
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-6">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-6 w-6 text-red-600 dark:text-red-500 mt-1 flex-shrink-0" />
              <div>
                <h3 className="font-semibold text-red-900 dark:text-red-100 mb-3">
                  Restrictions
                </h3>
                <p className="text-sm text-red-800 dark:text-red-200 mb-2">You may NOT:</p>
                <ul className="text-sm text-red-800 dark:text-red-200 space-y-1 ml-4 list-disc">
                  <li>Use the Software for any commercial or production purposes</li>
                  <li>Copy, modify, or create derivative works of the Software</li>
                  <li>Distribute, sublicense, rent, lease, or lend the Software</li>
                  <li>Reverse engineer, decompile, or disassemble the Software</li>
                  <li>Remove or alter any proprietary notices or labels</li>
                  <li>Use the Software in any way that violates applicable laws</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Disclaimer */}
          <div className="bg-card border border-border rounded-lg p-8">
            <h2 className="text-2xl font-semibold mb-4">Disclaimer of Warranty</h2>
            <p className="text-muted-foreground text-sm">
              THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, 
              INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR 
              PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE 
              FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR 
              OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER 
              DEALINGS IN THE SOFTWARE.
            </p>
          </div>

          {/* Limitation of Liability */}
          <div className="bg-card border border-border rounded-lg p-8">
            <h2 className="text-2xl font-semibold mb-4">Limitation of Liability</h2>
            <p className="text-muted-foreground text-sm">
              IN NO EVENT SHALL CONTEXTCACHE™ BE LIABLE FOR ANY SPECIAL, INCIDENTAL, INDIRECT, OR 
              CONSEQUENTIAL DAMAGES WHATSOEVER (INCLUDING, WITHOUT LIMITATION, DAMAGES FOR LOSS OF 
              BUSINESS PROFITS, BUSINESS INTERRUPTION, LOSS OF BUSINESS INFORMATION, OR ANY OTHER 
              PECUNIARY LOSS) ARISING OUT OF THE USE OF OR INABILITY TO USE THIS SOFTWARE.
            </p>
          </div>

          {/* Termination */}
          <div className="bg-card border border-border rounded-lg p-8">
            <h2 className="text-2xl font-semibold mb-4">Termination</h2>
            <p className="text-muted-foreground">
              This license is effective until terminated. Your rights under this license will terminate 
              automatically without notice if you fail to comply with any of its terms. Upon termination, 
              you must destroy all copies of the Software in your possession.
            </p>
          </div>

          {/* Contact */}
          <div className="bg-card border border-border rounded-lg p-8">
            <h2 className="text-2xl font-semibold mb-4">Contact Information</h2>
            <p className="text-muted-foreground mb-4">
              For licensing inquiries, please contact:
            </p>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Developer:</span>
                <a href="mailto:dn@thecontextcache.com" className="text-primary hover:underline font-mono text-sm">
                  dn@thecontextcache.com
                </a>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Support:</span>
                <a href="mailto:support@thecontextcache.com" className="text-primary hover:underline font-mono text-sm">
                  support@thecontextcache.com
                </a>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Website:</span>
                <a href="https://thecontextcache.com" className="text-primary hover:underline">
                  https://thecontextcache.com
                </a>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="text-center pt-8 border-t border-border">
            <p className="text-muted-foreground text-sm">
              © 2025 thecontextcache™. All rights reserved.
            </p>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

