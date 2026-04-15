import "./globals.css";

export const metadata = {
  title: "RTZ Auction Lab",
  description: "Validated simulator and fairness-aware redesign for RTZ auctions.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="pl">
      <body>{children}</body>
    </html>
  );
}
