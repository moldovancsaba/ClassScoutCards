import type { NextPage, GetServerSideProps } from "next";
import Link from "next/link";

interface CardSummary {
  cardId: string;
  name: string;
  category: string;
  borough: string;
  neighborhood: string;
  source: string;
  timestamp: string;
  deliverySuccess: boolean;
}

interface HomeProps {
  cards: CardSummary[];
  total: number;
  mongoDbName: string;
  source: string;
}

const Home: NextPage<HomeProps> = ({ cards, total, mongoDbName, source }) => {
  return (
    <div style={{ fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif", minHeight: "100vh", background: "#f6f7fb", color: "#1f1f2e" }}>
      <div style={{ background: "#ffffff", borderBottom: "1px solid #e5e7eb" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "1.25rem 1.5rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <Link href="/" style={{ textDecoration: "none", color: "inherit" }}>
              <h1 style={{ fontSize: "1.25rem", fontWeight: 700, margin: 0, letterSpacing: "-0.01em" }}>ClassScout Cards</h1>
            </Link>
            <p style={{ margin: "0.15rem 0 0", fontSize: "0.85rem", color: "#6b7280" }}>Activity cards for NYC families</p>
          </div>
          <nav style={{ display: "flex", gap: "0.75rem" }}>
            <Link href="/api/status" style={{ padding: "0.55rem 0.9rem", borderRadius: 8, textDecoration: "none", color: "#2563eb", border: "1px solid #2563eb", fontSize: "0.85rem", fontWeight: 500 }}>Status</Link>
            <Link href="/api/history" style={{ padding: "0.55rem 0.9rem", borderRadius: 8, textDecoration: "none", color: "#047857", border: "1px solid #047857", fontSize: "0.85rem", fontWeight: 500 }}>History</Link>
            <Link href="/api/generate" style={{ padding: "0.55rem 0.9rem", borderRadius: 8, textDecoration: "none", color: "#c81e1e", border: "1px solid #fca5a5", background: "#fff1f2", fontSize: "0.85rem", fontWeight: 500 }}>Generate</Link>
          </nav>
        </div>
      </div>

      <main style={{ maxWidth: 1200, margin: "0 auto", padding: "1.75rem 1.5rem" }}>
        <section style={{ marginBottom: "1.75rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "1rem", flexWrap: "wrap" }}>
            <div>
              <h2 style={{ margin: 0, fontSize: "1.4rem", fontWeight: 600 }}>Partner Programs</h2>
              <p style={{ margin: "0.25rem 0 0", color: "#6b7280", fontSize: "0.92rem" }}>
                {total} cards stored • Source: {source} • {mongoDbName}
              </p>
            </div>
          </div>
        </section>

        {cards.length === 0 ? (
          <section style={{ background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 10, padding: "1.5rem" }}>
            <p style={{ color: "#6b7280", fontStyle: "italic" }}>No cards yet. POST to <code>/api/generate</code> to create one.</p>
          </section>
        ) : (
          <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "1rem" }}>
            {cards.map((card) => (
              <Link
                key={card.cardId}
                href={`/cards/${card.cardId}`}
                style={{
                  display: "block",
                  background: "#ffffff",
                  border: "1px solid #e5e7eb",
                  borderRadius: 10,
                  padding: "1.1rem",
                  textDecoration: "none",
                  color: "inherit",
                  transition: "transform 80ms ease, box-shadow 80ms ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "translateY(-1px)";
                  e.currentTarget.style.boxShadow = "0 6px 18px rgba(15, 23, 42, 0.08)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.boxShadow = "none";
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.75rem" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: "0.8rem", fontWeight: 600, color: "#2563eb", marginBottom: "0.2rem", textTransform: "uppercase", letterSpacing: "0.04em" }}>{card.category}</div>
                    <div style={{ fontSize: "1.05rem", fontWeight: 600, lineHeight: 1.25 }}>{card.name}</div>
                    <div style={{ fontSize: "0.85rem", color: "#6b7280", marginTop: "0.35rem" }}>{card.borough} • {card.neighborhood}</div>
                  </div>
                  <span
                    style={{
                      whiteSpace: "nowrap",
                      fontSize: "0.72rem",
                      fontWeight: 600,
                      padding: "0.35rem 0.6rem",
                      borderRadius: 999,
                      background: card.deliverySuccess ? "#ecfdf5" : "#fff1f2",
                      color: card.deliverySuccess ? "#047857" : "#c81e1e",
                      border: `1px solid ${card.deliverySuccess ? "#a7f3d0" : "#fca5a5"}`,
                    }}
                  >
                    {card.deliverySuccess ? "Delivered" : "Failed"}
                  </span>
                </div>

                <div style={{ marginTop: "0.85rem", display: "flex", justifyContent: "space-between", alignItems: "center", color: "#6b7280", fontSize: "0.8rem" }}>
                  <span>Source: {card.source}</span>
                  <span>{new Date(card.timestamp).toLocaleDateString()}</span>
                </div>
              </Link>
            ))}
          </section>
        )}

        <section style={{ marginTop: "2.5rem" }}>
          <h2 style={{ fontSize: "1.15rem", fontWeight: 600, marginBottom: "0.75rem" }}>Quick Start</h2>
          <pre style={{ background: "#0f172a", color: "#e5e7eb", padding: "1rem", borderRadius: 10, overflow: "auto", fontSize: "0.85rem", lineHeight: 1.5 }}>
{`curl -X POST https://classscout-cards.vercel.app/api/generate \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "Little Explorers Daycare",
    "source": "manual",
    "category": "Classes",
    "borough": "Queens",
    "neighborhood": "Astoria",
    "description": "Creative play-based learning for toddlers"
  }'`}
          </pre>
        </section>
      </main>

      <footer style={{ maxWidth: 1200, margin: "0 auto", padding: "1.5rem", color: "#9ca3af", fontSize: "0.82rem" }}>
        ClassScout Cards API v1.0.0 • Built with Next.js + MongoDB Atlas
      </footer>
    </div>
  );
};

export const getServerSideProps: GetServerSideProps<HomeProps> = async () => {
  try {
    const protocol = process.env.NEXT_PUBLIC_BASE_URL || "https://classscout-cards.vercel.app";
    const res = await fetch(`${protocol}/api/history`);
    const data = await res.json();
    return {
      props: {
        cards: data.cards || [],
        total: data.total || 0,
        mongoDbName: data.dbName || "",
        source: data.source || "unknown",
      },
    };
  } catch {
    return {
      props: {
        cards: [],
        total: 0,
        mongoDbName: "",
        source: "error",
      },
    };
  }
};

export default Home;
