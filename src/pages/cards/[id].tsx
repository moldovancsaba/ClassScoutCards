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
  ageRange?: string | string[];
  activities?: string[];
  address?: string;
  priceText?: string;
  rating?: number;
  reviewCount?: number;
  website?: string;
  phone?: string;
  email?: string;
  image?: string;
  badges?: string[];
  sourceUrl?: string;
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
      <div style={{ fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif", maxWidth: 1200, margin: "0 auto", padding: "2rem 1.5rem" }}>
        <Link href="/" style={{ color: "#2563eb", textDecoration: "none" }}>← Back</Link>
        <h1 style={{ color: "#c81e1e", marginTop: "1rem" }}>Error</h1>
        <p>{error}</p>
      </div>
    );
  }

  if (!card) {
    return (
      <div style={{ fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif", maxWidth: 1200, margin: "0 auto", padding: "2rem 1.5rem" }}>
        <Link href="/" style={{ color: "#2563eb", textDecoration: "none" }}>← Back</Link>
        <h1 style={{ color: "#6b7280", marginTop: "1rem" }}>Card Not Found</h1>
      </div>
    );
  }

  const ageDisplay = Array.isArray(card.ageRange)
    ? card.ageRange.join(", ")
    : Array.isArray(card.ageRanges)
      ? card.ageRanges.join(", ")
      : (card.ageRange || "-");

  return (
    <div style={{ fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif", minHeight: "100vh", background: "#f6f7fb", color: "#1f1f2e" }}>
      <div style={{ background: "#ffffff", borderBottom: "1px solid #e5e7eb" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "1.25rem 1.5rem" }}>
          <Link href="/" style={{ color: "#2563eb", textDecoration: "none", fontSize: "0.9rem", fontWeight: 500 }}>← Back to Partner Programs</Link>
        </div>
      </div>

      <main style={{ maxWidth: 1200, margin: "0 auto", padding: "1.75rem 1.5rem" }}>
        <div style={{ background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 10, padding: "1.5rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem", flexWrap: "wrap" }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "#2563eb", marginBottom: "0.25rem", textTransform: "uppercase", letterSpacing: "0.06em" }}>{card.category}</div>
              <h1 style={{ margin: 0, fontSize: "1.6rem", fontWeight: 600, lineHeight: 1.2 }}>{card.name}</h1>
              <div style={{ marginTop: "0.5rem", color: "#6b7280", fontSize: "0.95rem" }}>{card.borough} • {card.neighborhood}</div>
            </div>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              <span style={{ fontSize: "0.78rem", fontWeight: 600, padding: "0.35rem 0.7rem", borderRadius: 999, background: "#eff6ff", color: "#1e40af", border: "1px solid #bfdbfe" }}>{card.borough}</span>
              <span style={{ fontSize: "0.78rem", fontWeight: 600, padding: "0.35rem 0.7rem", borderRadius: 999, background: "#f5f3ff", color: "#5b21b6", border: "1px solid #ddd6fe" }}>{card.category}</span>
            </div>
          </div>

          <div style={{ marginTop: "1.25rem", color: "#374151", lineHeight: 1.6 }}>
            <p>{card.description || card.longDescription || card.shortDescription}</p>
          </div>

          <div style={{ marginTop: "1.5rem", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "1rem" }}>
            {card.activities && card.activities.length > 0 && (
              <div style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 8, padding: "1rem" }}>
                <div style={{ fontSize: "0.8rem", color: "#6b7280", marginBottom: "0.35rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>Activities</div>
                <ul style={{ margin: 0, paddingLeft: "1.25rem", color: "#374151" }}>
                  {card.activities.map((activity, i) => <li key={i} style={{ marginBottom: "0.2rem" }}>{activity}</li>)}
                </ul>
              </div>
            )}
            <div style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 8, padding: "1rem" }}>
              <div style={{ fontSize: "0.8rem", color: "#6b7280", marginBottom: "0.35rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>Age Range</div>
              <div style={{ fontWeight: 600, color: "#111827" }}>{ageDisplay}</div>
            </div>
            <div style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 8, padding: "1rem" }}>
              <div style={{ fontSize: "0.8rem", color: "#6b7280", marginBottom: "0.35rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>Source</div>
              <div style={{ fontWeight: 600, color: "#111827" }}>{card.source || card.feedMetadata?.source || "-"}</div>
            </div>
          </div>

          {(card.address || card.priceText || card.rating !== undefined) && (
            <div style={{ marginTop: "1rem", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "1rem" }}>
              {card.address && (
                <div style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 8, padding: "1rem" }}>
                  <div style={{ fontSize: "0.8rem", color: "#6b7280", marginBottom: "0.35rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>Address</div>
                  <div style={{ fontWeight: 600, color: "#111827" }}>{card.address}</div>
                </div>
              )}
              {card.priceText && (
                <div style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 8, padding: "1rem" }}>
                  <div style={{ fontSize: "0.8rem", color: "#6b7280", marginBottom: "0.35rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>Price</div>
                  <div style={{ fontWeight: 600, color: "#111827" }}>{card.priceText}</div>
                </div>
              )}
              {card.rating !== undefined && (
                <div style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 8, padding: "1rem" }}>
                  <div style={{ fontSize: "0.8rem", color: "#6b7280", marginBottom: "0.35rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>Rating</div>
                  <div style={{ fontWeight: 600, color: "#111827" }}>{card.rating}{card.reviewCount !== undefined ? ` (${card.reviewCount})` : ""}</div>
                </div>
              )}
            </div>
          )}
        </div>

        <footer style={{ marginTop: "1.5rem", color: "#9ca3af", fontSize: "0.8rem", lineHeight: 1.5 }}>
          <div>Created: {card.createdAt ? new Date(card.createdAt as string | Date).toLocaleString() : '-'}</div>
          <div>Updated: {card.updatedAt ? new Date(card.updatedAt as string | Date).toLocaleString() : '-'}</div>
          <div style={{ marginTop: "0.35rem", fontFamily: "monospace" }}>ID: {card.id}</div>
        </footer>
      </main>
    </div>
  );
};

export const getServerSideProps: GetServerSideProps<CardDetailProps> = async (context) => {
  const { id } = context.params!;
  const cardId = Array.isArray(id) ? id[0] : (id as string);

  try {
    const { getCardById } = await import("@/lib/delivery/mongoDirect");
    const card = await getCardById(cardId);

    if (!card) {
      return { props: { card: null } };
    }

    const normalized: any = {
      ...card,
      description: card.longDescription || card.shortDescription || (card as any).description,
      activities: card.activityTypes,
      ageRange: card.ageRanges,
      source: card.sourceUrl || card.feedMetadata?.source,
    } as Record<string, unknown>;

    return { props: { card: JSON.parse(JSON.stringify(normalized)) as CardData } };
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
