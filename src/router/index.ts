import { createRouter, createWebHistory, type RouteRecordRaw } from "vue-router";

export type TabKey =
  | "dashboard"
  | "chat"
  | "calendar"
  | "tasks"
  | "notes"
  | "image-gen"
  | "more"
  | "settings";

const routes: RouteRecordRaw[] = [
  {
    path: "/",
    redirect: "/dashboard",
  },
  {
    path: "/dashboard",
    name: "dashboard",
    component: () => import("@/views/Dashboard.vue"),
    meta: { tab: "dashboard", title: "今日" },
  },
  {
    path: "/chat",
    name: "chat",
    component: () => import("@/views/Chat.vue"),
    meta: { tab: "chat", title: "对话" },
  },
  {
    path: "/calendar",
    name: "calendar",
    component: () => import("@/views/Calendar.vue"),
    meta: { tab: "calendar", title: "日历" },
  },
  {
    path: "/tasks",
    name: "tasks",
    component: () => import("@/views/Tasks.vue"),
    meta: { tab: "tasks", title: "待办" },
  },
  {
    path: "/notes",
    name: "notes",
    component: () => import("@/views/Notes.vue"),
    meta: { tab: "notes", title: "笔记" },
  },
  {
    path: "/notes/:id",
    name: "note-edit",
    component: () => import("@/views/NoteEdit.vue"),
    meta: { tab: "notes", title: "笔记" },
  },
  {
    path: "/more",
    name: "more",
    component: () => import("@/views/More.vue"),
    meta: { tab: "more", title: "更多" },
  },
  {
    path: "/image-gen",
    name: "image-gen",
    component: () => import("@/views/ImageGen.vue"),
    meta: { tab: "image-gen", title: "画图" },
  },
  {
    path: "/settings",
    name: "settings",
    component: () => import("@/views/Settings/index.vue"),
    meta: { tab: "settings", title: "我的" },
  },
  {
    path: "/settings/llm",
    name: "settings-llm",
    component: () => import("@/views/Settings/LLM.vue"),
    meta: { tab: "settings", title: "大模型管理" },
  },
  {
    path: "/settings/llm/edit/:configId?",
    name: "settings-llm-edit",
    component: () => import("@/views/Settings/LLMEdit.vue"),
    meta: { tab: "settings", title: "大模型" },
  },
  {
    path: "/settings/image",
    name: "settings-image",
    component: () => import("@/views/Settings/ImageModel.vue"),
    meta: { tab: "settings", title: "画图模型管理" },
  },
  {
    path: "/settings/image/edit/:configId?",
    name: "settings-image-edit",
    component: () => import("@/views/Settings/ImageModelEdit.vue"),
    meta: { tab: "settings", title: "画图模型" },
  },
  {
    path: "/settings/weather",
    name: "settings-weather",
    component: () => import("@/views/Settings/Weather.vue"),
    meta: { tab: "settings", title: "天气工具" },
  },
  {
    path: "/settings/chat-background",
    name: "settings-chat-background",
    component: () => import("@/views/Settings/ChatBackground.vue"),
    meta: { tab: "settings", title: "对话背景" },
  },
  {
    path: "/settings/sync",
    name: "settings-sync",
    component: () => import("@/views/Settings/Sync.vue"),
    meta: { tab: "settings", title: "同步" },
  },
  {
    path: "/settings/signaling-help",
    name: "settings-signaling-help",
    component: () => import("@/views/Settings/SignalingHelp.vue"),
    meta: { tab: "settings", title: "信令配置说明" },
  },
  {
    path: "/settings/webdav-help",
    name: "settings-webdav-help",
    component: () => import("@/views/Settings/WebDAVHelp.vue"),
    meta: { tab: "settings", title: "WebDAV 配置说明" },
  },
  {
    path: "/settings/about",
    name: "settings-about",
    component: () => import("@/views/Settings/About.vue"),
    meta: { tab: "settings", title: "关于" },
  },
  {
    path: "/reports",
    name: "reports",
    component: () => import("@/views/DailyReport.vue"),
    meta: { tab: "settings", title: "每日日报" },
  },
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior() {
    return { top: 0 };
  },
});
