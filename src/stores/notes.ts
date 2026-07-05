import { defineStore } from "pinia";
import { ref } from "vue";
import {
  deleteNote,
  deleteNotes,
  listNotes,
  upsertNote,
  type NoteRow,
} from "@/db/repos";

export const NOTE_COLORS = [
  { key: "", label: "默认", dot: "#d6d3d1" },
  { key: "amber", label: "琥珀", dot: "#d4a574" },
  { key: "rose", label: "玫红", dot: "#d49b9b" },
  { key: "blue", label: "天青", dot: "#9bb5d4" },
  { key: "green", label: "青翠", dot: "#9bc49b" },
  { key: "violet", label: "紫罗兰", dot: "#b59bd4" },
  { key: "slate", label: "岩灰", dot: "#9ba3ad" },
] as const;

export const NOTE_FONTS = [
  { key: "", label: "系统" },
  { key: "songti", label: "宋体" },
  { key: "kaiti", label: "楷体" },
  { key: "mono", label: "等宽" },
] as const;

export const NOTE_PAPERS = [
  { key: "", label: "纯白", bg: "#ffffff" },
  { key: "cream", label: "米黄", bg: "#fdf6e3" },
  { key: "dark", label: "深色", bg: "#2a2a2a" },
  { key: "grid", label: "方格", bg: "#f8f8f8" },
] as const;

export const NOTE_COLOR_MAP = Object.fromEntries(
  NOTE_COLORS.map((c) => [c.key, c])
) as Record<string, typeof NOTE_COLORS[number]>;

export const NOTE_FONT_MAP = Object.fromEntries(
  NOTE_FONTS.map((f) => [f.key, f])
) as Record<string, typeof NOTE_FONTS[number]>;

export const NOTE_PAPER_MAP = Object.fromEntries(
  NOTE_PAPERS.map((p) => [p.key, p])
) as Record<string, typeof NOTE_PAPERS[number]>;

export function fontClass(font: string): string {
  switch (font) {
    case "songti": return "font-songti";
    case "kaiti": return "font-kaiti";
    case "mono": return "font-mono";
    default: return "";
  }
}

export function paperStyle(paper: string): Record<string, string> {
  const p = NOTE_PAPER_MAP[paper];
  if (!p) return {};
  if (paper === "dark") {
    return {
      background: p.bg,
      color: "#e5e5e5",
    };
  }
  if (paper === "grid") {
    return {
      background: `${p.bg}`,
      backgroundImage:
        "linear-gradient(rgba(0,0,0,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.04) 1px, transparent 1px)",
      backgroundSize: "20px 20px",
    };
  }
  return { background: p.bg };
}

export const useNotesStore = defineStore("notes", () => {
  const items = ref<NoteRow[]>([]);
  const loading = ref(false);

  async function reload() {
    loading.value = true;
    try {
      items.value = await listNotes();
    } finally {
      loading.value = false;
    }
  }

  async function save(row: Partial<NoteRow> & { title: string }): Promise<string> {
    const id = await upsertNote(row);
    await reload();
    return id;
  }

  async function remove(id: string) {
    await deleteNote(id);
    items.value = items.value.filter((n) => n.id !== id);
  }

  async function removeMany(ids: string[]) {
    await deleteNotes(ids);
    const set = new Set(ids);
    items.value = items.value.filter((n) => !set.has(n.id));
  }

  return { items, loading, reload, save, remove, removeMany };
});
