export const metadata = {
  title: 'THW Learn AI',
  description: 'Lernplattform für THW-Ausbildung',
}

export default function RootLayout({ children }) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  )
}
