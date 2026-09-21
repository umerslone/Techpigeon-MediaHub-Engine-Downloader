'use client';

import { useState, useEffect } from 'react';

interface Format {
  format_id: string;
  height?: number;
  quality: string;
  badge: string;
  ext: string;
  has_video: boolean;
  has_audio: boolean;
}

interface AnalyzeResponse {
  title: string;
  thumbnail: string;
  formats: Format[];
  audio_formats: Format[];
  has_ffmpeg?: boolean;
  ffmpeg_warning?: string;
}

interface DownloadResponse {
  success: boolean;
  title: string;
  format: string;
  format_id: string;
  duration: number;
  uploader: string;
  filesize: number;
  filepath: string;
  message: string;
  optimization?: {
    avg_speed_mbps: number;
    final_connections: number;
    throttled: boolean;
    retries_used: number;
  };
}

export default function Home() {
  const creatorUrl = process.env.NEXT_PUBLIC_CREATOR_URL || 'https://github.com/umerslone';
  const repoUrlRaw = process.env.NEXT_PUBLIC_REPO_URL || '';
  const repoUrl = repoUrlRaw.replace(/\.git\/?$/, '').replace(/\/$/, '');
  const hasPublicRepoUrl = /^https:\/\/github\.com\/[^/]+\/[^/]+$/.test(repoUrl);
  const repoStarsUrl = hasPublicRepoUrl
    ? `${repoUrl}/stargazers`
    : 'https://github.com/search?q=Techpigeon-MediaHub-Engine-Downloader&type=repositories';
  const repoContributeUrl = hasPublicRepoUrl
    ? `${repoUrl}/blob/main/CONTRIBUTING.md`
    : 'https://github.com/umerslone?tab=repositories';
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [warning, setWarning] = useState('');
  const [activeTab, setActiveTab] = useState<'video' | 'audio'>('video');
  const [formats, setFormats] = useState<Format[]>([]);
  const [selectedFormat, setSelectedFormat] = useState<string>('');
  const [progress, setProgress] = useState(0);
  const [progressStatus, setProgressStatus] = useState('');
  const [progressSpeed, setProgressSpeed] = useState('0B/s');
  const [progressEta, setProgressEta] = useState('--:--');
  const [maxSpeedMbps, setMaxSpeedMbps] = useState<string>('0');
  const [maxRetries, setMaxRetries] = useState<string>('3');
  const [optimizationStats, setOptimizationStats] = useState<{avg_speed_mbps: number; final_connections: number; throttled: boolean; retries_used: number} | null>(null);
  const [downloadDetails, setDownloadDetails] = useState<DownloadResponse | null>(null);
  const [openingFolder, setOpeningFolder] = useState(false);
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

  const formatBytes = (bytes?: number) => {
    if (!bytes || bytes <= 0) return 'Unknown';
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), sizes.length - 1);
    const value = bytes / Math.pow(1024, i);
    return `${value.toFixed(i === 0 ? 0 : 2)} ${sizes[i]}`;
  };

  // Auto-analyze URL when it changes
  useEffect(() => {
    if (url.length > 10 && (url.startsWith('http://') || url.startsWith('https://'))) {
      handleAnalyze();
    } else {
      setFormats([]);
      setSelectedFormat('');
    }
  }, [url, activeTab]);

  const handleAnalyze = async () => {
    setError('');
    setWarning('');
    setAnalyzing(true);
    setFormats([]);
    setSelectedFormat('');

    try {
      const response = await fetch(`${apiUrl}/api/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });

      if (!response.ok) throw new Error('Failed to analyze URL');

      const data: AnalyzeResponse = await response.json();
      
      // Show FFmpeg warning if present
      if (data.ffmpeg_warning) {
        setWarning(data.ffmpeg_warning);
      }
      
      const availableFormats = activeTab === 'video' ? data.formats : data.audio_formats;
      setFormats(availableFormats);
      if (availableFormats.length > 0) {
        setSelectedFormat(availableFormats[0].format_id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to analyze URL');
    } finally {
      setAnalyzing(false);
    }
  };

  const handleDownload = async () => {
    if (!selectedFormat) {
      setError('Please select a quality');
      return;
    }

    setError('');
    setSuccess('');
    setDownloadDetails(null);
    setProgress(0);
    setProgressStatus('starting');
    setLoading(true);

    let progressAbort = false;

    // Start listening to progress updates FIRST
    const progressListener = async () => {
      let retries = 0;
      const maxRetries = 10;
      let lastProgress = 0;
      
      while (retries < maxRetries && !progressAbort) {
        try {
          const response = await fetch(`${apiUrl}/api/download-progress`, {
            signal: AbortSignal.timeout(30000)
          });
          if (!response.body) {
            retries++;
            await new Promise(r => setTimeout(r, 100));
            continue;
          }

          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
          let consecutiveErrors = 0;

          while (!progressAbort) {
            try {
              const { done, value } = await reader.read();
              if (done) break;

              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split('\n');
              buffer = lines.pop() || '';

              for (const line of lines) {
                if (line.startsWith('data: ')) {
                  try {
                    const data = JSON.parse(line.slice(6));
                    if (data.done) {
                      progressAbort = true;
                      break;
                    }
                    
                    // Only update if progress actually changed or is a new status
                    const newProgress = data.progress || 0;
                    if (newProgress !== lastProgress || data.status === 'downloading') {
                      lastProgress = newProgress;
                      setProgress(newProgress);
                      setProgressStatus(data.status || '');
                      setProgressSpeed(data.speed || '0B/s');
                      setProgressEta(data.eta || '--:--');
                    }
                    consecutiveErrors = 0;
                  } catch (e) {
                    consecutiveErrors++;
                    if (consecutiveErrors > 5) {
                      console.error('Too many parse errors, reconnecting:', e);
                      throw e;
                    }
                  }
                }
              }
            } catch (err) {
              if (progressAbort) break;
              throw err;
            }
          }
          break;
        } catch (err) {
          if (progressAbort) break;
          retries++;
          if (retries < maxRetries) {
            await new Promise(r => setTimeout(r, 200));
          }
        }
      }
    };

    // Start progress listener and wait for it to be ready
    const progressPromise = progressListener();

    // Small delay to ensure listener is connected before starting download
    await new Promise(r => setTimeout(r, 100));

    try {
      const response = await fetch(`${apiUrl}/api/download`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url,
          format: activeTab,
          format_id: selectedFormat,
          max_speed_bps: parseInt(maxSpeedMbps) > 0 ? parseInt(maxSpeedMbps) * 1024 * 1024 : 0,
          max_retries: parseInt(maxRetries) || 3,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Download failed');
      }

      const result: DownloadResponse = await response.json();
      progressAbort = true;
      await progressPromise;
      
      setOptimizationStats(result.optimization || null);
      setDownloadDetails(result);
      setSuccess(result.message || 'Download completed successfully!');
      setProgress(100);
      setProgressSpeed(
        typeof result.optimization?.avg_speed_mbps === 'number'
          ? `${result.optimization.avg_speed_mbps.toFixed(2)} MB/s`
          : '0B/s'
      );
      setProgressEta('Complete');
      setUrl('');
      setFormats([]);
    } catch (err) {
      progressAbort = true;
      setError('❌ ' + (err instanceof Error ? err.message : 'Download failed'));
      setProgress(0);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDownloadFolder = async () => {
    setError('');
    setOpeningFolder(true);
    try {
      const response = await fetch(`${apiUrl}/api/open-download-folder`, {
        method: 'POST',
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to open download folder');
      }
      const data = await response.json();
      setSuccess(data.message || 'Download folder opened');
    } catch (err) {
      setError('❌ ' + (err instanceof Error ? err.message : 'Failed to open download folder'));
    } finally {
      setOpeningFolder(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(to bottom right, rgb(15, 23, 42), rgb(30, 58, 138), rgb(8, 145, 178))',
      padding: '2rem 1rem',
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }}>
      {/* Header */}
      <header style={{
        borderBottom: '1px solid rgba(59, 130, 246, 0.3)',
        backgroundColor: 'rgba(15, 23, 42, 0.5)',
        backdropFilter: 'blur(16px)',
        padding: '1rem',
        position: 'sticky',
        top: 0,
        zIndex: 50,
        marginBottom: '2rem',
      }}>
        <div style={{
          maxWidth: '1280px',
          margin: '0 auto',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{
              width: '40px',
              height: '40px',
              background: 'linear-gradient(to bottom right, rgb(34, 211, 238), rgb(37, 99, 235))',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '24px',
            }}>
              ✨
            </div>
            <div>
              <h1 style={{ fontSize: '24px', fontWeight: 'bold', color: 'white', margin: 0 }}>
                MediaHub
              </h1>
              <p style={{ fontSize: '12px', color: 'rgb(147, 197, 253)', margin: '0.25rem 0 0 0' }}>
                by TechPigeon
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main style={{ maxWidth: '896px', margin: '0 auto' }}>
        {/* Hero Section */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <h2 style={{
            fontSize: '48px',
            fontWeight: 'bold',
            color: 'white',
            margin: '0 0 1rem 0',
          }}>
            Download <span style={{
              background: 'linear-gradient(to right, rgb(34, 211, 238), rgb(59, 130, 246))',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}>Videos & Audio</span>
          </h2>
          <p style={{
            fontSize: '20px',
            color: 'rgb(191, 219, 254)',
            maxWidth: '512px',
            margin: '0 auto',
          }}>
            Professional-grade HD/4K video and audio downloader. Fast, reliable, and secure.
          </p>
        </div>

        {/* Main Card */}
        <div style={{
          backgroundColor: 'rgba(15, 23, 42, 0.5)',
          backdropFilter: 'blur(16px)',
          border: '1px solid rgba(59, 130, 246, 0.3)',
          borderRadius: '16px',
          padding: '32px',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3)',
          marginBottom: '2rem',
        }}>
          {/* Tabs */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '32px' }}>
            {(['video', 'audio'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => {
                  setActiveTab(tab);
                  setFormats([]);
                  setSelectedFormat('');
                  setError('');
                }}
                style={{
                  flex: 1,
                  padding: '12px 24px',
                  borderRadius: '8px',
                  fontWeight: '600',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '16px',
                  transition: 'all 0.2s',
                  background: activeTab === tab
                    ? 'linear-gradient(to right, rgb(34, 211, 238), rgb(37, 99, 235))'
                    : 'rgb(30, 41, 59)',
                  color: activeTab === tab ? 'white' : 'rgb(147, 197, 253)',
                }}
              >
                {tab === 'video' ? '🎬 Video' : '🎵 Audio'}
              </button>
            ))}
          </div>

          {/* URL Input */}
          <div style={{ marginBottom: '24px' }}>
            <label style={{
              display: 'block',
              fontSize: '14px',
              fontWeight: '600',
              color: 'rgb(191, 219, 254)',
              marginBottom: '12px',
            }}>
              Video URL (YouTube, TikTok, Instagram, Twitter, etc.)
            </label>
            <input
              type="url"
              placeholder="https://example.com/video"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={loading}
              style={{
                width: '100%',
                padding: '12px 16px',
                backgroundColor: 'rgb(30, 41, 59)',
                border: '1px solid rgba(59, 130, 246, 0.3)',
                borderRadius: '8px',
                color: 'white',
                fontSize: '16px',
                boxSizing: 'border-box',
                transition: 'all 0.2s',
                outline: 'none',
                opacity: loading ? 0.6 : 1,
              }}
              onFocus={(e) => {
                if (!loading) {
                  e.currentTarget.style.borderColor = 'rgb(34, 211, 238)';
                  e.currentTarget.style.boxShadow = '0 0 0 3px rgba(34, 211, 238, 0.1)';
                }
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = 'rgba(59, 130, 246, 0.3)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            />
          </div>

          {/* Quality Selection */}
          {formats.length > 0 && (
            <div style={{ marginBottom: '24px' }}>
              <label style={{
                display: 'block',
                fontSize: '14px',
                fontWeight: '600',
                color: 'rgb(191, 219, 254)',
                marginBottom: '12px',
              }}>
                📊 Select Quality
              </label>
              <select
                value={selectedFormat}
                onChange={(e) => setSelectedFormat(e.target.value)}
                disabled={loading || analyzing}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  backgroundColor: 'rgb(30, 41, 59)',
                  border: '1px solid rgba(59, 130, 246, 0.3)',
                  borderRadius: '8px',
                  color: 'white',
                  fontSize: '16px',
                  boxSizing: 'border-box',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  opacity: loading ? 0.6 : 1,
                }}
              >
                {formats.map((fmt) => (
                  <option key={fmt.format_id} value={fmt.format_id}>
                    {fmt.quality} {fmt.badge ? `[${fmt.badge}]` : ''} • {fmt.ext.toUpperCase()}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Analyzing Indicator */}
          {analyzing && (
            <div style={{
              marginBottom: '24px',
              padding: '12px 16px',
              backgroundColor: 'rgba(34, 211, 238, 0.1)',
              border: '1px solid rgb(34, 211, 238)',
              borderRadius: '8px',
              color: 'rgb(34, 211, 238)',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              fontSize: '14px',
            }}>
              <span>🔍 Analyzing formats...</span>
            </div>
          )}

          {/* Progress Bar */}
          {progress > 0 && (
            <div style={{ marginBottom: '24px' }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginBottom: '8px',
                fontSize: '12px',
                color: 'rgb(191, 219, 254)',
              }}>
                <span>📥 Downloading: {Math.round(progress)}%</span>
                <span>{progressSpeed} • ETA: {progressEta}</span>
              </div>
              <div style={{
                width: '100%',
                height: '8px',
                backgroundColor: 'rgb(30, 41, 59)',
                borderRadius: '4px',
                overflow: 'hidden',
                border: '1px solid rgba(59, 130, 246, 0.3)',
              }}>
                <div style={{
                  height: '100%',
                  width: `${progress}%`,
                  background: 'linear-gradient(to right, rgb(34, 211, 238), rgb(37, 99, 235))',
                  transition: 'width 0.3s ease',
                }} />
              </div>
            </div>
          )}

          {/* Advanced Settings */}
          <div style={{ marginBottom: '24px', padding: '16px', backgroundColor: 'rgba(59, 130, 246, 0.1)', borderRadius: '8px', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
            <p style={{ fontSize: '12px', fontWeight: '600', color: 'rgb(147, 197, 253)', margin: '0 0 12px 0' }}>
              ⚙️ Optimization Settings
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              {/* Speed Limit */}
              <div>
                <label style={{
                  display: 'block',
                  fontSize: '12px',
                  fontWeight: '600',
                  color: 'rgb(191, 219, 254)',
                  marginBottom: '6px',
                }}>
                  Max Speed (MB/s)
                </label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={maxSpeedMbps}
                  onChange={(e) => setMaxSpeedMbps(e.target.value)}
                  disabled={loading}
                  placeholder="0 (unlimited)"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    backgroundColor: 'rgb(30, 41, 59)',
                    border: '1px solid rgba(59, 130, 246, 0.3)',
                    borderRadius: '6px',
                    color: 'white',
                    fontSize: '14px',
                    boxSizing: 'border-box',
                    opacity: loading ? 0.6 : 1,
                  }}
                />
              </div>

              {/* Max Retries */}
              <div>
                <label style={{
                  display: 'block',
                  fontSize: '12px',
                  fontWeight: '600',
                  color: 'rgb(191, 219, 254)',
                  marginBottom: '6px',
                }}>
                  Max Retries
                </label>
                <input
                  type="number"
                  min="0"
                  max="10"
                  value={maxRetries}
                  onChange={(e) => setMaxRetries(e.target.value)}
                  disabled={loading}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    backgroundColor: 'rgb(30, 41, 59)',
                    border: '1px solid rgba(59, 130, 246, 0.3)',
                    borderRadius: '6px',
                    color: 'white',
                    fontSize: '14px',
                    boxSizing: 'border-box',
                    opacity: loading ? 0.6 : 1,
                  }}
                />
              </div>
            </div>
          </div>

          {/* Optimization Statistics */}
          {optimizationStats && !loading && (
            <div style={{ marginBottom: '24px', padding: '16px', backgroundColor: 'rgba(34, 211, 238, 0.1)', borderRadius: '8px', border: '1px solid rgba(34, 211, 238, 0.3)' }}>
              <p style={{ fontSize: '12px', fontWeight: '600', color: 'rgb(34, 211, 238)', margin: '0 0 12px 0' }}>
                📊 Optimization Results
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '12px', color: 'rgb(191, 219, 254)' }}>
                <div>Avg Speed: <strong>{optimizationStats.avg_speed_mbps.toFixed(2)} MB/s</strong></div>
                <div>Connections: <strong>{optimizationStats.final_connections}</strong></div>
                <div>Throttled: <strong>{optimizationStats.throttled ? '✅ Yes' : '⊘ No'}</strong></div>
                <div>Retries Used: <strong>{optimizationStats.retries_used}</strong></div>
              </div>
            </div>
          )}

          {downloadDetails && !loading && (
            <div style={{ marginBottom: '24px', padding: '16px', backgroundColor: 'rgba(16, 185, 129, 0.12)', borderRadius: '8px', border: '1px solid rgba(16, 185, 129, 0.35)' }}>
              <p style={{ fontSize: '12px', fontWeight: '600', color: 'rgb(110, 231, 183)', margin: '0 0 12px 0' }}>
                📁 Download Details
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '12px', color: 'rgb(191, 219, 254)', marginBottom: '12px' }}>
                <div>Title: <strong>{downloadDetails.title}</strong></div>
                <div>Size: <strong>{formatBytes(downloadDetails.filesize)}</strong></div>
                <div>Format: <strong>{downloadDetails.format.toUpperCase()}</strong></div>
                <div>Path: <strong>{downloadDetails.filepath}</strong></div>
              </div>
              <button
                onClick={handleOpenDownloadFolder}
                disabled={openingFolder}
                style={{
                  padding: '10px 14px',
                  borderRadius: '8px',
                  border: '1px solid rgba(16, 185, 129, 0.45)',
                  background: openingFolder ? 'rgb(55, 65, 81)' : 'linear-gradient(to right, rgb(16, 185, 129), rgb(5, 150, 105))',
                  color: 'white',
                  fontWeight: 600,
                  cursor: openingFolder ? 'not-allowed' : 'pointer',
                  opacity: openingFolder ? 0.8 : 1,
                }}
              >
                {openingFolder ? '⏳ Opening Folder...' : '📂 Open Download Folder'}
              </button>
            </div>
          )}

          {/* Download Button */}
          <button
            onClick={handleDownload}
            disabled={loading || !url || formats.length === 0 || analyzing}
            style={{
              width: '100%',
              padding: '12px',
              borderRadius: '8px',
              fontWeight: 'bold',
              fontSize: '16px',
              border: 'none',
              cursor: loading || !url || formats.length === 0 || analyzing ? 'not-allowed' : 'pointer',
              background: loading || !url || formats.length === 0 || analyzing
                ? 'rgb(55, 65, 81)'
                : 'linear-gradient(to right, rgb(34, 211, 238), rgb(37, 99, 235))',
              color: 'white',
              transition: 'all 0.2s',
              opacity: loading || !url || formats.length === 0 || analyzing ? 0.7 : 1,
            }}
          >
            {loading ? `⏳ ${Math.round(progress)}% Downloading...` : '⬇️ Download Now'}
          </button>

          {/* Messages */}
          {warning && (
            <div style={{
              marginTop: '16px',
              padding: '16px',
              backgroundColor: 'rgba(217, 119, 6, 0.2)',
              border: '1px solid rgba(217, 119, 6, 0.5)',
              borderRadius: '8px',
              color: 'rgb(253, 224, 71)',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
            }}>
              <span>⚠️</span>
              <span>{warning}</span>
            </div>
          )}

          {error && (
            <div style={{
              marginTop: '16px',
              padding: '16px',
              backgroundColor: 'rgba(127, 29, 29, 0.2)',
              border: '1px solid rgba(127, 29, 29, 0.5)',
              borderRadius: '8px',
              color: 'rgb(254, 202, 202)',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
            }}>
              <span>❌</span>
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div style={{
              marginTop: '16px',
              padding: '16px',
              backgroundColor: 'rgba(34, 197, 94, 0.2)',
              border: '1px solid rgba(34, 197, 94, 0.5)',
              borderRadius: '8px',
              color: 'rgb(187, 247, 208)',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
            }}>
              <span>✅</span>
              <span>{success}</span>
            </div>
          )}
        </div>

        {/* Features Grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
          gap: '24px',
          marginBottom: '2rem',
        }}>
          {[
            { icon: '⚡', title: 'Lightning Fast', desc: 'Download at maximum speed' },
            { icon: '🔒', title: 'Secure & Private', desc: '256-bit encryption always' },
            { icon: '✨', title: 'HD/4K Support', desc: 'Up to 8K resolution available' },
          ].map(({ icon, title, desc }) => (
            <div
              key={title}
              style={{
                backgroundColor: 'rgba(15, 23, 42, 0.5)',
                backdropFilter: 'blur(16px)',
                border: '1px solid rgba(59, 130, 246, 0.3)',
                borderRadius: '12px',
                padding: '24px',
                transition: 'all 0.2s',
              }}
            >
              <div style={{ fontSize: '32px', marginBottom: '16px' }}>{icon}</div>
              <h3 style={{ fontWeight: 'bold', color: 'white', marginBottom: '8px', fontSize: '18px' }}>
                {title}
              </h3>
              <p style={{ fontSize: '14px', color: 'rgb(147, 197, 253)' }}>{desc}</p>
            </div>
          ))}
        </div>

        {/* GitHub Star CTA */}
        <div style={{
          backgroundColor: 'rgba(15, 23, 42, 0.5)',
          backdropFilter: 'blur(16px)',
          border: '1px solid rgba(250, 204, 21, 0.4)',
          borderRadius: '12px',
          padding: '20px',
          marginBottom: '2rem',
          textAlign: 'center',
        }}>
          <p style={{ margin: '0 0 14px 0', color: 'rgb(254, 240, 138)', fontWeight: 700 }}>
            ⭐ Enjoying this project? Send a star and contribute
          </p>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <a
              href={repoStarsUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                padding: '10px 14px',
                borderRadius: '8px',
                background: 'linear-gradient(to right, rgb(250, 204, 21), rgb(234, 179, 8))',
                color: 'rgb(15, 23, 42)',
                fontWeight: 700,
                textDecoration: 'none',
              }}
            >
              {hasPublicRepoUrl ? '⭐ Star This Repo' : '⭐ Find & Star Repo'}
            </a>
            <a
              href={creatorUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                padding: '10px 14px',
                borderRadius: '8px',
                border: '1px solid rgba(250, 204, 21, 0.55)',
                color: 'rgb(254, 240, 138)',
                fontWeight: 700,
                textDecoration: 'none',
              }}
            >
              👤 @umerslone Profile
            </a>
            <a
              href={repoContributeUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                padding: '10px 14px',
                borderRadius: '8px',
                border: '1px solid rgba(56, 189, 248, 0.55)',
                color: 'rgb(125, 211, 252)',
                fontWeight: 700,
                textDecoration: 'none',
              }}
            >
              {hasPublicRepoUrl ? '🛠️ Contributing Guide' : '🗂️ Browse Repositories'}
            </a>
          </div>
          {!hasPublicRepoUrl && (
            <p style={{ margin: '12px 0 0 0', color: 'rgb(191, 219, 254)', fontSize: '12px' }}>
              Tip: set NEXT_PUBLIC_REPO_URL in pwa-frontend/.env.local after publishing your repo.
            </p>
          )}
        </div>

        {/* Footer */}
        <div style={{ textAlign: 'center', color: 'rgb(147, 197, 253)', fontSize: '14px' }}>
          <p style={{ margin: '0 0 8px 0' }}>Made with ❤️ by <span style={{ color: 'rgb(34, 211, 238)', fontWeight: 'bold' }}>TechPigeon</span></p>
          <p style={{ margin: 0, color: 'rgb(96, 165, 250)' }}>Enterprise-grade video & audio processing platform</p>
        </div>
      </main>
    </div>
  );
}
