import { Link } from "react-router-dom";

export default function Privacy() {
  return (
    <div className="min-h-screen bg-background py-16 px-4">
      <div className="max-w-3xl mx-auto prose prose-slate">
        <Link to="/landing" className="text-sm text-muted-foreground hover:text-foreground">← Back</Link>
        <h1 className="font-serif text-4xl mt-4 mb-2 text-foreground">Privacy Notice</h1>
        <p className="text-sm text-muted-foreground mb-8">Last updated: {new Date().toLocaleDateString()}</p>

        <h2>1. Who we are</h2>
        <p><strong>Stratus Business Systems</strong> (trading as StratusPOS) is the data controller for personal data processed through this service.</p>

        <h2>2. Data we collect</h2>
        <ul>
          <li><strong>Account data:</strong> name, email, password (hashed), business name, role.</li>
          <li><strong>Business operational data:</strong> products, customers, suppliers, sales, purchases, and other records you create in the platform.</li>
          <li><strong>Support communications:</strong> messages you send us.</li>
          <li><strong>Usage and device data:</strong> IP address, browser/device identifiers, telemetry, log events.</li>
          <li><strong>Payment metadata:</strong> plan, status, transaction references. Card details are collected and stored by our payment provider, not by us.</li>
        </ul>

        <h2>3. Why we use it (purposes & legal basis)</h2>
        <ul>
          <li>Create and operate your account, deliver the service — <em>contract performance</em>.</li>
          <li>Security, fraud prevention, abuse detection — <em>legitimate interests</em>.</li>
          <li>Customer support — <em>contract performance / legitimate interests</em>.</li>
          <li>Product improvement and analytics — <em>legitimate interests</em>.</li>
          <li>Legal and tax compliance — <em>legal obligation</em>.</li>
          <li>Marketing emails — <em>consent</em> (you can opt out anytime).</li>
        </ul>

        <h2>4. Sharing</h2>
        <ul>
          <li><strong>Subprocessors:</strong> hosting, database, email delivery, error monitoring, analytics.</li>
          <li><strong>Payment processor:</strong> <strong>Paystack</strong> handles payments, subscriptions, invoicing, and tax compliance for purchases.</li>
          <li><strong>Professional advisers:</strong> legal, accounting, where strictly necessary.</li>
          <li><strong>Authorities:</strong> where required by law.</li>
        </ul>

        <h2>5. Retention</h2>
        <p>We keep account and business data for the life of your account plus a reasonable period required to satisfy legal, tax, and audit obligations. After that, data is deleted or anonymised. You may request earlier deletion (subject to legal retention requirements).</p>

        <h2>6. Your rights</h2>
        <p>You have the right to access, correct, delete, restrict, or port your personal data, and to object to or withdraw consent for certain processing. To exercise rights, email <a href="mailto:privacy@stratus.africa">privacy@stratus.africa</a>. You may also lodge a complaint with the Office of the Data Protection Commissioner of Kenya.</p>

        <h2>7. Security</h2>
        <p>We use industry-standard technical and organisational measures including encryption in transit, access controls, role-based permissions, and audit logging.</p>

        <h2>8. Cookies</h2>
        <p>We use essential cookies to keep you signed in and remember preferences. We may use analytics cookies to understand product usage. You can manage cookies through your browser settings.</p>

        <h2>9. International transfers</h2>
        <p>Some subprocessors may store or process data outside Kenya. Where that occurs we use appropriate safeguards (such as contractual protections and adequacy assessments).</p>

        <h2>10. Contact</h2>
        <p>Privacy questions: <a href="mailto:privacy@stratus.africa">privacy@stratus.africa</a></p>
      </div>
    </div>
  );
}
