import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Legal',
};

export default function LegalPage() {
  return (
    <div className="animate-fade-in px-4 py-20 sm:px-6">
      <div className="mx-auto max-w-3xl">
        <h1 className="mb-8 font-display text-3xl font-bold gradient-text">Legal</h1>

        {/* Terms of Service */}
        <section id="terms" className="mb-12">
          <h2 className="mb-4 font-display text-xl font-bold text-ink">Terms of Service</h2>
          <div className="space-y-4 text-sm text-ink-2 leading-relaxed">
            <p>
              These Terms of Service (&quot;Terms&quot;) govern your access to and use of
              TheContextCache (&quot;the Service&quot;), operated by TheContextCache
              (&quot;we&quot;, &quot;us&quot;, or &quot;our&quot;). By accessing or using the
              Service, you agree to be bound by these Terms. If you do not agree, do not use
              the Service.
            </p>

            <h3 className="text-base font-semibold text-ink">1. Eligibility &amp; Account</h3>
            <p>
              The Service is currently in invite-only alpha. Access is granted at our sole
              discretion. You must provide accurate information when registering. You are
              responsible for maintaining the security of your authentication credentials,
              session cookies, and API keys. You must promptly notify us of any unauthorised
              access to your account.
            </p>

            <h3 className="text-base font-semibold text-ink">2. Acceptable Use</h3>
            <p>
              You may use the Service to store and recall project knowledge for legitimate
              software development and business purposes. You must not: (a) store sensitive
              personal data, credentials, secrets, or passwords in memory cards; (b) use the
              Service to facilitate illegal activities; (c) attempt to gain unauthorised access
              to other users&apos; data or to the underlying infrastructure; (d) probe, scan,
              or test the vulnerability of the Service; (e) use automated means to create
              accounts or submit data beyond the published rate limits.
            </p>

            <h3 className="text-base font-semibold text-ink">3. Data Ownership</h3>
            <p>
              You retain full ownership of all content you store in TheContextCache, including
              memory cards, project names, tags, and metadata. We do not claim any intellectual
              property rights over your content. When self-hosted, your data never leaves your
              infrastructure. On our hosted instance, your data is stored in encrypted PostgreSQL
              databases and is never shared with third parties, used for training, or accessed
              by our team except as required for operational support.
            </p>

            <h3 className="text-base font-semibold text-ink">4. Service Availability</h3>
            <p>
              The Service is provided during the alpha period with no guarantee of uptime,
              performance, or data durability. We will make commercially reasonable efforts to
              maintain the Service but reserve the right to modify, suspend, or discontinue
              any aspect of the Service at any time without notice. We are not liable for any
              loss of data, downtime, or service interruptions.
            </p>

            <h3 className="text-base font-semibold text-ink">5. Rate Limits &amp; Fair Use</h3>
            <p>
              The Service enforces daily and weekly usage limits per user. These limits are
              configurable by administrators. Exceeding limits results in HTTP 429 responses.
              Abuse of rate limits, automated bulk operations, or any activity that degrades
              the Service for other users may result in immediate account termination.
            </p>

            <h3 className="text-base font-semibold text-ink">6. Account Termination</h3>
            <p>
              We reserve the right to terminate or suspend your account at any time for
              violation of these Terms or abuse of the Service. You may request deletion of
              your account and all associated data at any time by contacting
              support@thecontextcache.com. Deletion is permanent and irreversible.
            </p>

            <h3 className="text-base font-semibold text-ink">7. Limitation of Liability</h3>
            <p>
              To the maximum extent permitted by law, TheContextCache and its operators shall
              not be liable for any indirect, incidental, special, consequential, or punitive
              damages, or any loss of profits or revenues, whether incurred directly or
              indirectly, or any loss of data, use, goodwill, or other intangible losses
              resulting from your use of the Service.
            </p>

            <h3 className="text-base font-semibold text-ink">8. Changes to Terms</h3>
            <p>
              We may update these Terms from time to time. Continued use of the Service after
              changes constitutes acceptance. Material changes will be communicated via email
              to registered users.
            </p>
          </div>
        </section>

        {/* Privacy Policy */}
        <section id="privacy" className="mb-12">
          <h2 className="mb-4 font-display text-xl font-bold text-ink">Privacy Policy</h2>
          <div className="space-y-4 text-sm text-ink-2 leading-relaxed">
            <p>
              This Privacy Policy describes how TheContextCache collects, uses, and protects
              your information. We are committed to minimising data collection and maintaining
              the highest standards of data privacy.
            </p>

            <h3 className="text-base font-semibold text-ink">1. Data We Collect</h3>
            <p>
              We collect only the minimum data required to operate the Service: your email
              address (for authentication), the memory cards and project data you choose to
              store, and basic request metadata (IP address, user agent) for security and
              rate limiting. IP addresses are stored in truncated form and retained for a
              maximum of 90 days.
            </p>

            <h3 className="text-base font-semibold text-ink">2. No Telemetry or Tracking</h3>
            <p>
              TheContextCache contains zero analytics, tracking pixels, telemetry beacons,
              or third-party scripts. We do not use cookies for tracking — the only cookie
              is a single HttpOnly, Secure, SameSite=Lax session cookie required for
              authentication. We do not fingerprint browsers or devices.
            </p>

            <h3 className="text-base font-semibold text-ink">3. How We Use Your Data</h3>
            <p>
              Your email address is used solely for authentication (magic link delivery) and
              critical service communications. Your memory cards are stored to provide the
              recall service. Usage counters are maintained for rate limiting. Audit logs
              record mutating actions for security. We never sell, share, or use your data
              for advertising or model training purposes.
            </p>

            <h3 className="text-base font-semibold text-ink">4. Self-Hosted Deployments</h3>
            <p>
              When self-hosted, the entire application runs within your infrastructure. No
              data is transmitted to us or any third party. The application makes zero
              outbound network calls except to configured services (your own PostgreSQL,
              Redis, and optionally your own embedding provider).
            </p>

            <h3 className="text-base font-semibold text-ink">5. Data Retention &amp; Deletion</h3>
            <p>
              You can delete individual memory cards, entire projects, or your account at
              any time. Deletion is permanent and immediate at the database level. Expired
              session tokens, magic links, and old usage counters are automatically purged
              by scheduled cleanup tasks (90-day rolling window).
            </p>

            <h3 className="text-base font-semibold text-ink">6. Security Measures</h3>
            <p>
              All authentication tokens are stored as SHA-256 hashes — plaintext tokens are
              never persisted. API keys are hashed at rest. Session cookies are HttpOnly and
              Secure. Database connections use SSL in production. Rate limiting protects
              against brute force attacks. All mutating operations are recorded in audit logs.
            </p>

            <h3 className="text-base font-semibold text-ink">7. Contact</h3>
            <p>
              For privacy-related inquiries, data deletion requests, or concerns, contact
              us at{' '}
              <a href="mailto:support@thecontextcache.com" className="text-brand hover:underline">
                support@thecontextcache.com
              </a>.
            </p>
          </div>
        </section>

        {/* Software License */}
        <section id="license">
          <h2 className="mb-4 font-display text-xl font-bold text-ink">Software License</h2>
          <div className="space-y-4 text-sm text-ink-2 leading-relaxed">
            <div className="rounded-lg border border-line bg-bg-2 p-4 font-mono text-xs text-muted">
              SOFTWARE LICENSE AGREEMENT<br />
              Copyright &copy; 2024&ndash;2026 TheContextCache. All Rights Reserved.
            </div>

            <h3 className="text-base font-semibold text-ink">1. Proprietary Software</h3>
            <p>
              This software, including all source code, object code, algorithms, data structures,
              scoring systems, recall logic, memory card formats, API protocols, and all
              associated documentation (collectively, the &quot;Software&quot;), is the exclusive
              proprietary property of TheContextCache.
            </p>

            <h3 className="text-base font-semibold text-ink">2. No License Granted</h3>
            <p>
              No license, right, or permission is granted to any person or entity to copy,
              modify, distribute, reverse-engineer, decompile, disassemble, create derivative
              works from, sublicense, sell, or otherwise use the Software or any portion
              thereof, except as explicitly authorised in writing by TheContextCache.
            </p>

            <h3 className="text-base font-semibold text-ink">3. Prohibited Actions</h3>
            <p>You may NOT:</p>
            <ol className="ml-4 list-inside list-[lower-alpha] space-y-2">
              <li>Copy, reproduce, or duplicate any portion of the Software.</li>
              <li>Modify, adapt, translate, or create derivative works based on the Software.</li>
              <li>
                Reverse-engineer, decompile, disassemble, or otherwise attempt to derive
                the source code, algorithms, or underlying ideas from the Software.
              </li>
              <li>
                Distribute, sublicense, lease, rent, loan, or transfer the Software to any
                third party.
              </li>
              <li>Use the Software to build competing products or services.</li>
              <li>
                Remove, alter, or obscure any proprietary notices, labels, or marks on the
                Software.
              </li>
              <li>
                Use any of TheContextCache&apos;s algorithms, scoring logic, recall mechanisms,
                or data structures in any other software or service.
              </li>
            </ol>

            <h3 className="text-base font-semibold text-ink">4. Trade Secrets</h3>
            <p>
              The internal retrieval, ranking, and optimization systems, along with all
              implementation details and processing logic, constitute trade secrets of
              TheContextCache. Unauthorised disclosure or use of these trade secrets will
              be prosecuted to the fullest extent of applicable law.
            </p>

            <h3 className="text-base font-semibold text-ink">5. Self-Hosted Deployment</h3>
            <p>
              Users who are granted access to deploy the Software on their own infrastructure
              (&quot;Self-Hosted Deployment&quot;) are granted a limited, non-transferable,
              revocable licence to run the Software solely for their own internal business
              purposes. This licence does not grant any rights to the source code, algorithms,
              or underlying intellectual property. Self-hosted deployments must not be used to
              provide services to third parties.
            </p>

            <h3 className="text-base font-semibold text-ink">6. Enforcement</h3>
            <p>
              TheContextCache reserves the right to pursue all available legal remedies,
              including but not limited to injunctive relief, actual damages, statutory damages,
              and recovery of legal fees, against any person or entity that violates this
              licence.
            </p>

            <h3 className="text-base font-semibold text-ink">7. No Warranty</h3>
            <p>
              THE SOFTWARE IS PROVIDED &quot;AS IS&quot; WITHOUT WARRANTY OF ANY KIND, EXPRESS
              OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
              FITNESS FOR A PARTICULAR PURPOSE, AND NONINFRINGEMENT. IN NO EVENT SHALL
              THECONTEXTCACHE BE LIABLE FOR ANY CLAIM, DAMAGES, OR OTHER LIABILITY ARISING
              FROM THE SOFTWARE.
            </p>

            <h3 className="text-base font-semibold text-ink">8. Governing Law</h3>
            <p>
              This licence shall be governed by and construed in accordance with the laws
              of the relevant jurisdiction, without regard to conflict of law principles.
            </p>

            <div className="mt-6 rounded-lg border border-brand/20 bg-brand/5 p-4">
              <p className="text-sm text-ink">
                For licensing inquiries, contact{' '}
                <a href="mailto:support@thecontextcache.com" className="text-brand hover:underline">
                  support@thecontextcache.com
                </a>
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
