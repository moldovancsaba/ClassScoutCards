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
    <div style={{ fontFamily: "system-ui, sans-serif", maxWidth: 900, margin: "0 auto", padding: "2rem" }}>
      <header style={{ borderBottom: "2px solid #0070f3", paddingBottom: "1rem", marginBottom: "2rem" }}>
        <h1 style={{ fontSize: "2rem", margin: 0 }}>🗽 ClassScout Cards</h1>
        <p style={{ color: "#666", marginTop: "0.5rem" }}>Kid-friendly activity cards API for NYC families</p>
      </header>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem", marginBottom: "2rem" }}>
        <Link href="/api/status" style={{ display: "block", padding: "1rem", background: "#f0f7ff", borderRadius: 8, textDecoration: "none", color: "#0070f3", border: "1px solid #0070f3" }}>
          📡 API Status
        </Link>
        <Link href="/api/history" style={{ display: "block", padding: "1rem", background: "#f0fff4", borderRadius: 8, textDecoration: "none", color: "#2f9e44", border: "1px solid #2f9e44" }}>
          📋 History API
        </Link>
        <Link href="/api/generate" style={{ display: "block", padding: "1rem", background: "#fff5f5", borderRadius: 8, textDecoration: "none", color: "#e03131", border: "1px solid #e03131" }}>
          ⚡ Generate API
        </Link>
      </section>

      <section style={{ marginBottom: "2rem" }}>
        <h2>📊 Cards from MongoDB ({mongoDbName})</h2>
        <p style={{ color: "#666" }}>
          <strong>{total}</strong> cards stored • Source: {source}
        </p>

        {cards.length === 0 ? (
          <p style={{ color: "#999", fontStyle: "italic" }}>No cards yet. POST to <code>/api/generate</code> to create one.</p>
        ) : (
          <div style={{ display: "grid", gap: "1rem" }}>
            {cards.map((card) => (
              <Link
                key={card.cardId}
                href={`/cards/${card.cardId}`}
                style={{
                  display: "block",
                  padding: "1rem",
                  background: card.deliverySuccess ? "#f8f9fa" : "#fff5f5",
                  borderRadius: 8,
                  textDecoration: "none",
                  color: "#333",
                  border: `1px solid ${card.deliverySuccess ? "#dee2e6" : "#ffc9c9"}`,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <strong style={{ fontSize: "1.1rem" }}>{card.name}</strong>
                    <div style={{ fontSize: "0.9rem", color: "#666", marginTop: "0.25rem" }}>
                      {card.category} • {card.borough} • {card.neighborhood}
                    </div>
                  </div>
                  <div style={{ textAlign: "right", fontSize: "0.8rem", color: "#888" }}>
                    <div>Source: {card.source}</div>
                    <div>{new Date(card.timestamp).toLocaleDateString()}</div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2>🛠 Quick Start</h2>
        <pre style={{ background: "#1a1a2e", color: "#e0e0e0", padding: "1rem", borderRadius: 8, overflow: "auto" }}>
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

      <footer style={{ marginTop: "3rem", paddingTop: "1rem", borderTop: "1px solid #dee2e6", color: "#868e96", fontSize: "0.9rem" }}>
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
