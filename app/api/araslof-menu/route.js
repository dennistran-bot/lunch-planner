export async function GET() {
  try {
    const res = await fetch("https://araslovgolf.se/lunch/", {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    const html = await res.text();

    // Hitta bild-URL för veckans meny (DAGENS-LUNCH-Vxx-JPG.jpg)
    const match = html.match(/https:\/\/araslovgolf\.se\/wp-content\/uploads\/[\d/]+DAGENS-LUNCH-[^"'\s]+\.jpg/i);

    if (!match) {
      return Response.json({ error: "Kunde inte hitta menybild på sidan" }, { status: 404 });
    }

    return Response.json({ imageUrl: match[0] });
  } catch (err) {
    console.error("araslof-menu error:", err);
    return Response.json({ error: "Serverfel vid hämtning" }, { status: 500 });
  }
}
