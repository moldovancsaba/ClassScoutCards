import type { NextPage, GetServerSideProps } from "next";
import Link from "next/link";
import { getAllCollectionStats, type CollectionStats, type CountBucket, type RegionGroup } from "@/lib/delivery/cardBridgeStats";

interface StatsProps {
  stats: CollectionStats[];
  error: string | null;
}

const COLLECTION_LABEL: Record<string, string> = {
  contentCards: "Content Cards",
  providers: "Providers",
};

/** "212 (1324)" -- published, then the alternate count in parens. */
const PubCell: React.FC<{ published: number; alt: number }> = ({ published, alt }) => (
  <span style={{ whiteSpace: "nowrap" }}>
    {published} <span style={{ color: "#9ca3af" }}>({alt})</span>
  </span>
);

const BucketTable: React.FC<{ title: string; buckets: CountBucket[]; altLabel: string }> = ({ title, buckets, altLabel }) => (
  <div style={{ background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 10, padding: "1rem 1.1rem", flex: "1 1 300px", minWidth: 300 }}>
    <h3 style={{ margin: "0 0 0.65rem", fontSize: "0.95rem", fontWeight: 600 }}>{title}</h3>
    {buckets.length === 0 ? (
      <p style={{ color: "#9ca3af", fontSize: "0.85rem", margin: 0 }}>No data.</p>
    ) : (
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left", fontWeight: 500, color: "#9ca3af", fontSize: "0.75rem", paddingBottom: "0.3rem" }} />
            <th style={{ textAlign: "right", fontWeight: 500, color: "#9ca3af", fontSize: "0.75rem", paddingBottom: "0.3rem" }}>Total</th>
            <th style={{ textAlign: "right", fontWeight: 500, color: "#9ca3af", fontSize: "0.75rem", paddingBottom: "0.3rem" }}>
              Published ({altLabel})
            </th>
          </tr>
        </thead>
        <tbody>
          {buckets.map((b) => (
            <tr key={b.value} style={{ borderTop: "1px solid #f1f2f6" }}>
              <td style={{ padding: "0.35rem 0", color: b.value.startsWith("(") ? "#9ca3af" : "#1f1f2e" }}>{b.value}</td>
              <td style={{ padding: "0.35rem 0", textAlign: "right", fontWeight: 600, color: "#2563eb" }}>{b.total}</td>
              <td style={{ padding: "0.35rem 0", textAlign: "right" }}><PubCell published={b.published} alt={b.notPublished} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    )}
  </div>
);

const NeighborhoodTable: React.FC<{ groups: RegionGroup[] }> = ({ groups }) => (
  <div style={{ background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 10, padding: "1rem 1.1rem", flex: "1 1 300px", minWidth: 300 }}>
    <h3 style={{ margin: "0 0 0.65rem", fontSize: "0.95rem", fontWeight: 600 }}>By Neighborhood (grouped by borough / area)</h3>
    {groups.length === 0 ? (
      <p style={{ color: "#9ca3af", fontSize: "0.85rem", margin: 0 }}>No data.</p>
    ) : (
      <div style={{ maxHeight: 480, overflowY: "auto" }}>
        {groups.map((g) => (
          <div key={g.region} style={{ marginBottom: "0.9rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.2rem" }}>
              <strong style={{ fontSize: "0.85rem", color: g.region === "(unresolved)" ? "#9ca3af" : "#1f1f2e" }}>{g.region}</strong>
              <span style={{ fontSize: "0.78rem", color: "#6b7280" }}>
                {g.total} total &middot; <PubCell published={g.published} alt={g.notPublished} />
              </span>
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
              <tbody>
                {g.neighborhoods.map((n) => (
                  <tr key={n.value} style={{ borderTop: "1px solid #f1f2f6" }}>
                    <td style={{ padding: "0.25rem 0 0.25rem 0.75rem", color: n.value.startsWith("(") ? "#9ca3af" : "#1f1f2e" }}>{n.value}</td>
                    <td style={{ padding: "0.25rem 0", textAlign: "right", fontWeight: 600, color: "#2563eb" }}>{n.total}</td>
                    <td style={{ padding: "0.25rem 0", textAlign: "right" }}><PubCell published={n.published} alt={n.notPublished} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    )}
  </div>
);

const CollectionSection: React.FC<{ stats: CollectionStats }> = ({ stats }) => (
  <section style={{ marginBottom: "2rem" }}>
    <h2 style={{ fontSize: "1.2rem", fontWeight: 600, margin: "0 0 0.25rem" }}>
      {COLLECTION_LABEL[stats.collection] ?? stats.collection}
    </h2>
    <p style={{ margin: "0 0 0.35rem", color: "#6b7280", fontSize: "0.9rem" }}>
      {stats.total} total &middot; <PubCell published={stats.published} alt={stats.notPublished} /> published (not published)
    </p>
    <p style={{ margin: "0 0 1rem", color: "#6b7280", fontSize: "0.9rem" }}>
      Sport Cards: <PubCell published={stats.sportCards.published} alt={stats.sportCards.all} /> published (all) — one card
      counted once even if tagged with multiple sports
    </p>
    <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
      <BucketTable title="By Borough / Area" buckets={stats.byRegion} altLabel="not published" />
      <NeighborhoodTable groups={stats.byNeighborhood} />
      <BucketTable title="By Activity" buckets={stats.byActivity} altLabel="not published" />
    </div>
  </section>
);

const Stats: NextPage<StatsProps> = ({ stats, error }) => {
  return (
    <div style={{ fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif", minHeight: "100vh", background: "#f6f7fb", color: "#1f1f2e" }}>
      <div style={{ background: "#ffffff", borderBottom: "1px solid #e5e7eb" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "1.25rem 1.5rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <Link href="/" style={{ textDecoration: "none", color: "inherit" }}>
              <h1 style={{ fontSize: "1.25rem", fontWeight: 700, margin: 0, letterSpacing: "-0.01em" }}>ClassScout Cards</h1>
            </Link>
            <p style={{ margin: "0.15rem 0 0", fontSize: "0.85rem", color: "#6b7280" }}>
              Card counts by borough/area, neighborhood, and activity — grouped using the same canonical
              location logic the main app uses
            </p>
          </div>
          <Link href="/" style={{ padding: "0.55rem 0.9rem", borderRadius: 8, textDecoration: "none", color: "#2563eb", border: "1px solid #2563eb", fontSize: "0.85rem", fontWeight: 500 }}>Home</Link>
        </div>
      </div>

      <main style={{ maxWidth: 1200, margin: "0 auto", padding: "1.75rem 1.5rem" }}>
        {error ? (
          <section style={{ background: "#fff1f2", border: "1px solid #fca5a5", borderRadius: 10, padding: "1.5rem", color: "#c81e1e" }}>
            <strong>Could not load stats:</strong> {error}
          </section>
        ) : (
          stats.map((s) => <CollectionSection key={s.collection} stats={s} />)
        )}
      </main>
    </div>
  );
};

export const getServerSideProps: GetServerSideProps<StatsProps> = async () => {
  try {
    const stats = await getAllCollectionStats();
    return { props: { stats, error: null } };
  } catch (err) {
    return { props: { stats: [], error: err instanceof Error ? err.message : "Unknown error" } };
  }
};

export default Stats;
