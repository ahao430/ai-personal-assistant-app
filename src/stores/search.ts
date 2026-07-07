import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { searchMessages, type SearchChatMessageRow } from "@/api/chat";
import { searchNotes, type NoteRow } from "@/db/repos";

export type SearchKind = "chat" | "note" | "image";

export interface SearchResult {
  id: string;
  kind: SearchKind;
  title: string;
  snippet: string;
  time: number;
  path: string;
}

const IMAGE_STORAGE_KEY = "image-gen-session-v1";

export const useSearchStore = defineStore("search", () => {
  const query = ref("");
  const loading = ref(false);
  const chatResults = ref<SearchResult[]>([]);
  const noteResults = ref<SearchResult[]>([]);
  const imageResults = ref<SearchResult[]>([]);

  const results = computed(() =>
    [...noteResults.value, ...chatResults.value, ...imageResults.value]
      .sort((a, b) => b.time - a.time)
  );

  async function search(text: string) {
    query.value = text;
    const q = text.trim();
    chatResults.value = [];
    noteResults.value = [];
    imageResults.value = [];
    if (!q) return;
    loading.value = true;
    try {
      const [chats, notes] = await Promise.all([
        searchMessages(q),
        searchNotes(q),
      ]);
      chatResults.value = chats.map((row) => mapChat(row, q));
      noteResults.value = notes.map((row) => mapNote(row, q));
      imageResults.value = searchImages(q);
    } finally {
      loading.value = false;
    }
  }

  return { query, loading, results, search };
});

function mapChat(row: SearchChatMessageRow, q: string): SearchResult {
  return {
    id: `chat-${row.id}`,
    kind: "chat",
    title: row.role === "user" ? "用户消息" : "助手回复",
    snippet: snippet(row.content, q),
    time: row.created_at,
    path: "/chat",
  };
}

function mapNote(row: NoteRow, q: string): SearchResult {
  return {
    id: `note-${row.id}`,
    kind: "note",
    title: row.title || "无标题笔记",
    snippet: snippet(`${row.title}\n${row.content}`, q),
    time: row.updated_at,
    path: `/notes/${row.id}`,
  };
}

function searchImages(q: string): SearchResult[] {
  try {
    const raw = localStorage.getItem(IMAGE_STORAGE_KEY);
    if (!raw) return [];
    const session = JSON.parse(raw) as { idea?: unknown; prompt?: unknown; results?: unknown };
    const haystack = [session.idea, session.prompt].filter((v): v is string => typeof v === "string").join("\n");
    if (!haystack.toLowerCase().includes(q.toLowerCase())) return [];
    const results = Array.isArray(session.results) ? session.results : [];
    return results.slice(0, 12).map((item, index) => {
      const path = typeof item === "object" && item !== null && "path" in item && typeof item.path === "string"
        ? item.path
        : index;
      return {
        id: `image-${path}`,
        kind: "image" as const,
        title: "画图结果",
        snippet: snippet(haystack, q),
        time: Date.now() - index,
        path: "/image-gen",
      };
    });
  } catch {
    return [];
  }
}

function snippet(text: string, q: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  const i = clean.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return clean.slice(0, 120) || "（无内容）";
  return clean.slice(Math.max(0, i - 40), i + q.length + 80);
}
