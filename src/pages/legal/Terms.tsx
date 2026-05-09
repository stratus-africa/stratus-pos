import { Link } from "react-router-dom";

export default function Terms() {
  return (
    <div className="min-h-screen bg-background py-16 px-4">
      <div className="max-w-3xl mx-auto prose prose-slate">
        <Link to="/landing" className="text-sm text-muted-foreground hover:text-foreground">← Back</Link>
        <h1 className="font-serif text-4xl mt-4 mb-2 text-foreground">Terms of Service</h1>
        <p className="text-sm text-muted-foreground mb-8">Last updated: {new Date().toLocaleDateString()}</p>

        <h2>1. Who we are</h2>
        <p>StratusPOS is a service operated by <strong>Stratus Business Systems</strong> ("we", "us", "our"). By creating an account or using StratusPOS you agree to these Terms of Service.</p>

        <h2>2. Acceptance</h2>
        <p>By continued use of the service you accept these terms. If you are using StratusPOS on behalf of an organization, you represent that you have authority to bind that organization.</p>

        <h2>3. The service</h2>
        <p>StratusPOS is a multi-tenant point-of-sale and business management platform for retail shops, including inventory, sales, purchases, expenses, accounting, and reporting features.</p>

        <h2>4. Acceptable use</h2>
        <p>You must not misuse the service. You agree not to: (a) use it unlawfully or fraudulently; (b) send spam or infringe intellectual property; (c) interfere with security, including probing, scanning, scraping, or distributing malware; (d) reverse engineer, resell, or circumvent technical limits.</p>

        <h2>5. Account credentials</h2>
        <p>You must keep your credentials confidential and are responsible for activity under your account. You agree to provide accurate information and keep it updated.</p>

        <h2>6. Intellectual property</h2>
        <p>Stratus Business Systems retains all rights, title, and interest in the service, including software, documentation, and branding. You receive a limited, non-exclusive, non-transferable right to use the service within your selected plan.</p>

        <h2>7. User content</h2>
        <p>You retain ownership of data you upload. You grant us a limited license to host and process such content solely to provide the service to you.</p>

        <h2>8. Payments and subscriptions</h2>
        <p>Subscription fees, billing frequency, taxes, and renewal terms are presented at checkout. Payments are processed by our payment provider, <strong>Paystack</strong>. By purchasing a subscription you also agree to Paystack's terms applicable to the transaction. Subscriptions renew automatically until cancelled. You may cancel at any time from your account settings; cancellation takes effect at the end of the current billing period.</p>

        <h2>9. Refunds</h2>
        <p>See our <Link to="/refund-policy">Refund Policy</Link>.</p>

        <h2>10. Service level</h2>
        <p>We work to keep StratusPOS available and reliable but do not guarantee uninterrupted or error-free performance. To the fullest extent permitted by law, we disclaim all implied warranties including merchantability and fitness for a particular purpose.</p>

        <h2>11. Suspension and termination</h2>
        <p>We may suspend or terminate access for: material breach of these terms, non-payment, security or fraud risk, or repeated/serious policy violations. On termination you may export your data within 30 days, after which it may be deleted.</p>

        <h2>12. Liability</h2>
        <p>To the maximum extent permitted by law, our aggregate liability is capped at the fees you paid in the 12 months preceding the claim. We exclude liability for indirect, consequential, or special damages including loss of profits, data, or goodwill. Nothing limits liability for fraud, death, or personal injury where prohibited by law.</p>

        <h2>13. Indemnity</h2>
        <p>You indemnify Stratus Business Systems against claims arising from your content, unlawful use, or breach of these terms.</p>

        <h2>14. Changes</h2>
        <p>We may update these terms; material changes will be notified by email or in-product. Continued use after changes constitutes acceptance.</p>

        <h2>15. Governing law</h2>
        <p>These terms are governed by the laws of Kenya. Disputes will be resolved in the courts of Nairobi, Kenya.</p>

        <h2>16. Contact</h2>
        <p>Questions: <a href="mailto:support@stratus.africa">support@stratus.africa</a></p>
      </div>
    </div>
  );
}
