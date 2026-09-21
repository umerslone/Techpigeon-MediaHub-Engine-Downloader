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
}

export default function Home() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [activeTab, setActiveTab] = useState<'video' | 'audio'>('video');
  const [formats, setFormats] = useState<Format[]>([]);
  const [selectedFormat, setSelectedFormat] = useState<string>('');
  const [progress, setProgress] = useState(0);
  const [progressStatus, setProgressStatus] = useState('');
  const [progressSpeed, setProgressSpeed] = useState('0B/s');
  const [progressEta, setProgressEta] = useState('--:--');
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

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
    setProgress(0);
    setProgressStatus('starting');
    setLoading(true);

    // Start listening to progress updates
    const progressListener = async () => {
      try {
        const response = await fetch(`${apiUrl}/api/download-progress`);
        if (!response.body) return;

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
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
                  setProgressStatus('finished');
                  break;
                }
                setProgress(data.progress || 0);
                setProgressStatus(data.status || '');
                setProgressSpeed(data.speed || '0B/s');
                setProgressEta(data.eta || '--:--');
              } catch (e) {
                console.error('Failed to parse SSE data:', e);
              }
            }
          }
        }
      } catch (err) {
        console.error('Progress listener error:', err);
      }
    };

    progressListener();

    try {
      const response = await fetch(`${apiUrl}/api/download`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url,
          format: activeTab,
          format_id: selectedFormat,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Download failed');
      }

      const result = await response.json();
      setSuccess(`✅ ${result.message}`);
      setProgress(100);
      setUrl('');
      setFormats([]);
    } catch (err) {
      setError('❌ ' + (err instanceof Error ? err.message : 'Download failed'));
      setProgress(0);
    } finally {
      setLoading(false);
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

        {/* Footer */}
        <div style={{ textAlign: 'center', color: 'rgb(147, 197, 253)', fontSize: '14px' }}>
          <p style={{ margin: '0 0 8px 0' }}>Made with ❤️ by <span style={{ color: 'rgb(34, 211, 238)', fontWeight: 'bold' }}>TechPigeon</span></p>
          <p style={{ margin: 0, color: 'rgb(96, 165, 250)' }}>Enterprise-grade video & audio processing platform</p>
        </div>
      </main>
    </div>
  );
}
