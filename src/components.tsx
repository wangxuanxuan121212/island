import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  BookOpen,
  BriefcaseBusiness,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  FlaskConical,
  GraduationCap,
  Mail,
  MapPin,
  MoveUpRight,
  Palmtree,
  Printer,
  Route,
  Navigation,
  X,
} from "lucide-react";
import {
  stations,
  stationById,
  type Entry,
  type Site,
  type StationId,
} from "./data";
import { roads, mapPoint, mapHeading } from "./world/roads";
import type { RoutePoint } from "./world/routePlanner";

export const stationIcons = {
  welcome: Palmtree,
  career: BriefcaseBusiness,
  lab: FlaskConical,
  campus: GraduationCap,
  park: Route,
  contact: Mail,
};

export function Modal({
  title,
  children,
  onClose,
  className = "",
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>("button, a[href], input")?.focus();
    const handle = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab") return;
      const elements = Array.from(
        ref.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), a[href], input, select, textarea, [tabindex="0"]',
        ) ?? [],
      );
      const first = elements[0],
        last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", handle);
    return () => {
      document.removeEventListener("keydown", handle);
      previous?.focus();
    };
  }, [onClose]);
  return (
    <div
      className={`modal-scrim ${className}`}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="modal-surface"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        ref={ref}
      >
        <button
          className="icon-button close-modal"
          onClick={onClose}
          title="关闭"
          aria-label="关闭"
        >
          <X size={20} />
        </button>
        {children}
      </section>
    </div>
  );
}

export function EntryDetail({ entry }: { entry: Entry }) {
  return (
    <div className="entry-detail">
      <p>{entry.summary}</p>
      {entry.metrics.length > 0 && (
        <div className="metrics">
          {entry.metrics.map((metric, i) => (
            <div key={i}>
              <strong>{metric.value}</strong>
              <span>{metric.label}</span>
            </div>
          ))}
        </div>
      )}
      <ul>
        {entry.bullets.map((bullet, i) => (
          <li key={i}>{bullet}</li>
        ))}
      </ul>
      {entry.boundary && (
        <aside className="entry-boundary">
          <span>成果边界</span>
          {entry.boundary}
        </aside>
      )}
      <div className="tags">
        {entry.tags.map((tag) => (
          <span key={tag}>{tag}</span>
        ))}
      </div>
    </div>
  );
}

function EntryRow({ entry, first = false }: { entry: Entry; first?: boolean }) {
  return (
    <details className="entry-row" open={first || undefined}>
      <summary>
        <span className="entry-row-heading">
          <span className="entry-period">{entry.period}</span>
          <strong>{entry.title}</strong>
          <span>{entry.subtitle}</span>
        </span>
        <ChevronDown size={19} className="details-chevron" />
      </summary>
      <EntryDetail entry={entry} />
    </details>
  );
}

function Contact({ site }: { site: Site }) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(site.profile.email);
      setCopied(true);
      setError(false);
    } catch {
      setError(true);
    }
  };
  return (
    <div className="contact-content">
      <span className="postmark">
        SHANGHAI
        <br />
        31°13′ N · 121°28′ E
      </span>
      <h3>
        下一段故事，
        <br />
        从一声 Hello 开始。
      </h3>
      <p>关于 AI、研究、产品，或者约一场网球。</p>
      <a className="email-link" href={`mailto:${site.profile.email}`}>
        {site.profile.email}
        <ArrowUpRight size={21} />
      </a>
      <div className="contact-actions">
        <a className="primary-button" href={`mailto:${site.profile.email}`}>
          <Mail size={17} />
          写一封邮件
        </a>
        <button className="text-button" onClick={copy}>
          {copied ? <Check size={17} /> : <Copy size={17} />}
          {copied ? "已复制" : "复制邮箱"}
        </button>
      </div>
      {error && <p role="status">无法访问剪贴板，请使用上方邮箱链接。</p>}
      <div className="contact-signature">
        {site.profile.englishName}
        <span>{site.profile.location}</span>
      </div>
    </div>
  );
}

export function StationContent({ id, site }: { id: StationId; site: Site }) {
  const station = stationById(id);
  const Icon = stationIcons[id];
  const entries = site.entries.filter(
    (entry) => entry.visible && entry.station === id,
  );
  return (
    <>
      <header
        className="section-heading"
        style={{ "--station-color": station.color } as React.CSSProperties}
      >
        <span className="eyebrow">
          <Icon size={16} />
          {station.number} / {station.english}
        </span>
        <h2>{station.name}</h2>
        <p>{station.description}</p>
      </header>
      {id === "contact" ? (
        <Contact site={site} />
      ) : id === "welcome" ? (
        <div className="about-content">
          <span className="about-name">
            {site.profile.name}
            <small>{site.profile.englishName}</small>
          </span>
          <p>{site.profile.intro}</p>
          <div className="about-facts">
            <span>
              <GraduationCap size={19} />
              {site.profile.status}
            </span>
            <span>
              <MapPin size={19} />
              {site.profile.location}
            </span>
          </div>
          <div className="about-principles">
            <span>
              01<em>理解价值</em>
            </span>
            <span>
              02<em>理解技术变化</em>
            </span>
            <span>
              03<em>把方法变成系统</em>
            </span>
          </div>
          <a href={`mailto:${site.profile.email}`} className="text-button">
            打个招呼
            <ArrowUpRight size={18} />
          </a>
        </div>
      ) : entries.length ? (
        <div className="entries">
          {entries.map((entry, i) => (
            <EntryRow entry={entry} first={i === 0} key={entry.id} />
          ))}
        </div>
      ) : (
        <p className="empty-state">这里暂时没有公开内容。</p>
      )}
    </>
  );
}

export function IslandMap({
  onSelect,
  onNavigate,
  current,
  position,
  heading = 0,
  path = [],
}: {
  onSelect: (id: StationId) => void;
  onNavigate?: (id: StationId) => void;
  current: StationId;
  position?: RoutePoint;
  heading?: number;
  path?: RoutePoint[];
}) {
  const [mode, setMode] = useState<"navigate" | "teleport">("navigate");
  const navigate = mode === "navigate" && onNavigate;
  const select = (id: StationId) => (navigate ? onNavigate!(id) : onSelect(id));
  const point = position ? mapPoint(position.x, position.z) : null;
  return (
    <>
      <header className="section-heading">
        <span className="eyebrow">THE LITTLE WORLD</span>
        <h2>下一站，去哪里？</h2>
      </header>
      {onNavigate && (
        <div className="map-modes" role="group" aria-label="出行方式">
          <button
            aria-pressed={mode === "navigate"}
            onClick={() => setMode("navigate")}
          >
            <Navigation size={15} />
            驾车导航
          </button>
          <button
            aria-pressed={mode === "teleport"}
            onClick={() => setMode("teleport")}
          >
            <MoveUpRight size={15} />
            直接前往
          </button>
        </div>
      )}
      <div className="island-map">
        <MapRoutes path={path} />
        {stations.map((station) => {
          const Icon = stationIcons[station.id];
          return (
            <button
              key={station.id}
              aria-label={`${navigate ? "导航至" : "前往"}${station.name}`}
              className={`map-stop ${current === station.id ? "current" : ""}`}
              style={
                {
                  left: `${mapPoint(...station.position).x}%`,
                  top: `${mapPoint(...station.position).y}%`,
                  "--station-color": station.color,
                } as React.CSSProperties
              }
              onClick={() => select(station.id)}
            >
              <span className="map-land">
                <Icon size={23} />
              </span>
              <strong>{station.name}</strong>
              <small>{station.number}</small>
            </button>
          );
        })}
        <span className="map-compass">
          N
          <ArrowUpRight
            size={26}
            style={{ transform: `rotate(${mapHeading(Math.PI) - 45}deg)` }}
          />
        </span>
        {point && (
          <span
            className="map-player"
            aria-label="小车朝向"
            style={{ left: `${point.x}%`, top: `${point.y}%` }}
          >
            <Navigation
              size={17}
              fill="currentColor"
              style={{ transform: `rotate(${mapHeading(heading) - 45}deg)` }}
            />
          </span>
        )}
      </div>
      <div className="map-index">
        {stations.map((station) => (
          <button key={station.id} onClick={() => select(station.id)}>
            <span style={{ color: station.color }}>{station.number}</span>
            {station.name}
            <ChevronRight size={14} />
          </button>
        ))}
      </div>
    </>
  );
}

export function MapRoutes({ path = [] }: { path?: RoutePoint[] }) {
  const point = (x: number, z: number) => {
    const p = mapPoint(x, z);
    return `${p.x},${p.y}`;
  };
  return (
    <svg
      className="map-routes"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {roads.map((road) => (
        <polyline
          key={`${road.from}-${road.to}`}
          points={road.points.map((p) => point(p.x, p.z)).join(" ")}
          className="map-road"
        />
      ))}
      {path.length > 1 && (
        <polyline
          points={path.map((p) => point(p.x, p.z)).join(" ")}
          className="map-route-active"
        />
      )}
    </svg>
  );
}

export function Reader({
  site,
  onWorld,
  failed = false,
}: {
  site: Site;
  onWorld: () => void;
  failed?: boolean;
}) {
  return (
    <main className="reader">
      <header className="reader-header">
        <a href="/" className="wordmark">
          <span className="monogram">xw.</span>
          <strong>Xuanyu's Island</strong>
        </a>
        <div>
          <button className="text-button" onClick={() => window.print()}>
            <Printer size={17} />
            <span>打印简历</span>
          </button>
          <button className="primary-button" onClick={onWorld}>
            <Palmtree size={17} />
            回到小岛
          </button>
        </div>
      </header>
      {failed && (
        <p role="status" className="render-notice">
          当前设备未能开启 3D，已为你打开完整阅读版。
        </p>
      )}
      <div className="reader-intro">
        <span className="eyebrow">A LITTLE ABOUT ME</span>
        <h1>
          {site.profile.name}
          <small>{site.profile.englishName}</small>
        </h1>
        <p>{site.profile.intro}</p>
        <a href={`mailto:${site.profile.email}`} className="text-button">
          {site.profile.email}
          <ArrowUpRight size={17} />
        </a>
      </div>
      <nav className="reader-nav">
        {stations
          .filter((s) => s.id !== "welcome")
          .map((s) => (
            <a key={s.id} href={`#${s.id}`}>
              {s.name}
              <ArrowDownRight size={14} />
            </a>
          ))}
      </nav>
      <div className="reader-sections">
        {stations
          .filter((s) => s.id !== "welcome")
          .map((station) => (
            <section id={station.id} key={station.id}>
              <StationContent id={station.id} site={site} />
            </section>
          ))}
      </div>
      <footer className="reader-footer">
        <span>
          {site.profile.name} · {site.profile.location}
        </span>
        <BookOpen size={18} />
        <span>Stay curious. Keep building.</span>
      </footer>
    </main>
  );
}
