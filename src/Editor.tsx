import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Check,
  ChevronRight,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  FileJson,
  FolderOpen,
  Palette,
  Plus,
  Redo2,
  RotateCcw,
  Save,
  Search,
  Send,
  Trash2,
  Undo2,
  Upload,
  UserRound,
} from "lucide-react";
import {
  DRAFT_KEY,
  PUBLIC_KEY,
  downloadJSON,
  publicSite,
  readSite,
  saveSite,
  siteSchema,
  stations,
  type Entry,
  type Site,
} from "./data";
import { Modal, stationIcons } from "./components";

type Tab = "profile" | "content" | "appearance";
function Field({
  label,
  children,
  wide = false,
}: {
  label: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <label className={`editor-field ${wide ? "wide" : ""}`}>
      <span>{label}</span>
      {children}
    </label>
  );
}
function Lines({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string[];
  onChange: (value: string[]) => void;
}) {
  return (
    <Field label={label} wide>
      <textarea
        rows={Math.max(3, value.length + 1)}
        value={value.join("\n")}
        onChange={(event) => onChange(event.target.value.split("\n"))}
      />
    </Field>
  );
}

export default function Editor() {
  const [draft, setDraft] = useState<Site>(() => readSite(DRAFT_KEY));
  const [tab, setTab] = useState<Tab>("profile");
  const [selected, setSelected] = useState(draft.entries[0]?.id ?? "");
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState("草稿已载入");
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState<"delete" | "restore" | null>(null);
  const [past, setPast] = useState<Site[]>([]);
  const [future, setFuture] = useState<Site[]>([]);
  const input = useRef<HTMLInputElement>(null);
  const closeConfirm = useCallback(() => setConfirm(null), []);
  const entry = draft.entries.find((item) => item.id === selected);
  const publicCount = draft.entries.filter((item) => item.visible).length;
  const activeStation = entry
    ? stations.find((s) => s.id === entry.station)!
    : null;

  const update = (change: (next: Site) => void) => {
    const next = structuredClone(draft);
    change(next);
    setPast((previous) => [...previous.slice(-49), draft]);
    setFuture([]);
    setDraft(next);
    setDirty(true);
    setStatus("有未保存修改");
    setError("");
  };
  const updateEntry = (change: Partial<Entry>) =>
    update((next) => {
      const index = next.entries.findIndex((item) => item.id === selected);
      if (index >= 0)
        next.entries[index] = { ...next.entries[index], ...change };
    });
  const validate = (): Site | null => {
    const result = siteSchema.safeParse(draft);
    if (!result.success) {
      setError(
        result.error.issues
          .slice(0, 5)
          .map((issue) => `${issue.path.join(" · ")}：${issue.message}`)
          .join("；"),
      );
      return null;
    }
    return result.data;
  };
  const save = (publish = false) => {
    const data = validate();
    if (!data) return;
    try {
      saveSite(DRAFT_KEY, data);
      if (publish) saveSite(PUBLIC_KEY, publicSite(data));
      setDirty(false);
      setDraft(data);
      setError("");
      setStatus(
        publish ? "已发布到本浏览器展示端" : "草稿已保存，展示端未变更",
      );
    } catch {
      setError(
        "本地存储不可用或空间不足。请导出草稿备份，本次操作未确认完成。",
      );
    }
  };
  const preview = () => {
    const data = validate();
    if (!data) return;
    try {
      saveSite(DRAFT_KEY, data);
      setDirty(false);
      setStatus("草稿已保存");
      window.open("/?preview=1", "_blank", "noopener,noreferrer");
    } catch {
      setError("草稿未能保存，无法预览。请先导出备份。");
    }
  };
  const exportData = (publish: boolean) => {
    const data = validate();
    if (!data) return;
    downloadJSON(
      publish ? publicSite(data) : data,
      publish ? "site.json" : "xuanyu-island-draft.json",
    );
    setStatus(publish ? "已导出 site.json 发布文件" : "已导出草稿备份");
  };
  const importData = async (file: File | undefined) => {
    if (!file) return;
    try {
      if (file.size > 1024 * 1024) throw new Error("文件不得超过 1 MB");
      const result = siteSchema.safeParse(JSON.parse(await file.text()));
      if (!result.success) throw new Error("文件内容不符合小岛数据格式");
      setPast((previous) => [...previous.slice(-49), draft]);
      setFuture([]);
      setDraft(result.data);
      setSelected(result.data.entries[0]?.id ?? "");
      setDirty(true);
      setError("");
      setStatus("已导入草稿，尚未发布");
    } catch (error) {
      setError(error instanceof Error ? error.message : "文件导入失败");
    }
    if (input.current) input.current.value = "";
  };
  const add = () => {
    const id = `entry-${crypto.randomUUID()}`;
    update((next) =>
      next.entries.push({
        id,
        station: filter === "all" ? "lab" : (filter as Entry["station"]),
        title: "新内容",
        subtitle: "",
        period: "",
        summary: "",
        bullets: [""],
        tags: [],
        metrics: [],
        boundary: "",
        visible: false,
      }),
    );
    setSelected(id);
    setQuery("");
  };
  const move = (delta: number) => {
    update((next) => {
      const index = next.entries.findIndex((e) => e.id === selected);
      const destination = index + delta;
      if (destination < 0 || destination >= next.entries.length) return;
      [next.entries[index], next.entries[destination]] = [
        next.entries[destination],
        next.entries[index],
      ];
    });
  };
  const undo = () => {
    if (!past.length) return;
    setFuture((previous) => [draft, ...previous].slice(0, 50));
    setDraft(past[past.length - 1]);
    setPast(past.slice(0, -1));
    setDirty(true);
    setStatus("已撤销，尚未保存");
  };
  const redo = () => {
    if (!future.length) return;
    setPast((previous) => [...previous, draft].slice(-50));
    setDraft(future[0]);
    setFuture(future.slice(1));
    setDirty(true);
    setStatus("已重做，尚未保存");
  };
  useEffect(() => {
    const prevent = (event: BeforeUnloadEvent) => {
      if (dirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [dirty]);
  const visibleEntries = draft.entries.filter(
    (e) =>
      (filter === "all" || e.station === filter) &&
      `${e.title} ${e.subtitle} ${e.tags.join(" ")}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );

  return (
    <main className="editor-app">
      <aside className="editor-sidebar">
        <a className="editor-brand" href="/" target="_blank" rel="noreferrer">
          <span className="monogram">xw.</span>
          <span>
            Island Studio<small>CONTENT WORKSPACE</small>
          </span>
        </a>
        <div className="workspace-badge">
          <span />
          本地工作区
        </div>
        <nav aria-label="编辑导航">
          <button
            className={tab === "profile" ? "active" : ""}
            onClick={() => setTab("profile")}
          >
            <UserRound size={17} />
            个人信息
          </button>
          <button
            className={tab === "content" ? "active" : ""}
            onClick={() => setTab("content")}
          >
            <FolderOpen size={17} />
            经历与项目<span>{draft.entries.length}</span>
          </button>
          <button
            className={tab === "appearance" ? "active" : ""}
            onClick={() => setTab("appearance")}
          >
            <Palette size={17} />
            小岛外观
          </button>
        </nav>
        <div className="editor-sidebar-bottom">
          <button onClick={() => input.current?.click()}>
            <Upload size={16} />
            导入 JSON
          </button>
          <button onClick={() => exportData(false)}>
            <Download size={16} />
            导出草稿
          </button>
          <button onClick={() => exportData(true)}>
            <FileJson size={16} />
            导出发布文件
          </button>
          <button onClick={() => setConfirm("restore")}>
            <RotateCcw size={16} />
            恢复已发布内容
          </button>
          <a href="/" target="_blank" rel="noreferrer">
            <ArrowLeft size={15} />
            展示端
            <ExternalLink size={13} />
          </a>
        </div>
        <input
          type="file"
          accept="application/json,.json"
          ref={input}
          hidden
          aria-label="导入内容文件"
          onChange={(event) => void importData(event.target.files?.[0])}
        />
      </aside>
      <section className="editor-workspace">
        <header className="editor-toolbar">
          <div className="editor-breadcrumb">
            工作区
            <ChevronRight size={13} />
            <strong>
              {tab === "profile"
                ? "个人信息"
                : tab === "content"
                  ? "经历与项目"
                  : "小岛外观"}
            </strong>
          </div>
          <div className="editor-actions">
            <button
              className="editor-icon"
              title="撤销"
              aria-label="撤销"
              disabled={!past.length}
              onClick={undo}
            >
              <Undo2 size={17} />
            </button>
            <button
              className="editor-icon"
              title="重做"
              aria-label="重做"
              disabled={!future.length}
              onClick={redo}
            >
              <Redo2 size={17} />
            </button>
            <span className="toolbar-divider" />
            <button className="editor-command" onClick={preview}>
              <Eye size={16} />
              <span>预览草稿</span>
            </button>
            <button className="editor-command" onClick={() => save()}>
              <Save size={16} />
              <span>保存草稿</span>
            </button>
            <button className="primary-button" onClick={() => save(true)}>
              <Send size={15} />
              发布
            </button>
          </div>
        </header>
        <div className="editor-save-state" role="status">
          <span className={dirty ? "unsaved-dot" : "saved-dot"} />
          {status}
          <span>
            {publicCount} 条公开 · {draft.entries.length - publicCount} 条隐藏
          </span>
        </div>
        {error && (
          <div className="editor-error" role="alert">
            {error}
          </div>
        )}
        {tab === "profile" && (
          <div className="editor-form-page">
            <header>
              <span className="eyebrow">PROFILE</span>
              <h1>岛主档案</h1>
            </header>
            <form
              className="editor-fields"
              onSubmit={(event) => {
                event.preventDefault();
                save();
              }}
            >
              <Field label="中文姓名">
                <input
                  value={draft.profile.name}
                  maxLength={180}
                  onChange={(e) =>
                    update((n) => {
                      n.profile.name = e.target.value;
                    })
                  }
                />
              </Field>
              <Field label="英文姓名">
                <input
                  value={draft.profile.englishName}
                  maxLength={180}
                  onChange={(e) =>
                    update((n) => {
                      n.profile.englishName = e.target.value;
                    })
                  }
                />
              </Field>
              <Field label="个人主张" wide>
                <input
                  value={draft.profile.tagline}
                  maxLength={80}
                  onChange={(e) =>
                    update((n) => {
                      n.profile.tagline = e.target.value;
                    })
                  }
                />
              </Field>
              <Field label="个人介绍" wide>
                <textarea
                  rows={5}
                  value={draft.profile.intro}
                  maxLength={2000}
                  onChange={(e) =>
                    update((n) => {
                      n.profile.intro = e.target.value;
                    })
                  }
                />
              </Field>
              <Field label="当前身份">
                <input
                  value={draft.profile.status}
                  onChange={(e) =>
                    update((n) => {
                      n.profile.status = e.target.value;
                    })
                  }
                />
              </Field>
              <Field label="所在地">
                <input
                  value={draft.profile.location}
                  onChange={(e) =>
                    update((n) => {
                      n.profile.location = e.target.value;
                    })
                  }
                />
              </Field>
              <Field label="公开邮箱">
                <input
                  type="email"
                  value={draft.profile.email}
                  onChange={(e) =>
                    update((n) => {
                      n.profile.email = e.target.value;
                    })
                  }
                />
              </Field>
              <Field label="关注方向">
                <input
                  value={draft.profile.interests}
                  onChange={(e) =>
                    update((n) => {
                      n.profile.interests = e.target.value;
                    })
                  }
                />
              </Field>
              <button type="submit" className="visually-hidden" tabIndex={-1}>
                保存
              </button>
            </form>
            <footer className="editor-form-footer">
              <span>显示面与编辑面独立</span>
              <a href="/" target="_blank" rel="noreferrer">
                查看已发布页面
                <ArrowUp size={14} />
              </a>
            </footer>
          </div>
        )}
        {tab === "appearance" && (
          <div className="editor-form-page">
            <header>
              <span className="eyebrow">APPEARANCE</span>
              <h1>小岛外观</h1>
            </header>
            <div className="appearance-row">
              <div>
                <strong>小车颜色</strong>
                <span>{draft.appearance.carColor.toUpperCase()}</span>
              </div>
              <div className="color-swatches">
                {["#f16656", "#6aada1", "#edc96c", "#7aabd0", "#dfa5b7"].map(
                  (color) => (
                    <button
                      key={color}
                      style={{ backgroundColor: color }}
                      aria-label={`小车颜色 ${color}`}
                      aria-pressed={draft.appearance.carColor === color}
                      title={color}
                      onClick={() =>
                        update((n) => {
                          n.appearance.carColor = color;
                        })
                      }
                    >
                      {draft.appearance.carColor === color && (
                        <Check size={18} />
                      )}
                    </button>
                  ),
                )}
                <input
                  type="color"
                  aria-label="自定义车色"
                  value={draft.appearance.carColor}
                  onChange={(e) =>
                    update((n) => {
                      n.appearance.carColor = e.target.value;
                    })
                  }
                />
              </div>
            </div>
            <label className="appearance-row">
              <div>
                <strong>实时阴影</strong>
                <span>光照与物体投影</span>
              </div>
              <input
                type="checkbox"
                role="switch"
                checked={draft.appearance.shadows}
                onChange={(e) =>
                  update((n) => {
                    n.appearance.shadows = e.target.checked;
                  })
                }
              />
            </label>
            <label className="appearance-row">
              <div>
                <strong>环境动态</strong>
                <span>树木、旗帜与风车</span>
              </div>
              <input
                type="checkbox"
                role="switch"
                checked={draft.appearance.motion}
                onChange={(e) =>
                  update((n) => {
                    n.appearance.motion = e.target.checked;
                  })
                }
              />
            </label>
          </div>
        )}
        {tab === "content" && (
          <div className="editor-content-layout">
            <aside className="content-list">
              <div className="content-list-heading">
                <strong>内容集合</strong>
                <button
                  className="editor-icon"
                  title="添加内容"
                  aria-label="添加内容"
                  onClick={add}
                >
                  <Plus size={19} />
                </button>
              </div>
              <label className="editor-search">
                <Search size={15} />
                <input
                  aria-label="搜索内容"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="搜索内容"
                />
              </label>
              <select
                aria-label="筛选站点"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              >
                <option value="all">所有站点</option>
                {stations
                  .filter((s) => !["welcome", "contact"].includes(s.id))
                  .map((s) => (
                    <option value={s.id} key={s.id}>
                      {s.name}
                    </option>
                  ))}
              </select>
              <div className="content-list-items">
                {visibleEntries.map((item) => {
                  const Icon = stationIcons[item.station];
                  return (
                    <button
                      key={item.id}
                      className={item.id === selected ? "selected" : ""}
                      onClick={() => setSelected(item.id)}
                    >
                      <Icon size={16} />
                      <span>
                        <strong>{item.title}</strong>
                        <small>{item.period || "日期待填写"}</small>
                      </span>
                      {!item.visible && <EyeOff size={13} />}
                    </button>
                  );
                })}
                {!visibleEntries.length && (
                  <p className="editor-empty">没有匹配内容</p>
                )}
              </div>
            </aside>
            <div className="entry-editor">
              {entry ? (
                <>
                  <header className="entry-editor-header">
                    <div>
                      <span className="eyebrow">{activeStation?.english}</span>
                      <h1>{entry.title}</h1>
                    </div>
                    <div>
                      <button
                        className="editor-icon"
                        title="上移"
                        aria-label="上移"
                        disabled={draft.entries[0]?.id === selected}
                        onClick={() => move(-1)}
                      >
                        <ArrowUp size={16} />
                      </button>
                      <button
                        className="editor-icon"
                        title="下移"
                        aria-label="下移"
                        disabled={draft.entries.at(-1)?.id === selected}
                        onClick={() => move(1)}
                      >
                        <ArrowDown size={16} />
                      </button>
                      <button
                        className="editor-icon danger"
                        title="删除内容"
                        aria-label="删除内容"
                        onClick={() => setConfirm("delete")}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </header>
                  <div className="visibility-row">
                    <label>
                      <input
                        type="checkbox"
                        checked={entry.visible}
                        onChange={(e) =>
                          updateEntry({ visible: e.target.checked })
                        }
                      />
                      公开显示
                    </label>
                    <span>
                      {entry.visible ? "发布后进入展示端" : "仅保留在草稿中"}
                    </span>
                  </div>
                  <div className="editor-fields">
                    <Field label="标题" wide>
                      <input
                        value={entry.title}
                        onChange={(e) => updateEntry({ title: e.target.value })}
                      />
                    </Field>
                    <Field label="副标题 / 角色" wide>
                      <input
                        value={entry.subtitle}
                        onChange={(e) =>
                          updateEntry({ subtitle: e.target.value })
                        }
                      />
                    </Field>
                    <Field label="归属站点">
                      <select
                        value={entry.station}
                        onChange={(e) =>
                          updateEntry({
                            station: e.target.value as Entry["station"],
                          })
                        }
                      >
                        {stations
                          .filter((s) => !["welcome", "contact"].includes(s.id))
                          .map((s) => (
                            <option value={s.id} key={s.id}>
                              {s.name}
                            </option>
                          ))}
                      </select>
                    </Field>
                    <Field label="时间">
                      <input
                        value={entry.period}
                        onChange={(e) =>
                          updateEntry({ period: e.target.value })
                        }
                      />
                    </Field>
                    <Field label="内容摘要" wide>
                      <textarea
                        rows={4}
                        value={entry.summary}
                        onChange={(e) =>
                          updateEntry({ summary: e.target.value })
                        }
                      />
                    </Field>
                    <Lines
                      label="经历要点（每行一项）"
                      value={entry.bullets}
                      onChange={(bullets) => updateEntry({ bullets })}
                    />
                    <Field label="标签（逗号分隔）" wide>
                      <input
                        value={entry.tags.join(", ")}
                        onChange={(e) =>
                          updateEntry({
                            tags: e.target.value
                              .split(/[,，]/)
                              .map((t) => t.trim()),
                          })
                        }
                      />
                    </Field>
                    <div className="metric-editor wide">
                      <header>
                        <strong>量化成果</strong>
                        <button
                          className="editor-icon"
                          aria-label="添加指标"
                          title="添加指标"
                          disabled={entry.metrics.length >= 4}
                          onClick={() =>
                            updateEntry({
                              metrics: [
                                ...entry.metrics,
                                { value: "", label: "" },
                              ],
                            })
                          }
                        >
                          <Plus size={17} />
                        </button>
                      </header>
                      {entry.metrics.map((metric, i) => (
                        <div key={i}>
                          <input
                            aria-label={`指标 ${i + 1} 数值`}
                            value={metric.value}
                            onChange={(e) =>
                              updateEntry({
                                metrics: entry.metrics.map((m, j) =>
                                  i === j ? { ...m, value: e.target.value } : m,
                                ),
                              })
                            }
                          />
                          <input
                            aria-label={`指标 ${i + 1} 名称`}
                            value={metric.label}
                            onChange={(e) =>
                              updateEntry({
                                metrics: entry.metrics.map((m, j) =>
                                  i === j ? { ...m, label: e.target.value } : m,
                                ),
                              })
                            }
                          />
                          <button
                            className="editor-icon"
                            title="删除指标"
                            aria-label={`删除指标 ${i + 1}`}
                            onClick={() =>
                              updateEntry({
                                metrics: entry.metrics.filter(
                                  (_, j) => i !== j,
                                ),
                              })
                            }
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      ))}
                    </div>
                    <Field label="成果边界 / 公开说明" wide>
                      <textarea
                        rows={3}
                        value={entry.boundary}
                        onChange={(e) =>
                          updateEntry({ boundary: e.target.value })
                        }
                      />
                    </Field>
                  </div>
                </>
              ) : (
                <div className="editor-empty">
                  <FolderOpen size={28} />
                  <p>选择或添加一条内容</p>
                  <button className="primary-button" onClick={add}>
                    <Plus size={16} />
                    添加内容
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </section>
      {confirm && (
        <Modal
          title={confirm === "delete" ? "删除内容" : "恢复已发布内容"}
          onClose={closeConfirm}
          className="confirm-modal"
        >
          <h2>
            {confirm === "delete"
              ? `删除“${entry?.title}”？`
              : "用已发布版本替换草稿？"}
          </h2>
          <p>
            {confirm === "delete"
              ? "此操作只改变草稿，保存发布后才影响展示端。"
              : "当前草稿将被替换，可以通过撤销恢复。"}
          </p>
          <div>
            <button className="editor-command" onClick={closeConfirm}>
              取消
            </button>
            <button
              className="primary-button"
              onClick={() => {
                if (confirm === "delete") {
                  update((n) => {
                    n.entries = n.entries.filter((e) => e.id !== selected);
                  });
                  setSelected("");
                } else {
                  setPast((p) => [...p.slice(-49), draft]);
                  setFuture([]);
                  setDraft(readSite(PUBLIC_KEY));
                  setDirty(true);
                  setStatus("已恢复发布版本，尚未保存");
                }
                closeConfirm();
              }}
            >
              确认{confirm === "delete" ? "删除" : "恢复"}
            </button>
          </div>
        </Modal>
      )}
    </main>
  );
}
