import Link from "next/link";

export default function NotFound() {
  return (
    <main style={{
      minHeight: "100vh",
      background: "#0f0f12",
      color: "#f7f7fa",
      fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
      display: "grid",
      placeItems: "center",
      padding: 24,
    }}>
      <div style={{
        maxWidth: 560,
        border: "1px solid #2a2a33",
        borderRadius: 8,
        background: "#15151a",
        padding: 24,
        lineHeight: 1.6,
      }}>
        <div style={{ color: "#8b7cf6", fontSize: 12, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 8 }}>
          RTZ Auction Lab
        </div>
        <h1 style={{ margin: "0 0 10px", fontSize: 26 }}>Nie znaleziono strony</h1>
        <p style={{ color: "#b8b8c0", margin: "0 0 16px" }}>
          Ten adres nie prowadzi do aktywnego widoku aplikacji.
        </p>
        <Link href="/" style={{ color: "#c9c2ff", fontWeight: 800 }}>
          Wróć do symulatora
        </Link>
      </div>
    </main>
  );
}
