"use client";

import {
  AlertCircle,
  Check,
  ChevronDown,
  Download,
  Film,
  Gauge,
  Headphones,
  Link2,
  LoaderCircle,
  Monitor,
  Moon,
  Music2,
  Play,
  Settings,
  ShieldCheck,
  Sparkles,
  Sun,
  Video,
  X,
  Zap,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";

type Theme = "dark" | "light" | "system";

type MediaFormat = {
  format_id: string;
  height?: number;
  quality: string;
  badge?: string;
  ext: string;
  filesize_approx?: number;
  has_video: boolean;
  has_audio: boolean;
};

type MediaResult = {
  title: string;
  thumbnail?: string;
  duration?: number;
  uploader?: string;
  extractor?: string;
  formats: MediaFormat[];
  audio_formats: MediaFormat[];
};

const DEFAULT_API_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  "https://mediahub-api-v3-flfgo.ondigitalocean.app";

const PLATFORMS = ["YouTube", "Vimeo", "TikTok", "Bilibili", "Dailymotion", "OK.ru"];

function normalizeApiUrl(value: string) {
  return value.trim().replace(/\/+$/, "");
}

function formatDuration(seconds = 0) {
  if (!seconds) return "Duration unavailable";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = Math.floor(seconds % 60);
  return hours
    ? `${hours}:${minutes.toString().padStart(2, "0")}:${remainder.toString().padStart(2, "0")}`
    : `${minutes}:${remainder.toString().padStart(2, "0")}`;
}

function formatBytes(bytes = 0) {
  if (!bytes) return "Size varies";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index > 1 ? 1 : 0)} ${units[index]}`;
}

export default function Home() {
  const [url, setUrl] = useState("");
  const [result, setResult] = useState<MediaResult | null>(null);
  const [selectedFormat, setSelectedFormat] = useState<MediaFormat | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>("dark");
  const [apiUrl, setApiUrl] = useState(DEFAULT_API_URL);
  const [savedApiUrl, setSavedApiUrl] = useState(DEFAULT_API_URL);
  const [settingsSaved, setSettingsSaved] = useState(false);

  useEffect(() => {
    const storedTheme = (localStorage.getItem("mediahub-theme") as Theme) || "dark";
    const storedApiUrl = localStorage.getItem("mediahub-api-url") || DEFAULT_API_URL;
    setTheme(storedTheme);
    setApiUrl(storedApiUrl);
    setSavedApiUrl(storedApiUrl);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    const resolvedTheme =
      theme === "system"
        ? window.matchMedia("(prefers-color-scheme: light)").matches
          ? "light"
          : "dark"
        : theme;
    root.dataset.theme = resolvedTheme;
    localStorage.setItem("mediahub-theme", theme);
  }, [theme]);

  const videoFormats = useMemo(
    () => result?.formats.filter((format) => format.has_video) || [],
    [result],
  );

  async function analyzeMedia(event: FormEvent) {
    event.preventDefault();
    const cleanUrl = url.trim();
    if (!cleanUrl) {
      setError("Paste a video URL to begin.");
      return;
    }

    try {
      new URL(cleanUrl);
    } catch {
      setError("Enter a complete URL beginning with http:// or https://.");
      return;
    }

    setLoading(true);
    setError("");
    setResult(null);
    setSelectedFormat(null);

    try {
      const response = await fetch(`${savedApiUrl}/api/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: cleanUrl }),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.detail || "Media analysis failed. Check the URL and try again.");
      }

      const media = payload as MediaResult;
      setResult(media);
      setSelectedFormat(media.formats[0] || media.audio_formats[0] || null);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "The MediaHub service could not be reached. Try again shortly.",
      );
    } finally {
      setLoading(false);
    }
  }

  function downloadSelected() {
    if (!selectedFormat || !url) return;
    const downloadUrl = new URL(`${savedApiUrl}/api/download-stream`);
    downloadUrl.searchParams.set("url", url.trim());
    downloadUrl.searchParams.set("format_id", selectedFormat.format_id);
    downloadUrl.searchParams.set("download", "true");
    window.location.assign(downloadUrl.toString());
  }

  function saveSettings(event: FormEvent) {
    event.preventDefault();
    const cleanApiUrl = normalizeApiUrl(apiUrl);
    try {
      const parsed = new URL(cleanApiUrl);
      if (!["http:", "https:"].includes(parsed.protocol)) throw new Error();
    } catch {
      setError("The API endpoint must be a valid HTTP or HTTPS URL.");
      return;
    }

    localStorage.setItem("mediahub-api-url", cleanApiUrl);
    setSavedApiUrl(cleanApiUrl);
    setApiUrl(cleanApiUrl);
    setSettingsSaved(true);
    setError("");
    window.setTimeout(() => setSettingsSaved(false), 1800);
  }

  return (
    <main className="app-shell">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />

      <header className="topbar">
        <a className="brand" href="#" aria-label="MediaHub home">
          <span className="brand-mark" aria-hidden="true">
            <Play size={17} fill="currentColor" />
          </span>
          <span>
            <strong>MediaHub</strong>
            <small>Engine Downloader</small>
          </span>
        </a>

        <div className="topbar-actions">
          <span className="service-status">
            <span className="status-dot" />
            Engine online
          </span>
          <button
            className="icon-button"
            type="button"
            onClick={() => setSettingsOpen((open) => !open)}
            aria-label={settingsOpen ? "Close settings" : "Open settings"}
            aria-expanded={settingsOpen}
          >
            {settingsOpen ? <X size={19} /> : <Settings size={19} />}
          </button>
        </div>
      </header>

      <div className={`workspace ${settingsOpen ? "settings-visible" : ""}`}>
        <section className="main-content">
          <div className="hero">
            <div className="hero-copy">
              <span className="hero-symbol" aria-hidden="true">
                <Zap size={22} fill="currentColor" />
              </span>
              <h1>Your media.<br />Your format. <em>Instantly.</em></h1>
              <p>
                Extract video and audio from the platforms you use, with the quality
                you want. No account, no clutter.
              </p>
            </div>

            <form className="analyze-form" onSubmit={analyzeMedia}>
              <label htmlFor="media-url">Video URL</label>
              <div className={`url-control ${error ? "has-error" : ""}`}>
                <Link2 size={20} aria-hidden="true" />
                <input
                  id="media-url"
                  type="url"
                  value={url}
                  onChange={(event) => {
                    setUrl(event.target.value);
                    if (error) setError("");
                  }}
                  placeholder="Paste a YouTube, Vimeo, TikTok or other video link"
                  autoComplete="url"
                  disabled={loading}
                />
                <button className="primary-button" type="submit" disabled={loading}>
                  {loading ? (
                    <>
                      <LoaderCircle className="spin" size={18} />
                      Analyzing
                    </>
                  ) : (
                    <>
                      Analyze
                      <Sparkles size={17} />
                    </>
                  )}
                </button>
              </div>
              {error && (
                <p className="form-message error-message" role="alert">
                  <AlertCircle size={16} />
                  {error}
                </p>
              )}
              <div className="platform-list" aria-label="Supported platforms">
                <span>Works with</span>
                {PLATFORMS.map((platform) => (
                  <span className="platform" key={platform}>{platform}</span>
                ))}
              </div>
            </form>
          </div>

          {loading && (
            <section className="result-panel loading-panel" aria-live="polite">
              <div className="skeleton thumbnail-skeleton" />
              <div className="loading-copy">
                <span className="skeleton line-wide" />
                <span className="skeleton line-medium" />
                <span className="skeleton line-short" />
              </div>
            </section>
          )}

          {result && !loading && (
            <section className="result-panel" aria-label="Media download options">
              <div className="media-summary">
                <div className="thumbnail">
                  {result.thumbnail ? (
                    <img src={result.thumbnail} alt="" />
                  ) : (
                    <Film size={36} />
                  )}
                  <span className="duration">{formatDuration(result.duration)}</span>
                </div>
                <div className="media-copy">
                  <span className="source-label">{result.extractor || "Media source"}</span>
                  <h2>{result.title}</h2>
                  <p>{result.uploader || "Unknown creator"}</p>
                </div>
              </div>

              <div className="format-area">
                <div className="format-heading">
                  <div>
                    <h3>Choose a format</h3>
                    <p>Select the quality and file type you need.</p>
                  </div>
                  <span>{videoFormats.length + (result.audio_formats?.length || 0)} options</span>
                </div>

                <div className="format-groups">
                  {videoFormats.length > 0 && (
                    <div className="format-group">
                      <h4><Video size={16} /> Video</h4>
                      <div className="format-grid">
                        {videoFormats.map((format) => (
                          <button
                            className={`format-option ${
                              selectedFormat?.format_id === format.format_id ? "selected" : ""
                            }`}
                            type="button"
                            key={`${format.format_id}-${format.ext}`}
                            onClick={() => setSelectedFormat(format)}
                          >
                            <span>
                              <strong>{format.quality}</strong>
                              <small>{format.ext.toUpperCase()} · {formatBytes(format.filesize_approx)}</small>
                            </span>
                            {selectedFormat?.format_id === format.format_id ? (
                              <Check size={17} />
                            ) : (
                              <ChevronDown size={16} />
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {result.audio_formats?.length > 0 && (
                    <div className="format-group">
                      <h4><Headphones size={16} /> Audio only</h4>
                      <div className="format-grid">
                        {result.audio_formats.map((format) => (
                          <button
                            className={`format-option ${
                              selectedFormat?.format_id === format.format_id ? "selected" : ""
                            }`}
                            type="button"
                            key={format.format_id}
                            onClick={() => setSelectedFormat(format)}
                          >
                            <span>
                              <strong>{format.quality}</strong>
                              <small>{format.ext.toUpperCase()} · Best available</small>
                            </span>
                            {selectedFormat?.format_id === format.format_id ? (
                              <Check size={17} />
                            ) : (
                              <Music2 size={16} />
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="download-bar">
                  <div>
                    <span>Selected format</span>
                    <strong>
                      {selectedFormat
                        ? `${selectedFormat.quality} · ${selectedFormat.ext.toUpperCase()}`
                        : "Choose an option"}
                    </strong>
                  </div>
                  <button
                    className="download-button"
                    type="button"
                    onClick={downloadSelected}
                    disabled={!selectedFormat}
                  >
                    <Download size={18} />
                    Download now
                  </button>
                </div>
              </div>
            </section>
          )}

          {!result && !loading && (
            <section className="trust-row" aria-label="MediaHub benefits">
              <div>
                <ShieldCheck size={20} />
                <span><strong>Private by design</strong> Links are processed only when you ask.</span>
              </div>
              <div>
                <Gauge size={20} />
                <span><strong>Quality preserved</strong> Choose from available HD and audio streams.</span>
              </div>
              <div>
                <Zap size={20} />
                <span><strong>Fast extraction</strong> Powered by yt-dlp and FFmpeg.</span>
              </div>
            </section>
          )}
        </section>

        <aside className="settings-panel" aria-hidden={!settingsOpen}>
          <div className="settings-header">
            <div>
              <h2>Settings</h2>
              <p>Personalize your MediaHub workspace.</p>
            </div>
            <button
              className="icon-button mobile-close"
              type="button"
              onClick={() => setSettingsOpen(false)}
              aria-label="Close settings"
            >
              <X size={19} />
            </button>
          </div>

          <form onSubmit={saveSettings}>
            <fieldset>
              <legend>Appearance</legend>
              <div className="theme-options">
                {([
                  ["dark", Moon, "Dark"],
                  ["light", Sun, "Light"],
                  ["system", Monitor, "System"],
                ] as const).map(([value, Icon, label]) => (
                  <button
                    className={theme === value ? "active" : ""}
                    type="button"
                    key={value}
                    onClick={() => setTheme(value)}
                    aria-pressed={theme === value}
                  >
                    <Icon size={18} />
                    {label}
                  </button>
                ))}
              </div>
            </fieldset>

            <div className="setting-field">
              <label htmlFor="api-url">API endpoint</label>
              <p>The processing engine used for analysis and downloads.</p>
              <input
                id="api-url"
                type="url"
                value={apiUrl}
                onChange={(event) => setApiUrl(event.target.value)}
                spellCheck="false"
              />
            </div>

            <div className="engine-card">
              <span className="engine-icon"><Zap size={18} /></span>
              <div>
                <strong>MediaHub Engine</strong>
                <small>FastAPI · yt-dlp · FFmpeg</small>
              </div>
              <span className="engine-state">Active</span>
            </div>

            <button className="save-button" type="submit">
              {settingsSaved ? <Check size={17} /> : <Settings size={17} />}
              {settingsSaved ? "Settings saved" : "Save settings"}
            </button>
          </form>

          <p className="settings-note">
            Preferences are saved only in this browser.
          </p>
        </aside>
      </div>

      <footer>
        <span>MediaHub Engine Downloader</span>
        <span>Built for fast, private media processing.</span>
      </footer>
    </main>
  );
}
