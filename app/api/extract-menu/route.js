import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export async function POST(request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!file) return Response.json({ error: "Ingen fil skickades" }, { status: 400 });

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const filename = `hanaskog-v${Date.now()}.pdf`;

    const { data, error } = await supabase.storage
      .from("menus")
      .upload(filename, buffer, { contentType: "application/pdf", upsert: true });

    if (error) return Response.json({ error: error.message }, { status: 500 });

    const { data: urlData } = supabase.storage.from("menus").getPublicUrl(filename);
    return Response.json({ pdfUrl: urlData.publicUrl });
  } catch (err) {
    console.error("extract-menu error:", err);
    return Response.json({ error: "Serverfel" }, { status: 500 });
  }
}
