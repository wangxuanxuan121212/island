import { z } from "zod";
import seed from "../public/site.json";

export const stationIds = [
  "welcome",
  "career",
  "lab",
  "campus",
  "park",
  "contact",
] as const;
export type StationId = (typeof stationIds)[number];
const text = z
  .string()
  .trim()
  .min(1, "不能为空")
  .max(180, "请控制在 180 字以内");
const detail = z
  .string()
  .trim()
  .min(1, "不能为空")
  .max(2000, "请控制在 2000 字以内");

export const entrySchema = z.object({
  id: z
    .string()
    .regex(/^[a-zA-Z0-9-]+$/, "ID 仅使用字母、数字和连字符")
    .max(80),
  station: z.enum(["career", "lab", "campus", "park"]),
  title: text,
  subtitle: text,
  period: text,
  summary: detail,
  bullets: z.array(detail).min(1).max(12),
  tags: z.array(text).max(10),
  metrics: z.array(z.object({ value: text, label: text })).max(4),
  boundary: z.string().max(1000),
  visible: z.boolean(),
});

export const siteSchema = z
  .object({
    version: z.literal(1),
    profile: z.object({
      name: text,
      englishName: text,
      tagline: z.string().trim().min(1).max(80),
      intro: detail,
      location: text,
      email: z.string().trim().email("请填写有效邮箱").max(180),
      status: text,
      interests: text,
    }),
    appearance: z.object({
      carColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
      shadows: z.boolean(),
      motion: z.boolean(),
    }),
    entries: z.array(entrySchema).max(100),
  })
  .strict()
  .superRefine((value, ctx) => {
    const ids = new Set<string>();
    value.entries.forEach((entry, index) => {
      if (ids.has(entry.id))
        ctx.addIssue({
          code: "custom",
          path: ["entries", index, "id"],
          message: "内容 ID 重复",
        });
      ids.add(entry.id);
    });
  });

export type Site = z.infer<typeof siteSchema>;
export type Entry = z.infer<typeof entrySchema>;
export const defaultSite = siteSchema.parse(seed);
export const DRAFT_KEY = "xuanyu-island:draft:v1";
export const PUBLIC_KEY = "xuanyu-island:published:v1";

export function readSite(key: string): Site {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return siteSchema.parse(JSON.parse(raw));
  } catch {
    // Corrupt or unavailable storage must not prevent visitors from reading.
  }
  return structuredClone(defaultSite);
}

export function publicSite(site: Site): Site {
  return { ...site, entries: site.entries.filter((entry) => entry.visible) };
}

export function saveSite(key: string, site: Site) {
  const data = siteSchema.parse(site);
  localStorage.setItem(key, JSON.stringify(data));
  window.dispatchEvent(new Event("island-content-updated"));
}

export function downloadJSON(site: Site, filename: string) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(site, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const stations: Array<{
  id: StationId;
  name: string;
  english: string;
  number: string;
  color: string;
  position: [number, number];
  spawn: [number, number];
  radius: number;
  description: string;
}> = [
  {
    id: "welcome",
    name: "好奇心广场",
    english: "THE START",
    number: "00",
    color: "#ee725d",
    position: [0, 0],
    spawn: [1, 2],
    radius: 8.8,
    description: "商业的好奇心，技术的行动力。",
  },
  {
    id: "career",
    name: "职业街区",
    english: "THE JOURNEY",
    number: "01",
    color: "#588ab5",
    position: [-15, -5],
    spawn: [-13, 0],
    radius: 9,
    description: "从理解价值，到理解技术变化。",
  },
  {
    id: "lab",
    name: "AI 实验室",
    english: "THE LAB",
    number: "02",
    color: "#e78a4b",
    position: [11, -13],
    spawn: [10, -8],
    radius: 9,
    description: "把研究方法，变成可以运行的系统。",
  },
  {
    id: "campus",
    name: "复旦校园",
    english: "THE ROOTS",
    number: "03",
    color: "#cb6e86",
    position: [-11, 12],
    spawn: [-7, 15],
    radius: 8.5,
    description: "经济与金融，是我看世界的起点。",
  },
  {
    id: "park",
    name: "网球公园",
    english: "OFF DUTY",
    number: "04",
    color: "#3b9375",
    position: [14, 10],
    spawn: [11, 14],
    radius: 9,
    description: "球场上的反馈，生活里的长期主义。",
  },
  {
    id: "contact",
    name: "来信码头",
    english: "SAY HELLO",
    number: "05",
    color: "#bb9847",
    position: [-4, -20],
    spawn: [-4, -16],
    radius: 7,
    description: "下一段故事，也许从一次交流开始。",
  },
];

export const stationById = (id: StationId) =>
  stations.find((station) => station.id === id)!;
