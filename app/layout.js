export const metadata = {
  title: "Veckans Lunch",
  description: "Lunchplanering för teamet",
};

export default function RootLayout({ children }) {
  return (
    <html lang="sv">
      <body style={{ margin: 0, padding: 0 }}>{children}</body>
    </html>
  );
}
