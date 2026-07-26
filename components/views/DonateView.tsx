"use client";

// Set this to your actual donation link (Ko-fi, PayPal, Stripe payment
// link, etc). Left as a placeholder until you drop in a real one.
const DONATE_URL = process.env.NEXT_PUBLIC_DONATE_URL || "";

export default function DonateView() {
  return (
    <div>
      <div className="section-title">
        <span className="accent-bar" />
        Support Channel4
      </div>

      <div className="card" style={{ padding: 28, maxWidth: 520 }}>
        <div style={{ fontSize: 32, marginBottom: 10 }}>💛</div>
        <p className="small muted" style={{ marginBottom: 20, lineHeight: 1.6 }}>
          Channel4 is run and kept online by the community. If you'd like to
          help cover hosting and keep things running, any donation is
          appreciated.
        </p>

        {DONATE_URL ? (
          <a
            href={DONATE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-primary btn-sm"
          >
            Donate
          </a>
        ) : (
          <div className="notice small">
            Donation link isn't set up yet — add{" "}
            <code>NEXT_PUBLIC_DONATE_URL</code> to your environment variables
            (e.g. a Ko-fi, PayPal, or Stripe payment link) to activate this
            button.
          </div>
        )}
      </div>
    </div>
  );
}
