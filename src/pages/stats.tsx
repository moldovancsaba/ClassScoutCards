import type { NextPage, GetServerSideProps } from "next";
import Link from "next/link";
import { getAllCollectionStats, type CollectionStats, type CountBucket } from "@/lib/delivery/cardBridgeStats";

interface StatsProps {
  stats: CollectionStats[];
  error: string | null;
}

const COLLECTION_LABEL: Record<string, string> = {
  contentCards: "Content Cards",
  providers: "Providers",
};

const CountTable: React.FC<{ title: string; buckets: CountBucket[] }> = ({ title, buckets }) => (
  <div style={{ background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 10, padding: "1rem 1.1rem", flex: "1 1 260px", minWidth: 260 }}>
    <h3 style={{ margin: "0 0 0.65rem", fontSize: "0.95rem", fontWeight: 600 }}>{title}</h3>
    {buckets.length === 0 ? (
      <p style={{ color: "#9ca3af", fontSize: "0.85rem", margin: 0 }}>No data.</p>
    ) : (
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
        <tbody>
          {buckets.map((b) => (
            <tr key={b.value} style={{ borderTop: "1px solid #f1f2f6" }}>
              <td style={{ padding: "0.35rem 0", color: b.value === "(none)" ? "#9ca3af" : "#1f1f2e" }}>{b.value}</td>
              <td style={{ padding: "0.35rem 0", textAlign: "right", fontWeight: 600, color: "#2563eb" }}>{b.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    )}
  </div>
);

const CollectionSection: React.FC<{ stats: CollectionStats }> = ({ stats }) => (
  <section style={{ marginBottom: "2rem" }}>
    <h2 style={{ fontSize: "1.2rem", fontWeight: 600, margin: "0 0 0.25rem" }}>
      {COLLECTION_LABEL[stats.collection] ?? stats.collection}
    </h2>
    <p style={{ margin: "0 0 1rem", color: "#6b7280", fontSize: "0.9rem" }}>{stats.total} total</p>
    <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
      <CountTable title="By Borough" buckets={stats.byBorough} />
      <CountTable title="By Neighborhood" buckets={stats.byNeighborhood} />
      <CountTable title="By Activity" buckets={stats.byActivity} />
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
            <p style={{ margin: "0.15rem 0 0", fontSize: "0.85rem", color: "#6b7280" }}>Card counts by borough, neighborhood, and activity</p>
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
