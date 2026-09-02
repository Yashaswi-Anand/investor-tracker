"use client";

/**
 * The last resort: an error thrown by the root layout itself.
 *
 * error.jsx cannot catch that one, because the boundary lives inside the
 * layout it would have to replace. This file does, and so it has to supply
 * its own <html> and <body> — the layout that normally provides them is the
 * thing that failed.
 *
 * Styled inline for the same reason. Whatever went wrong took the layout with
 * it, and that is where the stylesheet is loaded from; a class name here
 * would be a bet that the CSS arrived, on the one screen that exists because
 * something did not. The colours are the site's, written out by hand.
 */

const wrap = {
  minHeight: "100vh",
  margin: 0,
  display: "grid",
  placeItems: "center",
  padding: "24px",
  background: "#faf6f2",
  color: "#2b1d16",
  fontFamily:
    "'Plus Jakarta Sans', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
};

const card = {
  maxWidth: "420px",
  width: "100%",
  padding: "28px 24px",
  borderRadius: "18px",
  background: "#fff",
  border: "1px solid #eadfd6",
  boxShadow: "0 18px 48px -24px rgba(109, 50, 32, 0.45)",
  textAlign: "center",
};

const button = {
  marginTop: "18px",
  padding: "12px 24px",
  border: "none",
  borderRadius: "999px",
  background: "linear-gradient(120deg, #b4441f, #d97742)",
  color: "#fff",
  font: "inherit",
  fontWeight: 700,
  cursor: "pointer",
};

export default function GlobalError() {
  return (
    <html lang="en">
      <body style={wrap}>
        <main style={card}>
          <h1 style={{ margin: "0 0 8px", fontSize: "1.25rem" }}>
            The site failed to load
          </h1>
          <p style={{ margin: 0, fontSize: "0.9rem", color: "#7a6559", lineHeight: 1.6 }}>
            This is on our side, not yours. Reloading usually fixes it.
          </p>
          <button
            type="button"
            style={button}
            onClick={() => window.location.reload()}
          >
            Reload
          </button>
        </main>
      </body>
    </html>
  );
}
