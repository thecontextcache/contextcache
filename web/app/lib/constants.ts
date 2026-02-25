export const APP_NAME = 'TheContextCache';
export const APP_DESCRIPTION = 'Project Brain for AI Teams';
export const APP_URL = 'https://thecontextcache.com';

export const SESSION_COOKIE_NAME = 'contextcache_session';
export const ORG_ID_KEY = 'CONTEXTCACHE_ORG_ID';

export const MEMORY_TYPES = [
  { key: 'decision', label: 'Decision', color: 'text-brand' },
  { key: 'finding', label: 'Finding', color: 'text-violet' },
  { key: 'snippet', label: 'Snippet', color: 'text-ok' },
  { key: 'note', label: 'Note', color: 'text-warn' },
  { key: 'issue', label: 'Issue', color: 'text-err' },
  { key: 'context', label: 'Context', color: 'text-ink-2' },
] as const;

export const NAV_ITEMS = [
  { href: '/app', label: 'Dashboard' },
  { href: '/app/api-keys', label: 'API Keys' },
  { href: '/app/orgs', label: 'Organisation' },
  { href: '/app/usage', label: 'Usage' },
] as const;

export const PRICING_TIERS = [
  {
    name: 'Alpha',
    price: 'Free',
    period: '',
    description: 'Invite-only early access',
    active: true,
    features: [
      '3 projects',
      '500 memory cards',
      '1,000 recalls/month',
      '1 API key',
      'Community support',
    ],
  },
  {
    name: 'Pro',
    price: '$29',
    period: '/seat/mo',
    description: 'For individual power users',
    active: false,
    features: [
      '25 projects',
      '10,000 memory cards',
      '50,000 recalls/month',
      '10 API keys',
      'Priority support',
      'Advanced analytics',
    ],
  },
  {
    name: 'Team',
    price: '$79',
    period: '/5 seats/mo',
    description: 'For growing teams',
    active: false,
    features: [
      '100 projects',
      '100,000 memory cards',
      'Unlimited recalls',
      '50 API keys',
      'Team management',
      'SSO integration',
      'Dedicated support',
    ],
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    period: '',
    description: 'For organisations at scale',
    active: false,
    features: [
      'Unlimited projects',
      'Unlimited memory cards',
      'Unlimited recalls',
      'Unlimited API keys',
      'Custom deployment',
      'SLA & compliance',
      'Dedicated CSM',
    ],
  },
] as const;
