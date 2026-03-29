export default function HomePage() {
  const mockMode = ["1", "true", "yes", "on"].includes((process.env.MOCK_MODE ?? "").toLowerCase());

  return (
    <main style={{ fontFamily: "sans-serif", padding: 24, lineHeight: 1.5 }}>
      <h1 style={{ margin: 0 }}>VibeLyster Server</h1>
      <p style={{ marginTop: 8 }}>
        Server is running.
      </p>
      <p style={{ marginTop: 8 }}>
        Mode: <strong>{mockMode ? "MOCK_MODE=1" : "live"}</strong>
      </p>
      <p style={{ marginTop: 8 }}>
        Try API route: <code>/api/listings</code>
      </p>
    </main>
  );
}
