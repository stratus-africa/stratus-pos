import { Link } from "react-router-dom";

export default function Refund() {
  return (
    <div className="min-h-screen bg-background py-16 px-4">
      <div className="max-w-3xl mx-auto prose prose-slate">
        <Link to="/landing" className="text-sm text-muted-foreground hover:text-foreground">← Back</Link>
        <h1 className="font-serif text-4xl mt-4 mb-2 text-foreground">Refund Policy</h1>
        <p className="text-sm text-muted-foreground mb-8">Last updated: {new Date().toLocaleDateString()}</p>

        <h2>30-day money-back guarantee</h2>
        <p>StratusPOS, operated by <strong>Stratus Business Systems</strong>, offers a 30-day money-back guarantee on new paid subscriptions. If you are not satisfied, request a full refund within 30 days of your initial purchase.</p>

        <h2>How to request a refund</h2>
        <p>Email <a href="mailto:billing@stratus.africa">billing@stratus.africa</a> with your account email and the transaction reference. Refunds are processed by our payment provider, <strong>Paystack</strong>, back to the original payment method. Funds typically appear within 5–10 business days depending on your bank.</p>

        <h2>Subscription renewals and cancellations</h2>
        <p>Subscriptions renew automatically. You can cancel at any time from your account settings; cancellation takes effect at the end of the current billing period and you keep access until then. Renewal charges are not eligible for the 30-day guarantee but may be reviewed on a case-by-case basis where the renewal was clearly unintentional and the service was not used after renewal.</p>

        <h2>Exceptions</h2>
        <p>We may decline refunds in cases of abuse, fraudulent activity, or violation of our <Link to="/terms">Terms of Service</Link>.</p>

        <h2>Contact</h2>
        <p>Billing support: <a href="mailto:billing@stratus.africa">billing@stratus.africa</a></p>
      </div>
    </div>
  );
}
