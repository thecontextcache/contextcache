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
        <section className="mb-12">
          <h2 className="mb-4 font-display text-xl font-bold text-ink">Terms of Service</h2>
          <div className="space-y-4 text-sm text-ink-2 leading-relaxed">
            <p>
              By using TheContextCache (&quot;the Service&quot;), you agree to these terms.
              The Service is provided as-is during the alpha period.
            </p>
            <h3 className="text-base font-semibold text-ink">1. Acceptable Use</h3>
            <p>
              You may use the Service to store and recall project knowledge for legitimate
              software development purposes. You must not use the Service to store sensitive
              personal data, credentials, or secrets.
            </p>
            <h3 className="text-base font-semibold text-ink">2. Data Ownership</h3>
            <p>
              You retain full ownership of all data you store in TheContextCache. We do not
              claim any rights to your content. When self-hosted, your data never leaves
              your infrastructure.
            </p>
            <h3 className="text-base font-semibold text-ink">3. Availability</h3>
            <p>
              The Service is in alpha and may have downtime, bugs, or breaking changes.
              We make no guarantees about uptime or data durability during the alpha period.
            </p>
            <h3 className="text-base font-semibold text-ink">4. Account Termination</h3>
            <p>
              We reserve the right to terminate accounts that violate these terms or
              abuse the Service. You can request deletion of your account and data at any time.
            </p>
          </div>
        </section>

        {/* Privacy Policy */}
        <section>
          <h2 className="mb-4 font-display text-xl font-bold text-ink">Privacy Policy</h2>
          <div className="space-y-4 text-sm text-ink-2 leading-relaxed">
            <h3 className="text-base font-semibold text-ink">1. Data Collection</h3>
            <p>
              We collect only the minimum data needed to operate the Service: your email
              address (for authentication) and the memory cards you choose to store.
            </p>
            <h3 className="text-base font-semibold text-ink">2. No Telemetry</h3>
            <p>
              TheContextCache does not include any analytics, tracking pixels, or telemetry.
              We do not use cookies for tracking — only a single HttpOnly session cookie
              for authentication.
            </p>
            <h3 className="text-base font-semibold text-ink">3. Self-Hosted Deployments</h3>
            <p>
              When self-hosted, no data is transmitted to us or any third party.
              The application runs entirely within your infrastructure.
            </p>
            <h3 className="text-base font-semibold text-ink">4. Data Deletion</h3>
            <p>
              You can delete individual memory cards, projects, or your entire account
              at any time. Deletion is permanent and immediate.
            </p>
            <h3 className="text-base font-semibold text-ink">5. Contact</h3>
            <p>
              For privacy-related inquiries, contact us through the waitlist form or
              via the admin panel.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
