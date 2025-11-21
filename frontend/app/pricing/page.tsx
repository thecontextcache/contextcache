'use client';

import { motion } from 'framer-motion';
import { Check, Sparkles, Zap, Crown } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@clerk/nextjs';

export default function PricingPage() {
  const router = useRouter();
  const { isSignedIn } = useAuth();

  const plans = [
    {
      name: 'Free',
      icon: <Sparkles className="h-6 w-6" />,
      price: '$0',
      period: 'forever',
      description: 'Perfect for getting started with privacy-first knowledge management',
      features: [
        '1 project',
        '100 documents per project',
        '10,000 facts extracted',
        'thecontextcache Smart AI (RAG+CAG)',
        'Basic knowledge graph',
        'End-to-end encryption',
        'Community support',
      ],
      limitations: [
        'No custom AI models',
        'No Databricks integration',
        'No API access',
      ],
      cta: 'Get Started Free',
      highlighted: false,
      comingSoon: false,
    },
    {
      name: 'Pro',
      icon: <Zap className="h-6 w-6" />,
      price: '$29',
      period: 'per month',
      description: 'For professionals who need more power and flexibility',
      features: [
        'Unlimited projects',
        'Unlimited documents',
        'Unlimited facts',
        'All Smart AI features',
        'Custom AI models (GPT-4, Claude, etc.)',
        'Databricks integration',
        'Advanced 3D knowledge graph',
        'Priority support',
        'API access',
        'Export to RDF/JSON-LD',
      ],
      limitations: [],
      cta: 'Start Pro Trial',
      highlighted: true,
      comingSoon: true,
    },
    {
      name: 'Enterprise',
      icon: <Crown className="h-6 w-6" />,
      price: 'Custom',
      period: 'contact us',
      description: 'For teams and organizations with advanced requirements',
      features: [
        'Everything in Pro',
        'Dedicated Databricks cluster',
        'Custom model training',
        'SSO / SAML authentication',
        'On-premise deployment',
        'SLA guarantees',
        '24/7 dedicated support',
        'Custom integrations',
        'Volume discounts',
      ],
      limitations: [],
      cta: 'Contact Sales',
      highlighted: false,
      comingSoon: true,
    },
  ];

  const handlePlanSelect = (plan: typeof plans[0]) => {
    if (plan.name === 'Free') {
      if (isSignedIn) {
        router.push('/dashboard');
      } else {
        router.push('/');
      }
    } else if (plan.name === 'Enterprise') {
      window.location.href = 'mailto:dn@thecontextcache.com?subject=Enterprise Plan Inquiry';
    } else {
      // Pro plan - will integrate payment gateway here
      alert('Payment integration coming soon! We\'ll notify you when Pro plans are available.');
    }
  };

  return (
    <div className="min-h-screen bg-background dark:bg-dark-bg-900">
      {/* Header */}
      <section className="pt-20 pb-12 px-4">
        <div className="container mx-auto max-w-6xl text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4 mb-4"
          >
            <h1 className="text-5xl md:text-6xl font-bold bg-gradient-primary bg-clip-text text-transparent">
              Simple, Transparent Pricing
            </h1>
            <p className="text-xl text-body dark:text-dark-text-muted max-w-2xl mx-auto">
              Start free. Upgrade when you need more. Cancel anytime.
            </p>
          </motion.div>

          {/* Coming Soon Badge */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="inline-flex items-center gap-2 px-4 py-2 bg-yellow-100 dark:bg-yellow-900/30 border border-yellow-300 dark:border-yellow-700 rounded-full text-sm font-medium text-yellow-800 dark:text-yellow-200 mb-8"
          >
            <Sparkles className="h-4 w-4" />
            Paid plans launching soon • Get notified
          </motion.div>
        </div>
      </section>

      {/* Pricing Cards */}
      <section className="pb-20 px-4">
        <div className="container mx-auto max-w-7xl">
          <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {plans.map((plan, index) => (
              <motion.div
                key={plan.name}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                className={`relative rounded-2xl p-8 ${
                  plan.highlighted
                    ? 'bg-gradient-to-br from-primary/10 to-secondary/10 border-2 border-primary dark:border-primary-700 shadow-2xl scale-105'
                    : 'bg-surface dark:bg-dark-surface-800 border border-gray-200 dark:border-dark-surface-800'
                }`}
              >
                {plan.highlighted && (
                  <div className="absolute -top-4 left-1/2 transform -translate-x-1/2 px-4 py-1 bg-gradient-primary text-white text-sm font-semibold rounded-full">
                    Most Popular
                  </div>
                )}

                {plan.comingSoon && (
                  <div className="absolute top-4 right-4 px-3 py-1 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200 text-xs font-semibold rounded-full">
                    Coming Soon
                  </div>
                )}

                <div className="space-y-6">
                  {/* Plan Header */}
                  <div>
                    <div className="w-12 h-12 rounded-lg bg-primary/10 dark:bg-primary-700/20 flex items-center justify-center mb-4 text-primary dark:text-primary-700">
                      {plan.icon}
                    </div>
                    <h3 className="text-2xl font-bold text-headline dark:text-dark-text-primary">
                      {plan.name}
                    </h3>
                    <div className="mt-4 flex items-baseline gap-2">
                      <span className="text-5xl font-bold text-headline dark:text-dark-text-primary">
                        {plan.price}
                      </span>
                      {plan.price !== 'Custom' && (
                        <span className="text-body dark:text-dark-text-muted">
                          /{plan.period}
                        </span>
                      )}
                    </div>
                    <p className="mt-4 text-sm text-body dark:text-dark-text-muted">
                      {plan.description}
                    </p>
                  </div>

                  {/* Features List */}
                  <div className="space-y-3">
                    {plan.features.map((feature, idx) => (
                      <div key={idx} className="flex items-start gap-3">
                        <Check className="h-5 w-5 text-success flex-shrink-0 mt-0.5" />
                        <span className="text-sm text-body dark:text-dark-text-muted">
                          {feature}
                        </span>
                      </div>
                    ))}
                    {plan.limitations.map((limitation, idx) => (
                      <div key={idx} className="flex items-start gap-3 opacity-60">
                        <span className="text-sm text-body dark:text-dark-text-muted">
                          ✕ {limitation}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* CTA Button */}
                  <button
                    onClick={() => handlePlanSelect(plan)}
                    disabled={plan.comingSoon && plan.name !== 'Enterprise'}
                    className={`w-full py-3 px-6 rounded-xl font-semibold transition-all ${
                      plan.highlighted
                        ? 'bg-gradient-primary text-white hover:opacity-90 shadow-lg'
                        : 'bg-gray-100 dark:bg-dark-bg-900 text-headline dark:text-dark-text-primary hover:bg-gray-200 dark:hover:bg-dark-surface-800'
                    } ${
                      plan.comingSoon && plan.name !== 'Enterprise'
                        ? 'opacity-50 cursor-not-allowed'
                        : ''
                    }`}
                  >
                    {plan.cta}
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="pb-20 px-4">
        <div className="container mx-auto max-w-4xl">
          <h2 className="text-3xl font-bold text-center mb-12 text-headline dark:text-dark-text-primary">
            Frequently Asked Questions
          </h2>
          <div className="space-y-6">
            {[
              {
                q: 'How does the free plan work?',
                a: 'The free plan gives you full access to our thecontextcache Smart AI (RAG+CAG hybrid model) with limits on projects and documents. Perfect for trying out the platform.',
              },
              {
                q: 'Can I upgrade or downgrade anytime?',
                a: 'Yes! You can upgrade to Pro or downgrade to Free at any time. Changes take effect immediately, and we prorate billing.',
              },
              {
                q: 'What payment methods do you accept?',
                a: 'We will accept all major credit cards, debit cards, and PayPal through Stripe (integration coming soon).',
              },
              {
                q: 'Is my data encrypted?',
                a: 'Yes! All plans include end-to-end encryption (XChaCha20-Poly1305). Your master key never leaves your device.',
              },
              {
                q: 'What is Databricks integration?',
                a: 'Pro and Enterprise plans can connect to Databricks for custom model training, large-scale data processing, and advanced ML workflows.',
              },
              {
                q: 'Do you offer refunds?',
                a: 'Yes, we offer a 30-day money-back guarantee for Pro plans. No questions asked.',
              },
            ].map((faq, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05 }}
                className="bg-surface dark:bg-dark-surface-800 border border-gray-200 dark:border-dark-surface-800 rounded-lg p-6"
              >
                <h3 className="text-lg font-semibold text-headline dark:text-dark-text-primary mb-2">
                  {faq.q}
                </h3>
                <p className="text-body dark:text-dark-text-muted">{faq.a}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="pb-20 px-4">
        <div className="container mx-auto max-w-4xl">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-gradient-to-br from-primary/20 to-secondary/20 border border-primary/30 dark:border-primary-700/30 rounded-2xl p-12 text-center"
          >
            <h2 className="text-3xl font-bold mb-4 text-headline dark:text-dark-text-primary">
              Still have questions?
            </h2>
            <p className="text-body dark:text-dark-text-muted mb-6 max-w-2xl mx-auto">
              Our team is here to help. Get in touch and we'll answer any questions you have.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <a
                href="mailto:support@thecontextcache.com"
                className="px-6 py-3 bg-gradient-primary text-white font-semibold rounded-xl hover:opacity-90 transition-opacity"
              >
                Contact Support
              </a>
              <a
                href="mailto:dn@thecontextcache.com"
                className="px-6 py-3 bg-surface dark:bg-dark-surface-800 border border-gray-200 dark:border-dark-surface-800 text-headline dark:text-dark-text-primary font-semibold rounded-xl hover:bg-gray-50 dark:hover:bg-dark-bg-900 transition-colors"
              >
                Talk to Developer
              </a>
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  );
}

