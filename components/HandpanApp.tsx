"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { AudioEngine } from "@/lib/audio/AudioEngine";
import { InputManager } from "@/lib/input/InputManager";
import { ZONE_GEOMETRY } from "@/lib/input/hitDetector";
import { Metronome } from "@/lib/performance/Metronome";
import { PlaybackScheduler } from "@/lib/performance/PlaybackScheduler";
import { PerformanceRecorder } from "@/lib/performance/PerformanceRecorder";
import type {
  HandpanHit,
  PlayerPreferences,
  RecordedHit,
} from "@/lib/music/types";
import {
  DEFAULT_SCALE_ID,
  HANDPAN_SCALES,
  getScale,
} from "@/config/scales";

const DEFAULT_PREFERENCES: PlayerPreferences = {
  masterVolume: 0.78,
  reverb: 0.32,
  resonance: 0.58,
  sensitivity: 1,
  performanceMode: "auto",
  showNotes: true,
  showKeys: false,
  haptics: true,
};

type AudioState = "locked" | "starting" | "ready" | "error";

const KEYBOARD_ZONES: Record<string, number> = {
  Space: 0,
  KeyA: 1,
  KeyS: 2,
  KeyD: 3,
  KeyF: 4,
  KeyG: 5,
  KeyH: 6,
  KeyJ: 7,
  KeyK: 8,
};

function formatKey(key: string): string {
  return key === "Space" ? "SPACE" : key;
}

function formatDuration(milliseconds: number): string {
  const seconds = Math.floor(milliseconds / 1_000);
  return `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
}

export function HandpanApp() {
  const engineRef = useRef<AudioEngine | null>(null);
  const inputRef = useRef<InputManager | null>(null);
  const recorderRef = useRef(new PerformanceRecorder());
  const metronomeRef = useRef(new Metronome());
  const playbackRef = useRef(new PlaybackScheduler());
  const boardRef = useRef<HTMLDivElement | null>(null);
  const feedbackRef = useRef<HTMLDivElement | null>(null);
  const lastNoteRef = useRef<HTMLSpanElement | null>(null);
  const scaleRef = useRef(getScale(DEFAULT_SCALE_ID));
  const preferencesRef = useRef(DEFAULT_PREFERENCES);
  const recordingRef = useRef(false);
  const recordStartedRef = useRef(0);
  const keyboardDownRef = useRef(new Set<string>());

  const [audioState, setAudioState] = useState<AudioState>("locked");
  const [audioError, setAudioError] = useState("");
  const [latency, setLatency] = useState(0);
  const [scaleId, setScaleId] = useState(DEFAULT_SCALE_ID);
  const [scaleMenuOpen, setScaleMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pointerCount, setPointerCount] = useState(0);
  const [isTuning, setIsTuning] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordedHits, setRecordedHits] = useState<RecordedHit[]>([]);
  const [recordElapsed, setRecordElapsed] = useState(0);
  const [playingBack, setPlayingBack] = useState(false);
  const [metronomeOn, setMetronomeOn] = useState(false);
  const [metronomeBeat, setMetronomeBeat] = useState(-1);
  const [bpm, setBpm] = useState(92);
  const [helpOpen, setHelpOpen] = useState(false);
  const [preferences, setPreferences] =
    useState<PlayerPreferences>(DEFAULT_PREFERENCES);

  const scale = useMemo(() => getScale(scaleId), [scaleId]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      try {
        const stored = window.localStorage.getItem("resona:preferences");
        if (stored) {
          setPreferences({
            ...DEFAULT_PREFERENCES,
            ...(JSON.parse(stored) as Partial<PlayerPreferences>),
          });
        }
        const storedScale = window.localStorage.getItem("resona:scale");
        if (
          storedScale &&
          HANDPAN_SCALES.some((item) => item.id === storedScale)
        ) {
          setScaleId(storedScale);
        }
      } catch {
        // Private browsing may make local storage unavailable.
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    scaleRef.current = scale;
  }, [scale]);

  useEffect(() => {
    preferencesRef.current = preferences;
    engineRef.current?.setSettings(preferences);
    inputRef.current?.setSensitivity(preferences.sensitivity);
    try {
      window.localStorage.setItem(
        "resona:preferences",
        JSON.stringify(preferences),
      );
    } catch {
      // Preferences remain available for this session.
    }
  }, [preferences]);

  useEffect(() => {
    if (!recording) return;
    const timer = window.setInterval(() => {
      setRecordElapsed(performance.now() - recordStartedRef.current);
    }, 250);
    return () => window.clearInterval(timer);
  }, [recording]);

  useEffect(() => {
    metronomeRef.current.setBpm(bpm);
  }, [bpm]);

  useEffect(
    () => () => {
      metronomeRef.current.stop();
      playbackRef.current.stop(false);
      void engineRef.current?.close();
    },
    [],
  );

  const animateHit = useCallback((hit: HandpanHit, noteLabel: string) => {
    const board = boardRef.current;
    const feedback = feedbackRef.current;
    if (!board || !feedback) return;

    const visualZone =
      hit.zoneId === "ding"
        ? "ding"
        : hit.zoneId.startsWith("tone-")
          ? hit.zoneId
          : `tone-${hit.noteIndex}`;
    const zone = board.querySelector<HTMLElement>(
      `[data-zone-id="${visualZone}"]`,
    );
    zone?.animate(
      [
        {
          filter: "brightness(1)",
          transform: `translate(-50%, -50%) rotate(var(--zone-rotation)) scale(1)`,
        },
        {
          filter: `brightness(${1.3 + hit.velocity * 0.72}) saturate(1.2)`,
          transform: `translate(-50%, -50%) rotate(var(--zone-rotation)) scale(${0.985 - hit.velocity * 0.014})`,
          offset: 0.16,
        },
        {
          filter: "brightness(1)",
          transform: `translate(-50%, -50%) rotate(var(--zone-rotation)) scale(1)`,
        },
      ],
      {
        duration: 340 + hit.velocity * 230,
        easing: "cubic-bezier(.18,.7,.2,1)",
      },
    );

    const wave = document.createElement("i");
    wave.className = "impact-wave";
    wave.style.left = `${hit.position.x * 100}%`;
    wave.style.top = `${hit.position.y * 100}%`;
    wave.style.setProperty("--impact", hit.velocity.toFixed(3));
    feedback.appendChild(wave);
    window.setTimeout(() => wave.remove(), 780);

    board.animate(
      [
        { transform: "translateZ(0) scale(1)" },
        {
          transform: `translateZ(0) scale(${1 - hit.velocity * 0.0025})`,
          offset: 0.2,
        },
        { transform: "translateZ(0) scale(1)" },
      ],
      { duration: 150, easing: "ease-out" },
    );

    if (lastNoteRef.current) {
      lastNoteRef.current.textContent = `${noteLabel} · ${Math.round(hit.velocity * 100)}`;
      lastNoteRef.current.animate(
        [{ opacity: 0.35 }, { opacity: 1 }, { opacity: 0.62 }],
        { duration: 900, easing: "ease-out" },
      );
    }
  }, []);

  const performHit = useCallback(
    (hit: HandpanHit) => {
      const currentScale = scaleRef.current;
      const note = currentScale.notes[hit.noteIndex];
      if (!note) return;
      const engine = engineRef.current;
      void engine?.resume();
      engine?.playHit(note, hit, currentScale.id);
      animateHit(hit, `${note.label}${note.octave}`);
      if (recordingRef.current) {
        recorderRef.current.capture(hit, currentScale.id);
      }

      if (
        preferencesRef.current.haptics &&
        hit.pointerType === "touch" &&
        hit.velocity > 0.3
      ) {
        navigator.vibrate?.(hit.velocity > 0.75 ? 9 : 5);
      }
    },
    [animateHit],
  );

  const enableAudio = useCallback(async () => {
    if (audioState === "starting") return;
    setAudioState("starting");
    setAudioError("");
    try {
      const engine = engineRef.current ?? new AudioEngine();
      engineRef.current = engine;
      await engine.initialize();
      engine.setSettings(preferencesRef.current);
      await engine.prepareScale(scaleRef.current.id);
      setLatency(engine.getLatencyMs());
      setAudioState("ready");
    } catch (error) {
      setAudioError(
        error instanceof Error ? error.message : "声音初始化失败，请重试",
      );
      setAudioState("error");
    }
  }, [audioState]);

  useEffect(() => {
    if (audioState !== "ready" || !boardRef.current) return;
    const manager = new InputManager(boardRef.current, {
      onHit: performHit,
      onDamp: (zoneId) => engineRef.current?.dampen(zoneId),
      onRelease: () => undefined,
      onPointerCount: setPointerCount,
    });
    manager.setSensitivity(preferencesRef.current.sensitivity);
    inputRef.current = manager;
    return () => {
      manager.destroy();
      inputRef.current = null;
    };
  }, [audioState, performHit]);

  useEffect(() => {
    const resume = () => void engineRef.current?.resume();
    window.addEventListener("focus", resume);
    document.addEventListener("visibilitychange", resume);
    return () => {
      window.removeEventListener("focus", resume);
      document.removeEventListener("visibilitychange", resume);
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        audioState !== "ready" ||
        event.repeat ||
        keyboardDownRef.current.has(event.code) ||
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLSelectElement
      ) {
        return;
      }
      const noteIndex = KEYBOARD_ZONES[event.code];
      if (noteIndex === undefined) return;
      event.preventDefault();
      keyboardDownRef.current.add(event.code);
      const zone = ZONE_GEOMETRY[noteIndex];
      performHit({
        zoneId: zone.id,
        noteIndex,
        velocity: event.shiftKey ? 0.9 : event.altKey ? 0.4 : 0.67,
        position: { x: zone.x, y: zone.y, radial: 0.18 },
        technique: event.shiftKey
          ? "slap"
          : event.altKey
            ? "muted"
            : "tone",
        pointerType: "keyboard",
      });
    };
    const onKeyUp = (event: KeyboardEvent) => {
      keyboardDownRef.current.delete(event.code);
    };
    const clearKeys = () => keyboardDownRef.current.clear();
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", clearKeys);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", clearKeys);
    };
  }, [audioState, performHit]);

  const chooseScale = async (nextScaleId: string) => {
    if (nextScaleId === scaleId) {
      setScaleMenuOpen(false);
      return;
    }
    setIsTuning(true);
    setScaleMenuOpen(false);
    engineRef.current?.stopAll();
    await engineRef.current?.prepareScale(nextScaleId);
    setScaleId(nextScaleId);
    try {
      window.localStorage.setItem("resona:scale", nextScaleId);
    } catch {
      // The current selection still applies for this session.
    }
    window.setTimeout(() => setIsTuning(false), 260);
  };

  const updatePreference = <Key extends keyof PlayerPreferences>(
    key: Key,
    value: PlayerPreferences[Key],
  ) => {
    setPreferences((current) => ({ ...current, [key]: value }));
  };

  const stopPlayback = useCallback(() => {
    playbackRef.current.stop();
    setPlayingBack(false);
  }, []);

  const toggleRecording = () => {
    if (recordingRef.current) {
      recordingRef.current = false;
      setRecording(false);
      const events = recorderRef.current.stop();
      setRecordedHits(events);
      setRecordElapsed(events.at(-1)?.time ?? recordElapsed);
      return;
    }

    stopPlayback();
    recorderRef.current.start();
    recordStartedRef.current = performance.now();
    recordingRef.current = true;
    setRecordedHits([]);
    setRecordElapsed(0);
    setRecording(true);
  };

  const togglePlayback = () => {
    if (playingBack) {
      stopPlayback();
      return;
    }
    const engine = engineRef.current;
    if (!engine || !recordedHits.length) return;
    if (recordingRef.current) toggleRecording();
    setPlayingBack(true);
    playbackRef.current.start(engine, recordedHits, {
      resolveNote: (event) =>
        getScale(event.scaleId).notes[event.noteIndex] ?? null,
      onVisual: (event, note) =>
        animateHit(event, `${note.label}${note.octave}`),
      onComplete: () => setPlayingBack(false),
    });
  };

  const toggleMetronome = () => {
    if (metronomeOn) {
      metronomeRef.current.stop();
      setMetronomeOn(false);
      setMetronomeBeat(-1);
      return;
    }
    const engine = engineRef.current;
    if (!engine) return;
    metronomeRef.current.start(engine, bpm, setMetronomeBeat);
    setMetronomeOn(true);
  };

  const enterFullscreen = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen();
      }
    } catch {
      // iOS Safari may not expose the Fullscreen API.
    }
  };

  const exportPerformance = () => {
    if (!recordedHits.length) return;
    const payload = {
      version: 1,
      instrument: "RESONA Virtual Handpan",
      createdAt: new Date().toISOString(),
      duration: recordedHits.at(-1)?.time ?? 0,
      eventCount: recordedHits.length,
      scales: [...new Set(recordedHits.map((event) => event.scaleId))],
      events: recordedHits,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `resona-take-${new Date()
      .toISOString()
      .slice(0, 19)
      .replaceAll(":", "-")}.json`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
  };

  return (
    <main className="app-shell">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      <div className="grain" aria-hidden="true" />

      <div
        className="instrument-ui"
        aria-hidden={audioState !== "ready"}
        inert={audioState !== "ready"}
      >
      <header className="topbar">
        <div className="brand" aria-label="RESONA Virtual Handpan">
          <span className="brand-mark" aria-hidden="true">
            <i />
            <i />
          </span>
          <span className="brand-copy">
            <strong>RESONA</strong>
            <small>VIRTUAL HANDPAN</small>
          </span>
        </div>

        <div className="scale-control">
          <span className="control-eyebrow">CURRENT SCALE</span>
          <button
            type="button"
            className="scale-button"
            onClick={() => setScaleMenuOpen((open) => !open)}
            aria-expanded={scaleMenuOpen}
          >
            <span>
              <b>{scale.name}</b>
              <small>{scale.description}</small>
            </span>
            <i className={scaleMenuOpen ? "chevron open" : "chevron"} />
          </button>
          {scaleMenuOpen && (
            <div className="scale-menu">
              {HANDPAN_SCALES.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  className={item.id === scaleId ? "selected" : ""}
                  onClick={() => void chooseScale(item.id)}
                >
                  <span className="scale-root">{item.root}</span>
                  <span>
                    <b>{item.name}</b>
                    <small>{item.family}</small>
                  </span>
                  {item.id === scaleId && <i className="selected-dot" />}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="top-actions">
          <div className="audio-status" title="Web Audio 输出延迟估算">
            <i className={audioState === "ready" ? "live" : ""} />
            <span>
              {audioState === "ready" ? `${latency} ms` : "SOUND OFF"}
            </span>
          </div>
          <button
            type="button"
            className={`round-button ${settingsOpen ? "active" : ""}`}
            onClick={() => setSettingsOpen((open) => !open)}
            aria-label="打开声音设置"
          >
            <span className="sliders-icon" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
          </button>
        </div>
      </header>

      <section className="instrument-section" aria-label="手碟演奏区">
        <div className="instrument-meta left">
          <span>PHYSICAL MODEL</span>
          <b>STEEL / AIR / RESONANCE</b>
        </div>
        <div className="instrument-meta right">
          <span>ACTIVE TOUCH</span>
          <b>{pointerCount.toString().padStart(2, "0")} / MULTI</b>
        </div>

        <div className="instrument-wrap">
          <div className="floor-shadow" />
          <div
            ref={boardRef}
            className="handpan"
            role="application"
            aria-label={`${scale.name} 虚拟手碟。点击或触摸音区演奏。`}
          >
            <div className="metal-surface" aria-hidden="true" />
            <div className="shoulder-ring" aria-hidden="true" />
            <div className="hammer-marks" aria-hidden="true" />
            {ZONE_GEOMETRY.map((zone) => {
              const note = scale.notes[zone.noteIndex];
              const style = {
                "--zone-x": `${zone.x * 100}%`,
                "--zone-y": `${zone.y * 100}%`,
                "--zone-w": `${zone.rx * 200}%`,
                "--zone-h": `${zone.ry * 200}%`,
                "--zone-rotation": `${zone.rotation}deg`,
              } as CSSProperties;
              return (
                <div
                  key={zone.id}
                  className={`tone-field ${zone.id === "ding" ? "ding" : ""}`}
                  data-zone-id={zone.id}
                  style={style}
                  aria-hidden="true"
                >
                  <div className="tone-basin">
                    <div className="tone-dome" />
                  </div>
                  <span
                    className={`note-label ${preferences.showNotes ? "visible" : ""}`}
                  >
                    <b>{note.label}</b>
                    <small>{note.octave}</small>
                  </span>
                  {preferences.showKeys && (
                    <kbd>{formatKey(note.key)}</kbd>
                  )}
                </div>
              );
            })}
            <div ref={feedbackRef} className="feedback-layer" aria-hidden="true" />
            <div className="maker-stamp" aria-hidden="true">
              <i />
              RESONA
            </div>
          </div>
        </div>

        <div className="now-playing" aria-live="polite">
          <i />
          <span ref={lastNoteRef}>TOUCH TO PLAY</span>
        </div>
      </section>

      <nav className="transport-dock" aria-label="演奏与录音控制">
        <button
          type="button"
          className={`transport-button record ${recording ? "active" : ""}`}
          onClick={toggleRecording}
          aria-label={recording ? "停止录音" : "开始录音"}
          title={recording ? "停止录音" : "录制演奏事件"}
        >
          <i />
        </button>
        {(recording || recordedHits.length > 0) && (
          <span className="take-status">
            <b>{recording ? "REC" : `${recordedHits.length} HITS`}</b>
            <small>
              {formatDuration(
                recording
                  ? recordElapsed
                  : (recordedHits.at(-1)?.time ?? recordElapsed),
              )}
            </small>
          </span>
        )}
        <span className="dock-divider" />
        <button
          type="button"
          className={`transport-button playback ${playingBack ? "active" : ""}`}
          onClick={togglePlayback}
          disabled={!recordedHits.length && !playingBack}
          aria-label={playingBack ? "停止回放" : "回放录音"}
          title={playingBack ? "停止回放" : "按时间轴回放"}
        >
          <i />
        </button>
        <button
          type="button"
          className={`transport-button metro ${metronomeOn ? "active" : ""}`}
          onClick={toggleMetronome}
          aria-label={metronomeOn ? "关闭节拍器" : "开启节拍器"}
          title="节拍器"
        >
          <span className="metronome-glyph">
            {[0, 1, 2, 3].map((beat) => (
              <i
                key={beat}
                className={metronomeOn && metronomeBeat === beat ? "beat" : ""}
              />
            ))}
          </span>
        </button>
        <div className="bpm-control" aria-label={`节拍速度 ${bpm} BPM`}>
          <button
            type="button"
            onClick={() => setBpm((value) => Math.max(40, value - 1))}
            aria-label="降低 BPM"
          >
            −
          </button>
          <span>
            <b>{bpm}</b>
            <small>BPM</small>
          </span>
          <button
            type="button"
            onClick={() => setBpm((value) => Math.min(200, value + 1))}
            aria-label="提高 BPM"
          >
            +
          </button>
        </div>
        <span className="dock-divider compact-hide" />
        <button
          type="button"
          className="transport-button fullscreen compact-hide"
          onClick={() => void enterFullscreen()}
          aria-label="切换全屏"
          title="全屏演奏"
        >
          <i />
        </button>
        <button
          type="button"
          className="transport-button help"
          onClick={() => setHelpOpen(true)}
          aria-label="打开演奏帮助"
          title="演奏帮助"
        >
          ?
        </button>
      </nav>

      <footer className="play-footer">
        <div className="technique-hint">
          <span>
            <kbd>SHIFT</kbd> Slap
          </span>
          <span>
            <kbd>ALT</kbd> Muted
          </span>
          <span className="desktop-hint">
            <kbd>SPACE</kbd> Ding
          </span>
        </div>
        <p>中心击打更纯净 · 边缘击打泛音更明亮 · 滑过音区可连续触发</p>
      </footer>

      <aside
        className={`settings-panel ${settingsOpen ? "open" : ""}`}
        aria-hidden={!settingsOpen}
        inert={!settingsOpen}
      >
        <div className="panel-head">
          <div>
            <span>INSTRUMENT</span>
            <h2>声音与触感</h2>
          </div>
          <button
            type="button"
            onClick={() => setSettingsOpen(false)}
            aria-label="关闭设置"
          >
            ×
          </button>
        </div>

        <div className="setting-group">
          <RangeSetting
            label="主音量"
            value={preferences.masterVolume}
            onChange={(value) => updatePreference("masterVolume", value)}
          />
          <RangeSetting
            label="空间混响"
            value={preferences.reverb}
            onChange={(value) => updatePreference("reverb", value)}
          />
          <RangeSetting
            label="腔体共鸣"
            value={preferences.resonance}
            onChange={(value) => updatePreference("resonance", value)}
          />
          <RangeSetting
            label="动态灵敏度"
            value={preferences.sensitivity}
            min={0.65}
            max={1.35}
            onChange={(value) => updatePreference("sensitivity", value)}
          />
        </div>

        <div className="setting-group switches">
          <ToggleSetting
            label="显示音名"
            detail="在音区上标注当前调音"
            checked={preferences.showNotes}
            onChange={(checked) => updatePreference("showNotes", checked)}
          />
          <ToggleSetting
            label="键盘提示"
            detail="显示 A–K 与 Space 映射"
            checked={preferences.showKeys}
            onChange={(checked) => updatePreference("showKeys", checked)}
          />
          <ToggleSetting
            label="触觉反馈"
            detail="支持设备上的轻微振动"
            checked={preferences.haptics}
            onChange={(checked) => updatePreference("haptics", checked)}
          />
        </div>

        <div className="setting-group performance-setting">
          <div className="setting-title">
            <span>
              <b>性能模式</b>
              <small>低配设备可减少泛音声部</small>
            </span>
            <em>{latency ? `${latency} ms` : "—"}</em>
          </div>
          <div className="segment-control">
            {(
              [
                ["eco", "省电"],
                ["auto", "自动"],
                ["quality", "高质量"],
              ] as const
            ).map(([value, label]) => (
              <button
                type="button"
                key={value}
                className={
                  preferences.performanceMode === value ? "selected" : ""
                }
                onClick={() => updatePreference("performanceMode", value)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="engine-card">
            <span className="engine-orbit" aria-hidden="true">
              <i />
            </span>
            <span>
              <b>RESONA Physical Model</b>
              <small>48 kHz · 44 voices · multi-layer resonance</small>
            </span>
          </div>
        </div>

        <div className="scale-spec">
          <span>当前音阶</span>
          <div>
            {scale.notes.map((note) => (
              <span key={note.id}>
                <b>
                  {note.label}
                  {note.octave}
                </b>
                <small>{note.frequency.toFixed(2)} Hz</small>
              </span>
            ))}
          </div>
        </div>

        <div className="panel-actions">
          <button
            type="button"
            onClick={exportPerformance}
            disabled={!recordedHits.length}
          >
            导出演奏 JSON
          </button>
          <button type="button" onClick={() => void enterFullscreen()}>
            全屏演奏
          </button>
          <button
            type="button"
            onClick={() => {
              setSettingsOpen(false);
              setHelpOpen(true);
            }}
          >
            演奏指南
          </button>
        </div>
      </aside>
      {settingsOpen && (
        <button
          type="button"
          className="panel-scrim"
          onClick={() => setSettingsOpen(false)}
          aria-label="关闭设置"
        />
      )}

      {helpOpen && (
        <div
          className="help-overlay"
          role="presentation"
          onClick={() => setHelpOpen(false)}
        >
          <section
            className="help-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="help-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="panel-head">
              <div>
                <span>PLAYING GUIDE</span>
                <h2 id="help-title">像真正的手碟一样演奏</h2>
              </div>
              <button
                type="button"
                onClick={() => setHelpOpen(false)}
                aria-label="关闭演奏帮助"
              >
                ×
              </button>
            </div>
            <div className="guide-grid">
              <article>
                <i className="guide-icon center-hit" />
                <b>中心音区</b>
                <p>击打凹槽中心获得稳定基音；靠近边缘会增加明亮泛音。</p>
              </article>
              <article>
                <i className="guide-icon edge-hit" />
                <b>边缘与 Slap</b>
                <p>敲击碟身外圈产生清脆边音，按住 Shift 可演奏 Slap。</p>
              </article>
              <article>
                <i className="guide-icon damp-hit" />
                <b>制音与滑奏</b>
                <p>长按音区会轻微制音；手指滑过不同音区会自然连续触发。</p>
              </article>
            </div>
            <div className="key-map">
              <span>KEYBOARD MAP</span>
              <div>
                {scale.notes.map((note) => (
                  <span key={note.id}>
                    <kbd>{formatKey(note.key)}</kbd>
                    <b>
                      {note.label}
                      {note.octave}
                    </b>
                  </span>
                ))}
              </div>
            </div>
            <div className="modifier-row">
              <span>
                <kbd>SHIFT</kbd>
                Slap
              </span>
              <span>
                <kbd>ALT</kbd>
                Muted Tap
              </span>
              <span>
                <kbd>SPACE</kbd>
                Central Ding
              </span>
            </div>
          </section>
        </div>
      )}

      {isTuning && (
        <div className="tuning-toast" role="status">
          <i />
          调整共鸣腔体…
        </div>
      )}
      </div>

      {audioState !== "ready" && (
        <div
          className="sound-gate"
          role="dialog"
          aria-modal="true"
          aria-labelledby="sound-gate-title"
        >
          <div className="gate-halo" aria-hidden="true" />
          <div className="gate-content">
            <span className="gate-kicker">INTERACTIVE INSTRUMENT</span>
            <div className="gate-symbol" aria-hidden="true">
              <i />
              <i />
              <i />
              <i />
            </div>
            <h1 id="sound-gate-title">触碰，让钢铁呼吸</h1>
            <p>
              戴上耳机，感受低频腔体与金属泛音。
              <br />
              支持十指触控、键盘与触控笔。
            </p>
            <button
              type="button"
              onClick={() => void enableAudio()}
              disabled={audioState === "starting"}
            >
              <span className="play-triangle" />
              {audioState === "starting" ? "正在调音…" : "开启声音"}
            </button>
            {audioError && <small className="gate-error">{audioError}</small>}
            <small>声音仅在你的设备中生成 · 建议关闭静音模式</small>
          </div>
        </div>
      )}
    </main>
  );
}

interface RangeSettingProps {
  label: string;
  value: number;
  min?: number;
  max?: number;
  onChange: (value: number) => void;
}

function RangeSetting({
  label,
  value,
  min = 0,
  max = 1,
  onChange,
}: RangeSettingProps) {
  const percent = ((value - min) / (max - min)) * 100;
  return (
    <label className="range-setting">
      <span>
        <b>{label}</b>
        <small>{Math.round(percent)}%</small>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step="0.01"
        value={value}
        style={{ "--range-value": `${percent}%` } as CSSProperties}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

interface ToggleSettingProps {
  label: string;
  detail: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

function ToggleSetting({
  label,
  detail,
  checked,
  onChange,
}: ToggleSettingProps) {
  return (
    <label className="toggle-setting">
      <span>
        <b>{label}</b>
        <small>{detail}</small>
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <i aria-hidden="true" />
    </label>
  );
}
