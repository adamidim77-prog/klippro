import "./globals.css";

export const metadata = {
  title: "KlipPro",
  description: "Potong video panjang jadi klip pendek berpotensi viral",
};

export default function RootLayout({ children }) {
  return (
    <html lang="id">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <div className="bg-deco" aria-hidden="true">
          <svg width="34" height="34" viewBox="0 0 34 34" style={{ top: 16, right: 20 }}>
            <defs>
              <radialGradient id="moonglow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#fff3c4" stopOpacity="0.5" />
                <stop offset="100%" stopColor="#fff3c4" stopOpacity="0" />
              </radialGradient>
            </defs>
            <circle cx="17" cy="17" r="17" fill="url(#moonglow)" />
            <circle cx="16" cy="16" r="7" fill="#fff3c4" />
            <circle cx="13" cy="13" r="7" fill="#12141c" />
          </svg>

          <svg width="46" height="20" viewBox="0 0 46 20" style={{ top: 60, left: 10, opacity: 0.28 }}>
            <ellipse cx="14" cy="13" rx="12" ry="7" fill="#2c3040" />
            <ellipse cx="26" cy="9" rx="10" ry="8" fill="#2c3040" />
            <ellipse cx="35" cy="13" rx="9" ry="6" fill="#2c3040" />
          </svg>

          <svg width="30" height="14" viewBox="0 0 30 14" style={{ top: 220, right: -4, opacity: 0.22 }}>
            <ellipse cx="9" cy="9" rx="8" ry="5" fill="#2c3040" />
            <ellipse cx="17" cy="6" rx="7" ry="5.5" fill="#2c3040" />
          </svg>

          <svg width="34" height="14" viewBox="0 0 34 14" style={{ bottom: 120, left: -6, opacity: 0.2 }}>
            <ellipse cx="10" cy="9" rx="9" ry="5.5" fill="#2c3040" />
            <ellipse cx="20" cy="6" rx="8" ry="6" fill="#2c3040" />
          </svg>

          {[
            { top: 90, left: 260, size: 9, color: "#ff4557" },
            { top: 140, left: 30, size: 6, color: "#35d0c0" },
            { top: 300, left: 300, size: 7, color: "#eef0f6", op: 0.5 },
            { top: 400, left: 40, size: 5, color: "#ff4557", op: 0.6 },
            { top: 480, left: 280, size: 8, color: "#35d0c0", op: 0.5 },
          ].map((s, i) => (
            <svg
              key={i}
              width={s.size}
              height={s.size}
              viewBox="0 0 24 24"
              fill={s.color}
              style={{ top: s.top, left: s.left, opacity: s.op ?? 0.8 }}
            >
              <path d="M12 2 L14.2 9.8 L22 12 L14.2 14.2 L12 22 L9.8 14.2 L2 12 L9.8 9.8 Z" />
            </svg>
          ))}
        </div>
        {children}
      </body>
    </html>
  );
              }
                                                                  
