export default function Home() {
  return (
    <div style={{ padding: "2rem", fontFamily: "system-ui" }}>
      <h1>ClassScout Cards API</h1>
      <p>Card generation feed for ClassScout activity discovery</p>
      <h2>Endpoints</h2>
      <ul>
        <li><code>/api/generate</code> - Generate and deliver a card</li>
        <li><code>/api/status</code> - Check service status</li>
        <li><code>/api/history</code> - View generation history</li>
      </ul>
    </div>
  );
}
