# Legal, Licensing & Privacy

!!! warning "Trademark notice"
    **thecontextcache™** is a pending trademark. The ™ symbol indicates an unregistered
    trademark claim. No licence to use the mark is granted beyond what is expressly stated
    in the Terms of Service.

---

## Copyright

Copyright © 2026 thecontextcache™. All Rights Reserved.

This software and its source code, design, documentation, and associated materials
("the Software") are the exclusive property of thecontextcache™ and are protected by
copyright, trade secret, and other intellectual property laws.

---

## Proprietary Software Licence

The Software is **licensed, not sold**.

During the alpha phase, the Software is made available to invited users for evaluation
and early-access use only. The following restrictions apply to all users, evaluators,
and contributors:

**You may NOT:**

- Copy, reproduce, distribute, sublicense, sell, resell, or otherwise exploit the
  Software or any portion thereof.
- Modify, translate, adapt, merge, or create derivative works based on the Software,
  its source code, documentation, or underlying algorithms.
- Reverse-engineer, decompile, disassemble, or attempt to derive source code,
  algorithms, or trade secrets from the Software.
- Use the Software to build a competing product or service.
- Benchmark or publish performance comparisons without prior written consent.
- Remove, obscure, or alter any copyright, trademark, or proprietary notice.
- Circumvent, disable, or otherwise interfere with security controls, rate limits,
  or access-control mechanisms.

All rights not expressly granted herein are reserved by thecontextcache™.

---

## Disclaimer of Warranty

THE SOFTWARE IS PROVIDED **"AS IS"** AND **"AS AVAILABLE"**, WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE, TITLE, AND NON-INFRINGEMENT.

THECONTEXTCACHE™ DOES NOT WARRANT THAT THE SOFTWARE WILL BE UNINTERRUPTED, ERROR-FREE,
FREE FROM HARMFUL COMPONENTS, OR THAT DEFECTS WILL BE CORRECTED.

---

## Limitation of Liability

TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, THECONTEXTCACHE™, ITS OFFICERS,
DIRECTORS, EMPLOYEES, AND AGENTS SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL,
SPECIAL, CONSEQUENTIAL, PUNITIVE, OR EXEMPLARY DAMAGES — INCLUDING LOSS OF PROFITS,
DATA, GOODWILL, OR BUSINESS INTERRUPTION — ARISING OUT OF OR RELATING TO YOUR USE OF,
OR INABILITY TO USE, THE SOFTWARE.

IN NO EVENT SHALL TOTAL CUMULATIVE LIABILITY EXCEED THE GREATER OF (A) AMOUNTS PAID
IN THE 12 MONTHS PRIOR TO THE CLAIM, OR (B) £100. DURING THE FREE ALPHA PHASE,
LIABILITY SHALL NOT EXCEED £0 (ZERO).

---

## Data & Privacy Summary

This section summarises how user data is handled. The canonical Terms & Privacy Policy
is at [/legal](https://thecontextcache.com/legal).

### What we collect

| Data | Purpose | Retention |
|------|---------|-----------|
| Email address | Authentication & invitations | Until deletion requested |
| Session token (SHA-256 hash) | Session management | Until revoked or expired |
| Login IP address | Security & abuse prevention | Last 10 per user; nightly purge after 90 days |
| User-agent string | Security context | Last 10 per user |
| Memory card content | Core product functionality | Until user deletes project |
| Daily usage counters | Limit enforcement | 90-day rolling window |

### IP address logging

On each successful magic-link sign-in, the client IP address is recorded.
The system atomically retains **only the last 10 login events per user** — older records
are deleted within the same database transaction on each new sign-in.
A nightly Celery task (`cleanup_old_login_events`) removes any rows older than 90 days.

The real client IP is extracted with the following priority:

1. `CF-Connecting-IP` (Cloudflare Tunnel header — present in production)
2. `X-Forwarded-For` (first IP in the chain)
3. `request.client.host` (direct connection fallback for dev)

IP addresses are **never** logged in application logs, emails, or API responses.
They are visible only to administrators via the admin panel (`/admin` → Login IPs tab).

### Session cookies

| Attribute | Dev | Prod (APP_ENV=prod) |
|-----------|-----|---------------------|
| HttpOnly | ✓ | ✓ |
| Secure | ✗ | ✓ |
| SameSite | Lax | Lax |
| Domain | unset | unset (host-only) |

SameSite=Lax prevents the session cookie from being sent on cross-site POST requests,
providing strong CSRF protection without additional middleware.

---

## Termination

Either party may terminate your access at any time. On termination, all licences cease
immediately. The warranty disclaimer, liability limitation, and IP sections survive.

---

## Governing Law

These terms are governed by the laws of **England and Wales**.

## Dispute Resolution, Arbitration & Class Action Waiver

To the fullest extent permitted by law:

- Any dispute, claim, or controversy arising out of or relating to these terms
  or your use of the Service will be resolved by binding individual arbitration.
- You and thecontextcache™ waive any right to a jury trial.
- You and thecontextcache™ waive any right to bring or participate in class,
  collective, representative, or private-attorney-general actions.
- Arbitration must proceed only on an individual basis.

If a court determines the class-action waiver is unenforceable for a specific
claim, that claim must be severed and litigated only in the courts of England
and Wales; all remaining claims continue in arbitration.

## Trademark Use Guidelines

The mark **thecontextcache™** is an unregistered/pending trademark claim.
Third parties may reference the product name only in a nominative, non-confusing
manner. You may not:

- imply endorsement, affiliation, or sponsorship by thecontextcache™
- use confusingly similar names, domains, logos, or branding
- register social handles or domains likely to cause confusion with the mark

Use of the mark must not dilute or misrepresent the brand.

---

## Contact

For legal inquiries, trademark notices, or data subject requests:

```
support@thecontextcache.com
```

Response target: **5 business days** for general inquiries, **30 days** for data subject requests.
