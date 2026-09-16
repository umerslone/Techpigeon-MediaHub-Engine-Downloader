export default function Home() {
  return (
    <main style={{ padding: '40px', maxWidth: '1200px', margin: '0 auto' }}>
      <h1>MediaHub - Video Downloader</h1>
      <p>Welcome to MediaHub PWA</p>
      
      <section style={{ marginTop: '30px', padding: '20px', backgroundColor: '#f5f5f5', borderRadius: '8px' }}>
        <h2>Features</h2>
        <ul>
          <li>Download videos from multiple platforms</li>
          <li>Process with FFmpeg</li>
          <li>Built with Next.js and React</li>
          <li>Progressive Web App (PWA)</li>
        </ul>
      </section>

      <section style={{ marginTop: '30px' }}>
        <h2>Status</h2>
        <p style={{ color: '#666' }}>Backend API: {process.env.NEXT_PUBLIC_API_URL || 'Not configured'}</p>
      </section>
    </main>
  );
}
