"use client";

import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";

const DAYS = ["Måndag", "Tisdag", "Onsdag", "Torsdag", "Fredag"];
const DAY_SHORT = ["Mån", "Tis", "Ons", "Tor", "Fre"];

function getWeekNumber(d) {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + 3 - ((date.getDay() + 6) % 7));
  const w1 = new Date(date.getFullYear(), 0, 4);
  return 1 + Math.round(((date - w1) / 86400000 - 3 + ((w1.getDay() + 6) % 7)) / 7);
}

function currentWeekKey() {
  const now = new Date();
  return `${now.getFullYear()}-W${getWeekNumber(now)}`;
}

function Tag({ color, children }) {
  const styles = {
    green: { background: "#d1fae5", color: "#065f46" },
    amber: { background: "#fef3c7", color: "#92400e" },
    red: { background: "#fee2e2", color: "#991b1b" },
    blue: { background: "#dbeafe", color: "#1e40af" },
    gray: { background: "#f3f4f6", color: "#374151" },
  };
  return (
    <span style={{ ...styles[color], padding: "2px 8px", borderRadius: 12, fontSize: 11, fontWeight: 600, fontFamily: "'DM Mono',monospace" }}>
      {children}
    </span>
  );
}

function Avatar({ name, size = 32 }) {
  const initials = name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  const hue = [...name].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  return (
    <div title={name} style={{ width: size, height: size, borderRadius: "50%", background: `hsl(${hue},55%,55%)`, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.36, fontWeight: 700, fontFamily: "'DM Mono',monospace", flexShrink: 0 }}>
      {initials}
    </div>
  );
}

export default function LunchPlanner() {
  const [tab, setTab] = useState("overview");
  const [names, setNames] = useState([]);
  const [availability, setAvailability] = useState({});
  const [hanaskogMenu, setHanaskogMenu] = useState(null);
  const [araslofMenu, setAraslofMenu] = useState(null);
  const [weekKey] = useState(currentWeekKey());
  const [loading, setLoading] = useState({ pdf: false, araslof: false, init: true });
  const [newName, setNewName] = useState("");
  const [toast, setToast] = useState(null);

  useEffect(() => {
    loadAll();
    const ch = supabase
      .channel("realtime-lunch")
      .on("postgres_changes", { event: "*", schema: "public", table: "persons" }, loadPersons)
      .on("postgres_changes", { event: "*", schema: "public", table: "availability" }, loadAvailability)
      .on("postgres_changes", { event: "*", schema: "public", table: "menus" }, loadMenus)
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, []);

  async function loadAll() {
    setLoading(l => ({ ...l, init: true }));
    await Promise.all([loadPersons(), loadAvailability(), loadMenus()]);
    setLoading(l => ({ ...l, init: false }));
  }

  async function loadPersons() {
    const { data } = await supabase.from("persons").select("name").order("created_at");
    if (data) setNames(data.map(p => p.name));
  }

  async function loadAvailability() {
    const { data } = await supabase.from("availability").select("*").eq("week_key", weekKey);
    if (data) {
      const av = {};
      data.forEach(r => { av[`${r.person_name}-${r.day_index}`] = r.available; });
      setAvailability(av);
    }
  }

  async function loadMenus() {
    const { data } = await supabase.from("menus").select("*").eq("week_key", weekKey);
    if (data) {
      const h = data.find(m => m.restaurant === "hanaskog");
      const ar = data.find(m => m.restaurant === "araslof");
      if (h) setHanaskogMenu(h.data);
      if (ar) setAraslofMenu(ar.data);
    }
  }

  const showToast = (msg, type = "ok") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const toggleDay = async (name, dayIdx) => {
    const next = !availability[`${name}-${dayIdx}`];
    setAvailability(av => ({ ...av, [`${name}-${dayIdx}`]: next }));
    await supabase.from("availability").upsert(
      { person_name: name, week_key: weekKey, day_index: dayIdx, available: next },
      { onConflict: "person_name,week_key,day_index" }
    );
  };

  const addPerson = async () => {
    const n = newName.trim();
    if (!n || names.includes(n)) return;
    setNewName("");
    const { error } = await supabase.from("persons").insert({ name: n });
    if (error) showToast("Kunde inte lägga till person", "err");
  };

  const removePerson = async (name) => {
    await supabase.from("persons").delete().eq("name", name);
    await supabase.from("availability").delete().eq("person_name", name);
  };

  const handlePDF = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(l => ({ ...l, pdf: true }));
    try {
      const formData = new FormData();
      formData.append("file", file);
      const resp = await fetch("/api/extract-menu", { method: "POST", body: formData });
      const result = await resp.json();
      if (result.error) showToast(result.error, "err");
      else {
        const menuData = { pdfUrl: result.pdfUrl };
        setHanaskogMenu(menuData);
        await supabase.from("menus").upsert(
          { week_key: weekKey, restaurant: "hanaskog", data: menuData, updated_at: new Date().toISOString() },
          { onConflict: "week_key,restaurant" }
        );
        showToast("Menyn uppladdad!", "ok");
      }
    } catch { showToast("Fel vid uppladdning", "err"); }
    setLoading(l => ({ ...l, pdf: false }));
    e.target.value = "";
  };

  const fetchAraslof = async () => {
    setLoading(l => ({ ...l, araslof: true }));
    try {
      const resp = await fetch("/api/araslof-menu");
      const data = await resp.json();
      setAraslofMenu(data);
      if (!data.error) {
        await supabase.from("menus").upsert(
          { week_key: weekKey, restaurant: "araslof", data, updated_at: new Date().toISOString() },
          { onConflict: "week_key,restaurant" }
        );
        showToast("Araslövs meny hämtad!", "ok");
      } else showToast("Araslöv: " + data.error, "warn");
    } catch { showToast("Fel vid hämtning", "err"); }
    setLoading(l => ({ ...l, araslof: false }));
  };

  const dayStats = DAYS.map((day, i) => ({
    day, short: DAY_SHORT[i],
    available: names.filter(n => availability[`${n}-${i}`]),
  }));

  const S = {
    app: { fontFamily: "'DM Sans',sans-serif", minHeight: "100vh", background: "#fafaf8", color: "#1c1c1a" },
    header: { background: "#1c1c1a", color: "#fafaf8", padding: "20px 24px 0", position: "sticky", top: 0, zIndex: 10 },
    title: { fontFamily: "'Playfair Display',serif", fontSize: 26, fontWeight: 700, margin: 0, letterSpacing: "-0.5px" },
    subtitle: { fontSize: 12, color: "#a0a09a", marginTop: 2, fontFamily: "'DM Mono',monospace" },
    tabs: { display: "flex", gap: 0, marginTop: 16 },
    tab: (active) => ({ padding: "10px 18px", fontSize: 13, fontWeight: 600, border: "none", background: "none", color: active ? "#f5c842" : "#a0a09a", borderBottom: active ? "2px solid #f5c842" : "2px solid transparent", cursor: "pointer", transition: "all 0.15s", fontFamily: "'DM Sans',sans-serif" }),
    body: { padding: "20px 16px", maxWidth: 680, margin: "0 auto" },
    card: { background: "#fff", borderRadius: 12, border: "1px solid #e8e8e4", padding: 20, marginBottom: 16 },
    cardTitle: { fontFamily: "'Playfair Display',serif", fontSize: 16, fontWeight: 700, marginBottom: 12, display: "flex", alignItems: "center", gap: 8 },
    dayRow: { display: "grid", gridTemplateColumns: "70px 1fr auto", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: "1px solid #f0f0ec" },
    dayLabel: { fontFamily: "'DM Mono',monospace", fontSize: 13, fontWeight: 600, color: "#555" },
    avatarGroup: { display: "flex", gap: 4, flexWrap: "wrap" },
    btn: (color = "dark") => ({ padding: color === "sm" ? "6px 12px" : "9px 16px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13, fontFamily: "'DM Sans',sans-serif", background: color === "dark" ? "#1c1c1a" : color === "sm" ? "#f0f0ec" : "#e8f4fd", color: color === "sm" ? "#555" : "#fff", transition: "opacity 0.15s" }),
    input: { padding: "9px 12px", borderRadius: 8, border: "1.5px solid #e0e0da", fontSize: 13, fontFamily: "'DM Sans',sans-serif", background: "#fafaf8", outline: "none", flex: 1 },
    checkDay: (checked) => ({ width: 36, height: 36, borderRadius: 8, border: checked ? "none" : "1.5px solid #ddd", background: checked ? "#f5c842" : "#fafaf8", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, transition: "all 0.15s", flexShrink: 0 }),
    toast: (type) => ({ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", background: type === "err" ? "#ef4444" : type === "warn" ? "#f59e0b" : "#10b981", color: "#fff", padding: "10px 20px", borderRadius: 24, fontSize: 13, fontWeight: 600, boxShadow: "0 4px 20px rgba(0,0,0,0.15)", zIndex: 100, whiteSpace: "nowrap" }),
  };

  if (loading.init) {
    return (
      <div style={{ ...S.app, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 24, marginBottom: 8 }}>🍽 Veckans Lunch</div>
          <div style={{ color: "#888", fontSize: 13 }}>Laddar...</div>
        </div>
      </div>
    );
  }

  return (
    <div style={S.app}>
      <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=DM+Sans:wght@400;600;700&family=DM+Mono:wght@400;600&display=swap" rel="stylesheet" />
      <div style={S.header}>
        <div style={S.title}>🍽 Veckans Lunch</div>
        <div style={S.subtitle}>{weekKey} · {names.length} personer · realtid 🟢</div>
        <div style={S.tabs}>
          {[["overview", "Översikt"], ["availability", "Tillgänglighet"], ["menus", "Menyer"], ["people", "Lag"]].map(([id, label]) => (
            <button key={id} style={S.tab(tab === id)} onClick={() => setTab(id)}>{label}</button>
          ))}
        </div>
      </div>

      <div style={S.body}>
        {tab === "overview" && (
          <>
            <div style={S.card}>
              <div style={S.cardTitle}>📅 Vem är ledig när?</div>
              {dayStats.map(({ day, short, available }, i) => (
                <div key={i} style={S.dayRow}>
                  <div>
                    <div style={S.dayLabel}>{short}</div>
                    <Tag color={available.length >= 4 ? "green" : available.length >= 2 ? "amber" : "red"}>{available.length} pers</Tag>
                  </div>
                  <div style={S.avatarGroup}>
                    {available.length === 0
                      ? <span style={{ fontSize: 12, color: "#bbb" }}>Ingen tillgänglig</span>
                      : available.map(n => <Avatar key={n} name={n} size={28} />)}
                  </div>
                  <div style={{ fontSize: 11, color: "#888", textAlign: "right", minWidth: 60 }}>
                    {hanaskogMenu?.pdfUrl && <span style={{ color: "#10b981", display: "block" }}>✓ Hanaskog</span>}
                    {araslofMenu?.imageUrl && <span style={{ color: "#3b82f6", display: "block" }}>✓ Araslöv</span>}
                  </div>
                </div>
              ))}
            </div>
            {names.length > 0 && (() => {
              const best = [...dayStats].sort((a, b) => b.available.length - a.available.length)[0];
              return best.available.length > 0 ? (
                <div style={{ ...S.card, background: "#1c1c1a", color: "#fafaf8" }}>
                  <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 15, marginBottom: 6 }}>⭐ Bästa lunchdag</div>
                  <div style={{ fontSize: 22, fontWeight: 700 }}>{best.day}</div>
                  <div style={{ color: "#f5c842", fontFamily: "'DM Mono',monospace", fontSize: 13, marginTop: 4 }}>
                    {best.available.join(", ")} · {best.available.length} personer
                  </div>
                </div>
              ) : null;
            })()}
          </>
        )}

        {tab === "availability" && (
          <>
            {names.length === 0 && <div style={{ ...S.card, textAlign: "center", color: "#888", padding: 32 }}>Lägg till personer under "Lag"</div>}
            {names.map(name => (
              <div key={name} style={S.card}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                  <Avatar name={name} size={34} />
                  <span style={{ fontWeight: 700, fontSize: 15 }}>{name}</span>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {DAYS.map((day, i) => (
                    <div key={i} style={{ textAlign: "center" }}>
                      <div style={{ fontSize: 10, fontFamily: "'DM Mono',monospace", color: "#888", marginBottom: 4 }}>{DAY_SHORT[i]}</div>
                      <div style={S.checkDay(!!availability[`${name}-${i}`])} onClick={() => toggleDay(name, i)}>
                        {availability[`${name}-${i}`] ? "✓" : ""}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </>
        )}

        {tab === "menus" && (
          <>
            <div style={S.card}>
              <div style={S.cardTitle}>🏘 Hanaskog <Tag color="gray">PDF</Tag></div>
              {hanaskogMenu?.pdfUrl ? (
                <>
                  <iframe src={hanaskogMenu.pdfUrl} style={{ width: "100%", height: 500, border: "none", borderRadius: 8 }} />
                  <div style={{ marginTop: 12 }}>
                    <label style={{ ...S.btn("sm"), display: "inline-block", cursor: "pointer" }}>
                      {loading.pdf ? "⏳ Laddar upp..." : "🔄 Uppdatera PDF"}
                      <input type="file" accept=".pdf" onChange={handlePDF} style={{ display: "none" }} disabled={loading.pdf} />
                    </label>
                  </div>
                </>
              ) : (
                <div style={{ textAlign: "center", padding: 20 }}>
                  <div style={{ color: "#888", fontSize: 13, marginBottom: 12 }}>Ingen meny uppladdad för denna vecka</div>
                  <label style={{ ...S.btn("dark"), display: "inline-block", cursor: "pointer" }}>
                    {loading.pdf ? "⏳ Laddar upp..." : "📤 Ladda upp PDF-meny"}
                    <input type="file" accept=".pdf" onChange={handlePDF} style={{ display: "none" }} disabled={loading.pdf} />
                  </label>
                </div>
              )}
            </div>

            <div style={S.card}>
              <div style={S.cardTitle}>🌿 Araslöv <Tag color="blue">Webb</Tag></div>
              {araslofMenu?.imageUrl ? (
                <>
                  <img src={araslofMenu.imageUrl} alt="Araslövs veckameny" style={{ width: "100%", borderRadius: 8, display: "block" }} />
                  <div style={{ marginTop: 12 }}>
                    <button style={S.btn("sm")} onClick={fetchAraslof} disabled={loading.araslof}>
                      {loading.araslof ? "⏳ Hämtar..." : "🔄 Uppdatera"}
                    </button>
                  </div>
                </>
              ) : (
                <div style={{ textAlign: "center", padding: 20 }}>
                  {araslofMenu?.error && <div style={{ color: "#f59e0b", fontSize: 12, marginBottom: 8 }}>{araslofMenu.error}</div>}
                  <div style={{ color: "#888", fontSize: 13, marginBottom: 12 }}>Hämta veckans meny automatiskt</div>
                  <button style={S.btn("dark")} onClick={fetchAraslof} disabled={loading.araslof}>
                    {loading.araslof ? "⏳ Hämtar bild..." : "🌐 Hämta Araslövs meny"}
                  </button>
                </div>
              )}
            </div>
          </>
        )}

        {tab === "people" && (
          <>
            <div style={S.card}>
              <div style={S.cardTitle}>➕ Lägg till person</div>
              <div style={{ display: "flex", gap: 8 }}>
                <input style={S.input} placeholder="Namn..." value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => e.key === "Enter" && addPerson()} />
                <button style={S.btn("dark")} onClick={addPerson}>Lägg till</button>
              </div>
            </div>
            <div style={S.card}>
              <div style={S.cardTitle}>👥 Teamet ({names.length})</div>
              {names.length === 0 && <div style={{ color: "#bbb", fontSize: 13, textAlign: "center", padding: 12 }}>Inga personer ännu</div>}
              {names.map(name => (
                <div key={name} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid #f0f0ec" }}>
                  <Avatar name={name} size={32} />
                  <span style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>{name}</span>
                  <div style={{ fontSize: 12, color: "#888", fontFamily: "'DM Mono',monospace" }}>
                    {DAYS.filter((_, i) => availability[`${name}-${i}`]).length}/5 dagar
                  </div>
                  <button onClick={() => removePerson(name)} style={{ background: "none", border: "none", color: "#ccc", cursor: "pointer", fontSize: 18, padding: "0 4px" }}>×</button>
                </div>
              ))}
            </div>
            <div style={{ ...S.card, background: "#f0fdf4", border: "1px solid #bbf7d0" }}>
              <div style={{ fontSize: 13, color: "#166534" }}>
                <strong>✅ Realtid:</strong> All data delas direkt med hela teamet. Ingen refresh behövs.
              </div>
            </div>
          </>
        )}
      </div>

      {toast && <div style={S.toast(toast.type)}>{toast.msg}</div>}
    </div>
  );
}
