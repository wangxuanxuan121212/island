import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpRight,
  BookOpen,
  Check,
  Compass,
  Flag,
  Map,
  MapPin,
  Minus,
  Navigation,
  Plus,
  RotateCcw,
  Square,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import {
  DRAFT_KEY,
  PUBLIC_KEY,
  publicSite,
  readSite,
  stationById,
  stations,
  type StationId,
} from "./data";
import {
  IslandMap,
  MapRoutes,
  Modal,
  Reader,
  StationContent,
  stationIcons,
} from "./components";
import type { DriveKey, IslandEngine, WorldState } from "./world/IslandEngine";
import { mapHeading, mapPoint } from "./world/roads";

const initialWorld: WorldState = {
  x: 1,
  z: 2,
  speed: 0,
  heading: 0.35,
  gear: "P",
  steering: 0,
  inputs: [],
  overview: false,
  navigation: null,
  station: "welcome",
  started: false,
  markers: [],
};

export default function App() {
  const preview = new URLSearchParams(location.search).get("preview") === "1";
  const [site, setSite] = useState(() =>
    publicSite(readSite(preview ? DRAFT_KEY : PUBLIC_KEY)),
  );
  const [reader, setReader] = useState(
    new URLSearchParams(location.search).get("view") === "reading",
  );
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const [world, setWorld] = useState<WorldState>(initialWorld);
  const [panel, setPanel] = useState<StationId | "map" | null>(null);
  const [sound, setSound] = useState(false);
  const [visited, setVisited] = useState<StationId[]>(["welcome"]);
  const [message, setMessage] = useState("");
  const host = useRef<HTMLDivElement>(null);
  const engine = useRef<IslandEngine | null>(null);
  const close = useCallback(() => setPanel(null), []);

  // #region debug-point A-B:map-event-order
  useEffect(() => {
    if (
      location.hostname !== "127.0.0.1" ||
      !new URLSearchParams(location.search).has("debug")
    )
      return;
    const log = (e: Event) => {
      const target = (e.target as HTMLElement)?.closest("button");
      if (target)
        void fetch("http://127.0.0.1:7777/event", {
          method: "POST",
          body: JSON.stringify({
            sessionId: "map-navigation-state",
            runId: new URLSearchParams(location.search).get("run") ?? "pre-fix",
            hypothesisId: "A-B",
            msg: "[DEBUG] native event",
            location: "App:events",
            data: {
              type: e.type,
              target: target.getAttribute("aria-label") ?? target.className,
              detail: (e as MouseEvent).detail,
              pointerType: (e as PointerEvent).pointerType,
            },
            ts: Date.now(),
          }),
        }).catch(() => {});
    };
    ["pointerup", "click", "focusin"].forEach((type) =>
      document.addEventListener(type, log, true),
    );
    return () =>
      ["pointerup", "click", "focusin"].forEach((type) =>
        document.removeEventListener(type, log, true),
      );
  }, []);
  // #endregion
  // #region debug-point C:panel-state
  useEffect(() => {
    if (
      location.hostname === "127.0.0.1" &&
      new URLSearchParams(location.search).has("debug")
    )
      void fetch("http://127.0.0.1:7777/event", {
        method: "POST",
        body: JSON.stringify({
          sessionId: "map-navigation-state",
          runId: new URLSearchParams(location.search).get("run") ?? "pre-fix",
          hypothesisId: "C",
          msg: "[DEBUG] panel",
          location: "App:panel",
          data: { panel },
          ts: Date.now(),
        }),
      }).catch(() => {});
  }, [panel]);
  // #endregion

  useEffect(() => {
    const update = () =>
      setSite(publicSite(readSite(preview ? DRAFT_KEY : PUBLIC_KEY)));
    const storage = (event: StorageEvent) => {
      if (!event.key || event.key === (preview ? DRAFT_KEY : PUBLIC_KEY))
        update();
    };
    window.addEventListener("storage", storage);
    window.addEventListener("island-content-updated", update);
    return () => {
      window.removeEventListener("storage", storage);
      window.removeEventListener("island-content-updated", update);
    };
  }, [preview]);

  useEffect(() => {
    if (reader || !host.current) return;
    let cancelled = false;
    setReady(false);
    setWorld(initialWorld);
    setSound(false);
    import("./world/IslandEngine")
      .then(({ IslandEngine }) => {
        if (cancelled || !host.current) return;
        engine.current = new IslandEngine(host.current, site, {
          ready: () => {
            if (!cancelled) {
              setReady(true);
            }
          },
          update: (state) => {
            if (!cancelled) setWorld(state);
          },
          error: () => {
            if (!cancelled) {
              setFailed(true);
              setReader(true);
            }
          },
        });
      })
      .catch(() => {
        if (!cancelled) {
          setFailed(true);
          setReader(true);
        }
      });
    return () => {
      cancelled = true;
      engine.current?.dispose();
      engine.current = null;
    };
  }, [reader, site]);

  useEffect(() => {
    engine.current?.setPaused(panel !== null);
  }, [panel, ready]);
  useEffect(() => {
    setVisited((current) =>
      current.includes(world.station) ? current : [...current, world.station],
    );
  }, [world.station]);
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(""), 3500);
    return () => clearTimeout(timer);
  }, [message]);
  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if (
        (event.target as HTMLElement)?.closest(
          'input, textarea, select, [contenteditable="true"], [role="dialog"]',
        )
      )
        return;
      if (event.repeat || reader) return;
      if (event.code === "KeyE" && world.started) setPanel(world.station);
      if (event.code === "KeyM") setPanel((p) => (p === "map" ? null : "map"));
    };
    window.addEventListener("keydown", keyboard);
    return () => window.removeEventListener("keydown", keyboard);
  }, [world.station, world.started, reader]);

  const visit = (id: StationId) => {
    engine.current?.teleport(id);
    setVisited((current) =>
      current.includes(id) ? current : [...current, id],
    );
    setPanel(null);
  };
  const navigate = (id: StationId) => {
    // #region debug-point C:navigate
    if (
      location.hostname === "127.0.0.1" &&
      new URLSearchParams(location.search).has("debug")
    )
      void fetch("http://127.0.0.1:7777/event", {
        method: "POST",
        body: JSON.stringify({
          sessionId: "map-navigation-state",
          runId: new URLSearchParams(location.search).get("run") ?? "pre-fix",
          hypothesisId: "C",
          msg: "[DEBUG] navigate",
          location: "App:navigate",
          data: { id, panel },
          ts: Date.now(),
        }),
      }).catch(() => {});
    // #endregion
    engine.current?.setDestination(id);
    setPanel(null);
  };
  const toggleSound = async () => {
    try {
      await engine.current?.setSound(!sound);
      setSound(!sound);
    } catch {
      setMessage("当前浏览器无法开启声音");
      setSound(false);
    }
  };
  const goReader = () => {
    setPanel(null);
    setReader(true);
    const url = new URL(location.href);
    url.searchParams.set("view", "reading");
    history.replaceState(null, "", url);
  };
  const goWorld = () => {
    setFailed(false);
    setReader(false);
    const url = new URL(location.href);
    url.searchParams.delete("view");
    history.replaceState(null, "", url);
  };
  const directionButton = (
    direction: DriveKey,
    label: string,
    children: React.ReactNode,
  ) => (
    <button
      className={`drive-button drive-${direction}`}
      aria-label={label}
      aria-pressed={world.inputs.includes(direction)}
      title={label}
      disabled={!ready || world.overview}
      onPointerDown={(event) => {
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        engine.current?.setInput(direction, true, `pointer-${event.pointerId}`);
      }}
      onPointerUp={(event) =>
        engine.current?.setInput(direction, false, `pointer-${event.pointerId}`)
      }
      onPointerCancel={(event) =>
        engine.current?.setInput(direction, false, `pointer-${event.pointerId}`)
      }
      onLostPointerCapture={(event) =>
        engine.current?.setInput(direction, false, `pointer-${event.pointerId}`)
      }
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          engine.current?.setInput(direction, true, "button-keyboard");
        }
      }}
      onKeyUp={() =>
        engine.current?.setInput(direction, false, "button-keyboard")
      }
      onBlur={() =>
        engine.current?.setInput(direction, false, "button-keyboard")
      }
    >
      {children}
    </button>
  );

  if (reader) return <Reader site={site} onWorld={goWorld} failed={failed} />;
  const current = stationById(world.station);
  const CurrentIcon = stationIcons[world.station];
  const overview = world.overview;
  const navigation = world.navigation;
  const playerPoint = mapPoint(world.x, world.z);
  const turnLabel = !navigation?.reachable
    ? "暂未找到可通行路线"
    : navigation.arrived
      ? "已到达"
      : Math.abs(navigation.turn) > 2.5
        ? "掉头"
        : Math.abs(navigation.turn) < 0.3
          ? "向前行驶"
          : navigation.turn > 0
            ? "向左转"
            : "向右转";
  return (
    <main
      className={`island-app ${world.started ? "is-exploring" : "is-welcome"}`}
    >
      <div inert={panel !== null ? true : undefined}>
        <div className="world-canvas" ref={host} />
        <div className="grain-overlay" aria-hidden="true" />
        {preview && <div className="preview-ribbon">草稿预览 · 未发布内容</div>}
        <header className="world-header">
          <button
            className="wordmark"
            onClick={() => {
              if (world.started) visit("welcome");
              else setPanel("welcome");
            }}
            aria-label="返回好奇心广场"
          >
            <span className="monogram">xw.</span>
            <span className="wordmark-text">
              Xuanyu's Island<small>PERSONAL WORLD · VOL. 01</small>
            </span>
          </button>
          <nav className="header-nav" aria-label="内容导航">
            <button onClick={() => setPanel("career")}>我的故事</button>
            <button onClick={() => setPanel("lab")}>
              项目集
              <span className="tiny-dot" />
            </button>
            <button onClick={() => setPanel("contact")}>
              联系我
              <ArrowUpRight size={14} />
            </button>
          </nav>
          <div className="header-tools">
            <button
              className="icon-button"
              onClick={goReader}
              title="阅读版简历"
              aria-label="阅读版简历"
            >
              <BookOpen size={19} />
            </button>
            <button
              className="icon-button"
              onClick={toggleSound}
              title={sound ? "关闭声音" : "开启声音"}
              aria-label={sound ? "关闭声音" : "开启声音"}
              aria-pressed={sound}
            >
              {sound ? <Volume2 size={19} /> : <VolumeX size={19} />}
            </button>
            <button
              className="icon-button map-toggle"
              onClick={() => setPanel("map")}
              title="小岛地图"
              aria-label="小岛地图"
            >
              <Map size={19} />
            </button>
          </div>
        </header>

        {!world.started ? (
          <>
            <section className="welcome-copy">
              <span className="eyebrow">
                <span className="sun-mark" />A CURIOUS MIND, AT PLAY
              </span>
              <h1>
                {site.profile.name}
                <span className="name-period">.</span>
              </h1>
              <span className="english-name">{site.profile.englishName}</span>
              <p className="welcome-tagline">{site.profile.tagline}</p>
              <p className="welcome-status">
                {site.profile.status}
                <br />
                {site.profile.interests}
              </p>
              <button
                className="primary-button start-button"
                disabled={!ready}
                onClick={() => engine.current?.start()}
              >
                {ready ? "出发，去逛逛" : "正在准备小岛"}
                <ArrowUpRight size={20} />
              </button>
              <button className="quiet-link" onClick={goReader}>
                或直接认识我
                <ArrowRight size={14} />
              </button>
            </section>
            <div className="welcome-note" aria-hidden="true">
              <span>hello, world!</span>
              <ArrowDown size={33} strokeWidth={1.3} />
            </div>
            <div className="island-caption">
              <span className="caption-line" />
              <span>
                好奇心广场<small>EVERY JOURNEY STARTS SOMEWHERE.</small>
              </span>
            </div>
          </>
        ) : (
          <>
            <div className="current-location">
              <span
                className="location-icon"
                style={{ backgroundColor: current.color }}
              >
                <CurrentIcon size={21} />
              </span>
              <div>
                <span>
                  {current.number} / {current.english}
                </span>
                <strong>{current.name}</strong>
              </div>
            </div>
            <div
              className="heading-dial"
              title="车头朝向"
              aria-label="车头朝向"
            >
              <span
                className="heading-north"
                style={{ transform: `rotate(${mapHeading(Math.PI)}deg)` }}
              >
                N
              </span>
              <Navigation
                size={22}
                fill="currentColor"
                style={{
                  transform: `rotate(${mapHeading(world.heading) - 45}deg)`,
                }}
              />
            </div>
            <aside
              className={`navigation-hud ${navigation?.arrived ? "has-arrived" : ""}`}
              aria-label="路线引导"
            >
              {navigation ? (
                <>
                  <span className="navigation-direction" aria-hidden="true">
                    {navigation.arrived ? (
                      <Check size={24} />
                    ) : (
                      <ArrowUp
                        size={25}
                        style={{
                          transform: `rotate(${navigation.bearing}deg)`,
                        }}
                      />
                    )}
                  </span>
                  <button
                    className="navigation-target"
                    onClick={() =>
                      navigation.arrived
                        ? setPanel(navigation.destination)
                        : setPanel("map")
                    }
                  >
                    <small>
                      {turnLabel}
                      {navigation.reachable && !navigation.arrived && (
                        <span>{navigation.distance} m</span>
                      )}
                    </small>
                    <strong>{stationById(navigation.destination).name}</strong>
                  </button>
                  <button
                    className="icon-button navigation-cancel"
                    title="取消导航"
                    aria-label="取消导航"
                    onClick={() => engine.current?.setDestination(null)}
                  >
                    <X size={16} />
                  </button>
                </>
              ) : (
                <button
                  className="choose-destination"
                  onClick={() => setPanel("map")}
                >
                  <Navigation size={18} />
                  选择目的地
                  <ArrowUpRight size={15} />
                </button>
              )}
            </aside>
            <div className="world-markers">
              {world.markers
                .filter((marker) => marker.visible)
                .map((marker) => {
                  const station = stationById(marker.id),
                    Icon = stationIcons[marker.id];
                  return (
                    <button
                      key={marker.id}
                      className="world-marker"
                      style={
                        {
                          left: marker.x,
                          top: marker.y,
                          "--station-color": station.color,
                        } as React.CSSProperties
                      }
                      onClick={() => setPanel(marker.id)}
                      aria-label={`查看${station.name}`}
                    >
                      <Icon size={15} />
                      <span>{station.name}</span>
                      <ArrowUpRight size={13} />
                    </button>
                  );
                })}
            </div>
            <button
              className="nearby-button"
              onClick={() => setPanel(world.station)}
            >
              <span className="nearby-icon">
                <CurrentIcon size={21} />
              </span>
              <span>
                <small>YOU ARE HERE</small>
                <strong>
                  {world.station === "welcome"
                    ? "认识一下岛主"
                    : `走进${current.name}`}
                </strong>
              </span>
              <ArrowRight size={21} />
            </button>
            <aside className="mini-map" aria-label="快捷地图">
              <button
                className="mini-map-title"
                onClick={() => setPanel("map")}
              >
                <Compass size={14} />
                <span>ISLAND MAP</span>
                <ArrowUpRight size={13} />
              </button>
              <div className="mini-map-body">
                <MapRoutes path={navigation?.path} />
                {stations.map((station) => (
                  <button
                    key={station.id}
                    title={station.name}
                    aria-label={`导航至${station.name}`}
                    onClick={() => navigate(station.id)}
                    className={`mini-stop ${station.id === world.station ? "active" : ""} ${station.id === navigation?.destination ? "destination" : ""}`}
                    style={{
                      left: `${mapPoint(...station.position).x}%`,
                      top: `${mapPoint(...station.position).y}%`,
                      backgroundColor: station.color,
                    }}
                  >
                    {visited.includes(station.id) ? (
                      <Check size={10} />
                    ) : (
                      station.number
                    )}
                  </button>
                ))}
                <span
                  className="map-player mini-player"
                  style={{
                    left: `${playerPoint.x}%`,
                    top: `${playerPoint.y}%`,
                  }}
                >
                  <Navigation
                    size={13}
                    fill="currentColor"
                    style={{
                      transform: `rotate(${mapHeading(world.heading) - 45}deg)`,
                    }}
                  />
                </span>
              </div>
              <span className="discovery-count">
                {visited.length} / 6 个地方，
                {visited.length === 6 ? "全部相遇" : "慢慢认识"}
              </span>
            </aside>
          </>
        )}

        <footer className="world-footer">
          <span className="location-meta">
            <MapPin size={14} />
            {site.profile.location}
            <span className="meta-divider" />
            STAY CURIOUS.
          </span>
          <div className="footer-center">
            {world.started ? (
              <>
                <Flag size={13} />
                <span>{visited.length.toString().padStart(2, "0")} / 06</span>
              </>
            ) : (
              <span>A SMALL WORLD. A WORK IN PROGRESS.</span>
            )}
          </div>
          <span className="footer-signature">
            Built with curiosity
            <ArrowUpRight size={12} />
          </span>
        </footer>
        {world.started && (
          <div className="drive-controls" aria-label="驾驶控制">
            <div className="utility-controls">
              <button
                className="icon-button"
                onClick={() => engine.current?.reset()}
                title="重新回到路面 (R)"
                aria-label="重新回到路面"
              >
                <RotateCcw size={17} />
              </button>
              <button
                className="icon-button"
                onClick={() => engine.current?.zoom(-0.1)}
                title="放大视野"
                aria-label="放大视野"
              >
                <Plus size={17} />
              </button>
              <button
                className="icon-button"
                onClick={() => engine.current?.zoom(0.1)}
                title="缩小视野"
                aria-label="缩小视野"
              >
                <Minus size={17} />
              </button>
              <button
                className="icon-button"
                onClick={() => {
                  engine.current?.setOverview(!overview);
                }}
                title={overview ? "返回驾驶视角" : "全岛鸟瞰"}
                aria-label={overview ? "返回驾驶视角" : "全岛鸟瞰"}
                aria-pressed={overview}
              >
                <Compass size={17} />
              </button>
            </div>
            <div className="direction-pad">
              {directionButton(
                "forward",
                "前进 (W / ↑)",
                <ArrowUp size={20} />,
              )}
              {directionButton("left", "左转 (A / ←)", <ArrowLeft size={20} />)}
              {directionButton(
                "brake",
                "刹车 (空格)",
                <Square size={12} fill="currentColor" />,
              )}
              {directionButton(
                "right",
                "右转 (D / →)",
                <ArrowRight size={20} />,
              )}
              {directionButton(
                "backward",
                "后退 (S / ↓)",
                <ArrowDown size={20} />,
              )}
            </div>
            <span className="speed-display">
              <b className={`drive-gear gear-${world.gear.toLowerCase()}`}>
                {world.gear}
              </b>
              <strong>{String(world.speed).padStart(2, "0")}</strong>
              <span>KM/H</span>
            </span>
          </div>
        )}
      </div>
      {panel && (
        <Modal
          title={panel === "map" ? "小岛地图" : stationById(panel).name}
          onClose={close}
          className={panel === "map" ? "map-modal" : "content-drawer"}
        >
          {panel === "map" ? (
            <IslandMap
              current={world.station}
              onSelect={visit}
              onNavigate={navigate}
              position={world}
              heading={world.heading}
              path={navigation?.path}
            />
          ) : (
            <>
              <StationContent id={panel} site={site} />
              <div className="drawer-footer">
                <button className="text-button" onClick={() => navigate(panel)}>
                  <Navigation size={16} />
                  导航至此
                </button>
                <button className="text-button" onClick={() => visit(panel)}>
                  前往{stationById(panel).name}
                  <ArrowUpRight size={16} />
                </button>
                <span>{site.profile.englishName}</span>
              </div>
            </>
          )}
        </Modal>
      )}
      {message && (
        <div className="toast" role="status">
          {message}
        </div>
      )}
    </main>
  );
}
