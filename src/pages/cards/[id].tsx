import { NextPage, GetServerSideProps } from "next";
import Link from "next/link";

interface CardData {
  id: string;
  name: string;
  category: string;
  borough: string;
  neighborhood: string;
  shortDescription?: string;
  longDescription?: string;
  description?: string;
  activityTypes?: string[];
  ageRanges?: string[];
  ageRange?: string;
  activities?: string[];
  source?: string;
  feedMetadata?: { source?: string };
  createdAt?: { $date?: string } | string | Date;
  updatedAt?: { $date?: string } | string | Date;
  discoveredAt?: string;
  _id?: string;
}

interface CardDetailProps {
  card: CardData | null;
  error?: string;
}

const CardDetail: NextPage<CardDetailProps> = ({ card, error }) => {
  if (error) {
    return (
      <div style={{ fontFamily: "system-ui, sans-serif", maxWidth: 800, margin: "0 auto", padding: "2rem" }}>
        <Link href="/" style={{ color: "#1971c2", textDecoration: "none" }}>← Back to Home</Link>
        <h1 style={{ color: "#c92a2a", marginTop: "1rem" }}>Error</h1>
        <p>{error}</p>
      </div>
    );
  }

  if (!card) {
    return (
      <div style={{ fontFamily: "system-ui, sans-serif", maxWidth: 800, margin: "0 auto", padding: "2rem" }}>
        <Link href="/" style={{ color: "#1971c2", textDecoration: "none" }}>← Back to Home</Link>
        <h1 style={{ color: "#868e96", marginTop: "1rem" }}>Card Not Found</h1>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", maxWidth: 800, margin: "0 auto", padding: "2rem" }}>
      <Link href="/" style={{ color: "#1971c2", textDecoration: "none" }}>← Back to Home</Link>
      
      <article style={{ marginTop: "1.5rem" }}>
        <header style={{ marginBottom: "2rem" }}>
          <h1 style={{ fontSize: "1.8rem", marginBottom: "0.5rem", color: "#212529" }}>
            {card.name}
          </h1>
          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginBottom: "1rem" }}>
            <span style={{
              background: "#1971c2",
              color: "white",
              padding: "0.25rem 0.75rem",
              borderRadius: "4px",
              fontSize: "0.9rem"
            }}>
              {card.category}
            </span>
            <span style={{
              background: "#2f9e44",
              color: "white",
              padding: "0.25rem 0.75rem",
              borderRadius: "4px",
              fontSize: "0.9rem"
            }}>
              {card.borough}
            </span>
            <span style={{
              background: "#868e96",
              color: "white",
              padding: "0.25rem 0.75rem",
              borderRadius: "4px",
              fontSize: "0.9rem"
            }}>
              {card.neighborhood}
            </span>
          </div>
        </header>

        <section style={{ marginBottom: "2rem" }}>
          <h2 style={{ fontSize: "1.2rem", marginBottom: "0.75rem", color: "#495057" }}>Description</h2>
          <p style={{ lineHeight: "1.6", color: "#343a40" }}>{card.description}</p>
        </section>

        <section style={{ marginBottom: "2rem" }}>
          <h2 style={{ fontSize: "1.2rem", marginBottom: "0.75rem", color: "#495057" }}>Activities</h2>
          <ul style={{ paddingLeft: "1.5rem", color: "#343a40" }}>
            {card.activities.map((activity, i) => (
              <li key={i} style={{ marginBottom: "0.5rem" }}>{activity}</li>
            ))}
          </ul>
        </section>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem", marginBottom: "2rem" }}>
          <div style={{ padding: "1rem", background: "#f8f9fa", borderRadius: "6px" }}>
            <div style={{ fontSize: "0.85rem", color: "#868e96", marginBottom: "0.25rem" }}>Age Range</div>
            <div style={{ fontSize: "1.1rem", fontWeight: 600, color: "#495057" }}>{card.ageRange}</div>
          </div>
          <div style={{ padding: "1rem", background: "#f8f9fa", borderRadius: "6px" }}>
            <div style={{ fontSize: "0.85rem", color: "#868e96", marginBottom: "0.25rem" }}>Source</div>
            <div style={{ fontSize: "1.1rem", fontWeight: 600, color: "#495057" }}>{card.source}</div>
          </div>
        </div>

        <footer style={{ paddingTop: "1.5rem", borderTop: "1px solid #dee2e6", fontSize: "0.9rem", color: "#868e96" }}>
          <div>Created: {new Date(card.createdAt).toLocaleString()}</div>
          <div>Updated: {new Date(card.updatedAt).toLocaleString()}</div>
          <div style={{ marginTop: "0.5rem", fontSize: "0.8rem", fontFamily: "monospace" }}>
            ID: {card.id}
          </div>
        </footer>
      </article>
    </div>
  );
};

export const getServerSideProps: GetServerSideProps<CardDetailProps> = async (context) => {
  const { id } = context.params!;
  
  try {
    const { getCardById } = await import("@/lib/delivery/mongoDirect");
    const card = await getCardById(id);
    
    if (!card) {
      return { props: { card: null } };
    }
    
    return { props: { card: JSON.parse(JSON.stringify(card)) } };
  } catch (error) {
    console.error("Error in getServerSideProps:", error);
    return {
      props: {
        card: null,
        error: error instanceof Error ? error.message : "Failed to load card"
      }
    };
  }
};

export default CardDetail;
