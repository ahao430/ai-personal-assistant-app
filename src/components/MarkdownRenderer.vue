<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from "vue";
import MarkdownIt from "markdown-it";
// @ts-expect-error markdown-it-katex 没有类型声明
import katexPlugin from "markdown-it-katex";
import hljs from "highlight.js";
import plantumlEncoder from "plantuml-encoder";

const props = defineProps<{
  content: string;
}>();

const root = ref<HTMLDivElement | null>(null);
const rendered = ref("");

const PLANTUML_SERVER = "https://www.plantuml.com/plantuml/png";

const md: MarkdownIt = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
  highlight(code, lang) {
    if (lang === "mermaid") {
      return `<div class="mermaid">${escapeHtml(code)}</div>`;
    }
    if (lang === "plantuml") {
      const encoded = plantumlEncoder.encode(code);
      return `<img class="plantuml" alt="plantuml" src="${PLANTUML_SERVER}/${encoded}" />`;
    }
    if (lang && hljs.getLanguage(lang)) {
      try {
        return hljs.highlight(code, { language: lang, ignoreIllegals: true }).value;
      } catch {
        // fallthrough
      }
    }
    return "";
  },
});

md.use(katexPlugin);

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

let mermaidLoaded = false;
let mermaidApi: typeof import("mermaid").default | null = null;

async function ensureMermaid() {
  if (mermaidLoaded) return mermaidApi;
  try {
    const mod = await import("mermaid");
    mermaidApi = mod.default;
    mermaidApi.initialize({
      startOnLoad: false,
      theme: "neutral",
      securityLevel: "loose",
      fontFamily: "ui-sans-serif, system-ui, -apple-system, 'PingFang SC', sans-serif",
    });
    mermaidLoaded = true;
    return mermaidApi;
  } catch {
    return null;
  }
}

async function renderMermaidBlocks() {
  const el = root.value;
  if (!el) return;
  const blocks = el.querySelectorAll<HTMLElement>(".mermaid");
  if (!blocks.length) return;
  const api = await ensureMermaid();
  if (!api) return;
  for (const [idx, block] of Array.from(blocks).entries()) {
    if (block.dataset.rendered === "1") continue;
    const raw = block.textContent || "";
    const id = `mmd-${idx}-${Math.random().toString(36).slice(2, 8)}`;
    try {
      const result = await api.render(id, raw);
      block.innerHTML = typeof result === "string" ? result : result.svg;
      block.dataset.rendered = "1";
    } catch (e) {
      block.classList.add("mermaid-error");
      block.textContent = `Mermaid 渲染失败：${String(e)}`;
    }
  }
}

function wrapTables() {
  const el = root.value;
  if (!el) return;
  el.querySelectorAll("table").forEach((t) => {
    if (t.dataset.wrapped === "1") return;
    const parent = t.parentElement;
    if (parent && parent.classList.contains("table-wrap")) {
      t.dataset.wrapped = "1";
      return;
    }
    const div = document.createElement("div");
    div.className = "table-wrap";
    t.parentNode?.insertBefore(div, t);
    div.appendChild(t);
    t.dataset.wrapped = "1";
  });
}

function preprocessLatexDelimiters(content: string): string {
  return content
    .replace(/\\\(\s*([\s\S]*?)\s*\\\)/g, (_, p1) => `$${p1.trim()}$`)
    .replace(/\\\[\s*([\s\S]*?)\s*\\\]/g, (_, p1) => `$$${p1.trim()}$$`);
}

async function render() {
  rendered.value = md.render(preprocessLatexDelimiters(props.content || ""));
  await nextTick();
  wrapTables();
  await renderMermaidBlocks();
}

watch(() => props.content, render, { immediate: true });

onBeforeUnmount(() => {
  // nothing
});
</script>

<template>
  <div ref="root" class="md-content markdown-body" v-html="rendered" />
</template>

<style src="github-markdown-css/github-markdown-light.css"></style>
<style src="katex/dist/katex.min.css"></style>
<style src="highlight.js/styles/github.css"></style>

<style>
.md-content {
  font-size: 14px;
  line-height: 1.65;
  word-break: break-word;
  background: transparent;
}

.md-content :deep(.katex-display) {
  overflow-x: auto;
  overflow-y: hidden;
  padding: 0.2em 0;
}

.md-content :deep(.table-wrap) {
  overflow-x: auto;
  margin: 0.6em 0;
  -webkit-overflow-scrolling: touch;
}

.md-content :deep(.mermaid) {
  display: flex;
  justify-content: center;
  margin: 0.5em 0;
}
.md-content :deep(.mermaid svg) {
  max-width: 100%;
  height: auto;
}
.md-content :deep(.mermaid-error) {
  color: #ef4444;
  font-size: 12px;
  padding: 0.4em 0.6em;
  background: #fef2f2;
  border-radius: 4px;
}
.md-content :deep(.plantuml) {
  display: block;
  max-width: 100%;
  margin: 0.5em auto;
}
.md-content :deep(img) {
  max-width: 100%;
  border-radius: 6px;
}
</style>
