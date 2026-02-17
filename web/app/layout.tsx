export const metadata = { title: "Fruit Commerce MVP", description: "Fulfillment MVP" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hant">
      <body style={{ fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Noto Sans TC, sans-serif", padding: 24 }}>
        {children}
      </body>
    </html>
  );
}
