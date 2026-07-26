"use client";

// Set this to your actual donation link (Ko-fi, PayPal, Stripe payment
// link, etc). Can be overridden via the NEXT_PUBLIC_DONATE_URL env var.
const DONATE_URL = process.env.NEXT_PUBLIC_DONATE_URL || "https://paypal.me/ossieee";

const PERKS: { icon: string; text: string }[] = [
  { icon: "🖥️", text: "Keeps hosting, storage, and clip uploads online" },
  { icon: "⚡", text: "Funds new features — chat, ranks, leaderboards" },
  { icon: "🤝", text: "100% community-run, no ads, no catches" },
];

export default function DonateView() {
  return (
    <div>
      <div className="section-title">
        <span className="accent-bar" />
        Support Channel4
      </div>

      <div className="card donate-hero">
        <div className="donate-hero-icon">💛</div>
        <h2>Keep Channel4 online</h2>
        <p className="small muted" style={{ lineHeight: 1.6 }}>
          Channel4 is run and kept online by the community. If you&apos;d like to
          help cover hosting and keep things running, any donation is
          appreciated — no amount is too small.
        </p>

        <div className="donate-perks">
          {PERKS.map((p) => (
            <div className="card donate-perk" key={p.text}>
              <span className="donate-perk-icon">{p.icon}</span>
              <span className="donate-perk-text">{p.text}</span>
            </div>
          ))}
        </div>

        {DONATE_URL ? (
          <a
            href={DONATE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-primary donate-cta"
          >
            💛 Donate to Channel4
          </a>
        ) : (
          <div className="notice small" style={{ textAlign: "left" }}>
            Donation link isn&apos;t set up yet — add{" "}
            <code>NEXT_PUBLIC_DONATE_URL</code> to your environment variables
            (e.g. a Ko-fi, PayPal, or Stripe payment link) to activate this
            button.
          </div>
        )}
      </div>
    </div>
  );
}
