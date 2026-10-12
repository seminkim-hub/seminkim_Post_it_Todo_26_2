"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Check, ClipboardList, Moon, Pencil, Plus, Search, Sun, Trash2 } from "lucide-react";

type Category = "할 일" | "아이디어" | "기타";
type Note = { id: string; text: string; category: Category; date: string; color: string; done?: boolean };
type SheetNote = { id: string; timestamp: string; datetime: string; category: Category; content: string; color: string; state: string; order: number };
const categories = ["전체", "할 일", "아이디어", "기타"] as const;
const colors = ["yellow", "pink", "green", "blue"];
const seedNotes: Note[] = [
  { id: "a1", text: "이번 주 안에 포트폴리오 첫 화면 정리하기\n\n완벽하게 하려 말고, 일단 초안부터!", category: "할 일", date: "2026-10-12T09:30:00", color: "yellow" },
  { id: "a2", text: "동네 카페 지도를 만들어보면 어떨까?\n\n조용한 곳 · 콘센트 · 와이파이 정보까지 모아보기", category: "아이디어", date: "2026-10-12T10:15:00", color: "pink" },
  { id: "a3", text: "좋은 디자인은 더하는 게 아니라 덜어내는 것.\n\n오늘의 작은 메모 ✍️", category: "기타", date: "2026-10-11T16:40:00", color: "green" },
  { id: "a4", text: "읽고 싶은 책\n\n• 아주 작은 습관의 힘\n• 디자인의 디자인\n• 생각에 관한 생각", category: "할 일", date: "2026-10-10T14:20:00", color: "blue" },
];

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value));
}

function fromSheet(note: SheetNote): Note {
  return { id: note.id || note.timestamp, text: note.content, category: note.category, date: note.datetime, color: note.color, done: note.state === "완료" || note.state === "체크" };
}

async function sheetRequest(action: string, values: Record<string, unknown> = {}) {
  const response = await fetch("/api/notes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...values }) });
  const payload = await response.json() as { error?: string; note?: SheetNote };
  if (!response.ok) throw new Error(payload.error ?? "Google 시트와 통신하지 못했습니다.");
  return payload;
}

export default function Home() {
  const [notes, setNotes] = useState<Note[]>(seedNotes);
  const [filter, setFilter] = useState<(typeof categories)[number]>("전체");
  const [text, setText] = useState("");
  const [category, setCategory] = useState<Category>("할 일");
  const [editing, setEditing] = useState<string | null>(null);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [dragId, setDragId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [today, setToday] = useState("");
  const [sheetsConnected, setSheetsConnected] = useState(false);
  const [syncError, setSyncError] = useState("");

  useEffect(() => {
    const hydrate = async () => {
      setToday(new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "long", day: "numeric", weekday: "long" }).format(new Date()));
      try {
        const response = await fetch("/api/notes", { cache: "no-store" });
        if (!response.ok) throw new Error("시트 연결 설정 전이거나 Google 시트에 연결할 수 없습니다.");
        const payload = await response.json() as { enabled?: boolean; notes?: SheetNote[] };
        if (payload.enabled) {
          setNotes((payload.notes ?? []).map(fromSheet));
          setSheetsConnected(true);
        } else {
          const saved = localStorage.getItem("jjak-notes-v1");
          if (saved) setNotes(JSON.parse(saved) as Note[]);
        }
      } catch {
        const saved = localStorage.getItem("jjak-notes-v1");
        if (saved) setNotes(JSON.parse(saved) as Note[]);
      }
      try {
        const savedTheme = localStorage.getItem("jjak-theme");
        if (savedTheme === "dark" || savedTheme === "light") setTheme(savedTheme);
      } catch { /* 브라우저 저장소를 사용할 수 없는 경우 기본 테마를 유지합니다. */ }
      setReady(true);
    };
    const timer = window.setTimeout(() => { void hydrate(); }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!ready) return;
    localStorage.setItem("jjak-notes-v1", JSON.stringify(notes));
    localStorage.setItem("jjak-theme", theme);
  }, [notes, theme, ready]);

  const visibleNotes = useMemo(() => notes.filter((note) => filter === "전체" || note.category === filter), [notes, filter]);
  async function saveNote() {
    const clean = text.trim();
    if (!clean) return;
    setSyncError("");
    try {
      if (sheetsConnected) {
        if (editing) {
          const oldNote = notes.find((note) => note.id === editing);
          if (!oldNote) return;
          const payload = await sheetRequest("update", { id: editing, note: { category, content: clean, color: oldNote.color, state: oldNote.done ? "완료" : "진행 중", order: notes.indexOf(oldNote) } });
          if (payload.note) setNotes((current) => current.map((note) => note.id === editing ? fromSheet(payload.note!) : note));
        } else {
          const payload = await sheetRequest("create", { note: { datetime: new Date().toISOString(), category, content: clean, color: colors[Math.floor(Math.random() * colors.length)], state: "진행 중", order: 0 } });
          if (payload.note) setNotes((current) => [fromSheet(payload.note!), ...current]);
        }
      } else if (editing) setNotes((current) => current.map((note) => note.id === editing ? { ...note, text: clean, category } : note));
      else setNotes((current) => [{ id: crypto.randomUUID(), text: clean, category, date: new Date().toISOString(), color: colors[Math.floor(Math.random() * colors.length)] }, ...current]);
      setText(""); setEditing(null);
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : "Google 시트 저장에 실패했습니다.");
    }
  }

  async function removeNote(note: Note) {
    setSyncError("");
    try {
      if (sheetsConnected) await sheetRequest("delete", { id: note.id });
      setNotes((current) => current.filter((item) => item.id !== note.id));
    } catch (error) { setSyncError(error instanceof Error ? error.message : "Google 시트에서 메모를 삭제하지 못했습니다."); }
  }

  async function toggleDone(note: Note) {
    const done = !note.done;
    setSyncError("");
    try {
      if (sheetsConnected) {
        const payload = await sheetRequest("update", { id: note.id, note: { category: note.category, content: note.text, color: note.color, state: done ? "완료" : "진행 중", order: notes.indexOf(note) } });
        if (payload.note) setNotes((current) => current.map((item) => item.id === note.id ? fromSheet(payload.note!) : item));
        else setNotes((current) => current.map((item) => item.id === note.id ? { ...item, done } : item));
      } else setNotes((current) => current.map((item) => item.id === note.id ? { ...item, done } : item));
    } catch (error) { setSyncError(error instanceof Error ? error.message : "완료 상태를 저장하지 못했습니다."); }
  }

  function editNote(note: Note) { setEditing(note.id); setText(note.text); setCategory(note.category); window.scrollTo({ top: 0, behavior: "smooth" }); }
  function reorder(targetId: string) {
    if (!dragId || dragId === targetId) return;
    const next = [...notes];
    const from = next.findIndex((note) => note.id === dragId);
    const to = next.findIndex((note) => note.id === targetId);
    if (from < 0 || to < 0) return;
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    setNotes(next);
    if (sheetsConnected) void sheetRequest("reorder", { items: next.map((note, order) => ({ id: note.id, order })) }).catch((error: unknown) => setSyncError(error instanceof Error ? error.message : "메모 순서를 저장하지 못했습니다."));
    setDragId(null);
  }

  return (
    <main className={`app-shell ${theme}`}>
      <div className="ambient ambient-one" /><div className="ambient ambient-two" />
      <header className="topbar">
        <div className="topbar-spacer" />
        <div className="topbar-right"><button className="theme-toggle" onClick={() => setTheme(theme === "light" ? "dark" : "light")} aria-label={theme === "light" ? "다크 모드로 전환" : "라이트 모드로 전환"} title={theme === "light" ? "다크 모드로 전환" : "라이트 모드로 전환"}>{theme === "light" ? <Moon size={17} /> : <Sun size={17} />}</button></div>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy"><div className="hero-date">{today}</div><h1>Post-it Todo List</h1></div>
      </section>

      <section className="composer-wrap" aria-label="새 메모 작성"><div className="composer-top"><span className="composer-icon"><Pencil size={16} /></span><span className="composer-heading">{editing ? "메모 수정하기" : "메모를 작성해보세요"}</span><span className="composer-hint">⌘ + Enter</span></div><textarea className="note-input" placeholder="포스트잇 내용을 작성해보세요" value={text} onChange={(event) => setText(event.target.value)} onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === "Enter") saveNote(); }} rows={3} /><div className="composer-bottom"><label className="select-label"><span>분류</span><select value={category} onChange={(event) => setCategory(event.target.value as Category)}><option>할 일</option><option>아이디어</option><option>기타</option></select><ArrowDown size={13} /></label><div className="composer-actions">{editing && <button className="cancel-button" onClick={() => { setEditing(null); setText(""); }}>취소</button>}<button className="add-button" onClick={saveNote} disabled={!text.trim()}>{editing ? <Check size={15} /> : <Plus size={16} />}<span>{editing ? "수정 완료" : "메모 붙이기"}</span></button></div></div></section>

      <section className="board-section"><div className="board-heading"><h2 className="board-title">내 포스트잇 목록</h2><div className="board-controls"><div className="search-box"><Search size={15} /><span>메모를 모아보세요</span></div><label className="filter-select"><span>카테고리</span><select value={filter} onChange={(event) => setFilter(event.target.value as (typeof categories)[number])}>{categories.map((item) => <option key={item}>{item}</option>)}</select><ArrowDown size={13} /></label></div></div>
        {visibleNotes.length ? (
          <div className="notes-grid">
            {visibleNotes.map((note, index) => (
              <article key={note.id} className={`note-card note-${note.color} ${note.done ? "note-done" : ""} ${dragId === note.id ? "is-dragging" : ""}`} style={{ "--note-delay": `${Math.min(index * 70, 350)}ms` } as React.CSSProperties} draggable onDragStart={(event) => { setDragId(note.id); event.dataTransfer.effectAllowed = "move"; }} onDragEnd={() => setDragId(null)} onDragOver={(event) => event.preventDefault()} onDrop={() => reorder(note.id)}>
                <div className="tape" />
                <div className="note-card-top"><span className="category-pill"><span className="category-dot" />{note.category}</span><div className="note-actions">
                  <button onClick={() => editNote(note)} aria-label="메모 편집"><Pencil size={14} /></button>
                  <button onClick={() => void removeNote(note)} aria-label="메모 삭제"><Trash2 size={14} /></button>
                  <button className={`complete-button ${note.done ? "is-complete" : ""}`} onClick={() => void toggleDone(note)} aria-label={note.done ? "완료 표시 해제" : "메모 완료 표시"} title={note.done ? "완료 표시 해제" : "완료 표시"}><Check size={14} /></button>
                </div></div>
                <p className="note-text">{note.text}</p>
                {note.done && <div className="done-stamp"><Check size={13} /> 완료</div>}
                <div className="note-footer"><time>{formatDate(note.date)}</time><span className="drag-hint"><ArrowUp size={12} /> 드래그해서 이동</span></div>
              </article>
            ))}
          </div>
        ) : <div className="empty-state"><span className="empty-icon"><ClipboardList size={22} /></span><h3>아직 메모가 없어요</h3><p>첫 번째 생각을 적어 보드에 붙여보세요.</p></div>}
        {syncError && <p className="sync-error" role="alert">{syncError}</p>}
        <div className="board-footer"><span><span className={`footer-dot ${sheetsConnected ? "connected" : ""}`} /> {sheetsConnected ? "Google 시트와 동기화 중" : "이 기기에 저장 중 · Google 시트 연결 전"}</span><span>마음껏 적고, 자유롭게 옮겨보세요 <span className="footer-sparkle">✳</span></span></div>
      </section>
      <footer className="page-footer"><span>Copyright INU Post-it Todo List by Semin Kim</span></footer>
    </main>
  );
}
