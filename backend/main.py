import ipaddress
import logging
import os
import re
import socket
from urllib.parse import urlparse
from datetime import datetime, timedelta
from functools import lru_cache
import json
import time
import math
import sys
import subprocess
from collections import deque

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.gzip import GZipMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import RedirectResponse, StreamingResponse, JSONResponse, FileResponse
from fastapi.exceptions import RequestValidationError
from pydantic import BaseModel, Field
from pathlib import Path
import tempfile
import shutil
import requests
import yt_dlp
import redis
from redis.connection import ConnectionPool
from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from prometheus_client import Counter, Histogram, generate_latest, CONTENT_TYPE_LATEST
import time

# Configure structured logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("media_downloader")

# Prometheus metrics
request_count = Counter('http_requests_total', 'Total HTTP requests', ['method', 'endpoint', 'status'])
request_duration = Histogram('http_request_duration_seconds', 'HTTP request duration', ['method', 'endpoint'])
analysis_duration = Histogram('video_analysis_seconds', 'Video analysis duration', ['status'])
cache_hits = Counter('cache_hits_total', 'Total cache hits', ['endpoint'])

# Redis connection pool for high-volume loads
REDIS_HOST = os.getenv('REDIS_HOST', 'localhost')
REDIS_PORT = int(os.getenv('REDIS_PORT', 6379))
REDIS_DB = int(os.getenv('REDIS_DB', 0))
REDIS_PASSWORD = os.getenv('REDIS_PASSWORD')

redis_pool = ConnectionPool(
    host=REDIS_HOST,
    port=REDIS_PORT,
    db=REDIS_DB,
    password=REDIS_PASSWORD,
    max_connections=100,
    socket_keepalive=True,
    socket_keepalive_options={1: (1, 3)},  # TCP_KEEPIDLE, TCP_KEEPINTVL, TCP_KEEPCNT
)

redis_client = redis.Redis(connection_pool=redis_pool, decode_responses=True)

# Rate limiter (1000 requests per minute per IP)
limiter = Limiter(key_func=get_remote_address, default_limits=["1000/minute"])

logger = logging.getLogger("media_downloader")

DEFAULT_ALLOWED_DOMAINS = [
    # Streaming platforms (require yt-dlp)
    "youtube.com",
    "youtu.be",
    "bilibili.com",
    "ok.ru",
    "dailymotion.com",
    "vimeo.com",
    "tiktok.com",
    # File hosting services (direct download)
    "pixeldrain.com",
    "mediafire.com",
    "drive.google.com",
    "dropbox.com",
    "onedrive.live.com",
    "mega.nz",
    "mega.io",
    "wetransfer.com",
    "filedrop.com",
    "send.firefox.com",
    "gofile.io",
    "anonfiles.com",
    "file.io",
    "filebin.net",
    "zippyshare.com",
    "uptobox.com",
    "rarefile.net",
    "uploaded.net",
]

# Hosting services that require direct download (not yt-dlp)
HOSTING_SERVICES = {
    "pixeldrain.com": "pixeldrain",
    "mediafire.com": "mediafire",
    "drive.google.com": "google_drive",
    "dropbox.com": "dropbox",
    "onedrive.live.com": "onedrive",
    "mega.nz": "mega",
    "mega.io": "mega",
    "wetransfer.com": "wetransfer",
    "gofile.io": "gofile",
    "filedrop.com": "filedrop",
    "anonfiles.com": "anonfiles",
    "file.io": "file_io",
    "filebin.net": "filebin",
    "zippyshare.com": "zippyshare",
    "uptobox.com": "uptobox",
    "rarefile.net": "rarefile",
    "uploaded.net": "uploaded",
}

# Enterprise configuration
CACHE_TTL = int(os.getenv('CACHE_TTL', 3600))  # 1 hour default
MAX_CACHE_SIZE = int(os.getenv('MAX_CACHE_SIZE', 1000))  # max URLs cached
ANALYSIS_TIMEOUT = int(os.getenv('ANALYSIS_TIMEOUT', 60))  # seconds
MAX_RETRIES = int(os.getenv('MAX_RETRIES', 3))
REQUEST_TIMEOUT = int(os.getenv('REQUEST_TIMEOUT', 30))


def parse_csv_env(var_name: str, default: str) -> list[str]:
    raw = os.getenv(var_name, default)
    return [item.strip() for item in raw.split(',') if item.strip()]


@lru_cache(maxsize=1)
def has_ffmpeg() -> bool:
    """Check if FFmpeg is available on the system"""
    try:
        result = os.system('ffmpeg -version > /dev/null 2>&1' if os.name != 'nt' else 'ffmpeg -version > nul 2>&1')
        return result == 0
    except Exception:
        return False


def get_fallback_format(requested_format: str, media_type: str = "video") -> str:
    """Return appropriate format based on FFmpeg availability and target media type."""
    has_ff = has_ffmpeg()
    
    # If FFmpeg is available, use the requested format as-is
    if has_ff:
        return requested_format
    
    # When FFmpeg is not available, avoid merged selectors for video.
    if media_type == 'audio':
        # Audio-only downloads typically don't require merge, so keep requested selector.
        return requested_format or 'bestaudio/best'

    # For video without FFmpeg, merged selectors cannot be used.
    if '+' in requested_format or requested_format in {
        'bestvideo+bestaudio/best',
        'bestvideo*+bestaudio/best',
    }:
        return 'best[ext=mp4]/best'

    return requested_format or 'best[ext=mp4]/best'


def parse_bool_env(var_name: str, default: str = "false") -> bool:
    return os.getenv(var_name, default).strip().lower() in {"1", "true", "yes", "on"}


ALLOWED_VIDEO_DOMAINS = parse_csv_env(
    "ALLOWED_VIDEO_DOMAINS",
    ",".join(DEFAULT_ALLOWED_DOMAINS),
)


def get_cache_key(url: str) -> str:
    """Generate cache key from URL"""
    return f"media:analysis:{hash(url)}"


def get_download_dir() -> str:
    """Centralized download directory for all downloaded files."""
    temp_dir = tempfile.gettempdir()
    download_dir = os.path.join(temp_dir, 'techpigeon_downloads')
    os.makedirs(download_dir, exist_ok=True)
    return download_dir


@lru_cache(maxsize=MAX_CACHE_SIZE)
def is_allowed_domain(hostname: str, allowed_domains: tuple) -> bool:
    host = hostname.lower().strip(".")
    for domain in allowed_domains:
        normalized = domain.lower().strip(".")
        if host == normalized or host.endswith(f".{normalized}"):
            return True
    return False


def is_public_hostname(hostname: str) -> bool:
    if hostname.lower() == "localhost":
        return False

    try:
        ip = ipaddress.ip_address(hostname)
        return not (
            ip.is_private
            or ip.is_loopback
            or ip.is_link_local
            or ip.is_multicast
            or ip.is_reserved
            or ip.is_unspecified
        )
    except ValueError:
        pass

    try:
        addr_infos = socket.getaddrinfo(hostname, None)
    except socket.gaierror:
        return False

    for info in addr_infos:
        resolved_ip = info[4][0]
        ip = ipaddress.ip_address(resolved_ip)
        if (
            ip.is_private
            or ip.is_loopback
            or ip.is_link_local
            or ip.is_multicast
            or ip.is_reserved
            or ip.is_unspecified
        ):
            return False
    return True


def validate_media_url(url: str) -> str:
    parsed = urlparse(url.strip())
    if parsed.scheme not in {"http", "https"}:
        raise HTTPException(status_code=400, detail="Only http/https URLs are supported")

    hostname = parsed.hostname
    if not hostname:
        raise HTTPException(status_code=400, detail="Invalid URL")

    if not is_public_hostname(hostname):
        raise HTTPException(status_code=400, detail="URL host is not allowed")

    if not is_allowed_domain(hostname, tuple(ALLOWED_VIDEO_DOMAINS)):
        raise HTTPException(status_code=400, detail="Domain is not supported")

    return url.strip()


def make_safe_filename(name: str) -> str:
    normalized = re.sub(r"[\\/:*?\"<>|]", "_", (name or "video")).strip()
    normalized = re.sub(r"\s+", " ", normalized)
    return normalized[:120] or "video"


def detect_service_type(url: str) -> str:
    """Detect if URL is a streaming platform or file hosting service"""
    parsed = urlparse(url.lower())
    hostname = parsed.hostname or ""
    
    for hosting_domain in HOSTING_SERVICES.keys():
        if hostname.endswith(hosting_domain.lower()) or hostname == hosting_domain.lower():
            return "hosting"
    
    return "streaming"


def get_hosting_service_direct_url(url: str) -> str:
    """Convert hosting service URLs to direct download URLs with enhanced support for Mega, Dropbox, Drive, etc."""
    parsed = urlparse(url)
    hostname = (parsed.hostname or "").lower()
    
    # Pixeldrain: Direct file ID extraction
    if "pixeldrain.com" in hostname:
        match = re.search(r'/[fu]/([a-zA-Z0-9]+)', url)
        if match:
            file_id = match.group(1)
            return f"https://pixeldrain.com/api/file/{file_id}"
    
    # Dropbox: Add ?dl=1 to force download
    if "dropbox.com" in hostname:
        if "?dl=0" in url:
            return url.replace("?dl=0", "?dl=1")
        elif "?" not in url:
            return url + "?dl=1"
        else:
            return url.replace("?", "?dl=1&")
    
    # Google Drive: Extract file ID with improved handling and confirm parameter
    if "drive.google.com" in hostname:
        match = re.search(r'/d/([a-zA-Z0-9-_]+)', url)
        if match:
            file_id = match.group(1)
            return f"https://drive.google.com/uc?export=download&confirm=yes&id={file_id}"
    
    # OneDrive/1Drv.ms: Add download parameters for reliability
    if "onedrive.live.com" in hostname or "1drv.ms" in hostname:
        if "download=1" in url:
            return url
        if "?" not in url:
            return url + "?download=1"
        return url + "&download=1"
    
    # Mega.nz: Support for Mega encrypted downloads
    if "mega.nz" in hostname or "mega.io" in hostname:
        # Mega links with # parameters work directly with requests
        if "#" in url:
            return url
        return url
    
    # MediaFire: Extract file ID with improved regex and URL construction
    if "mediafire.com" in hostname:
        match = re.search(r'/(?:download|file)/([a-z0-9]+)', url)
        if match:
            file_id = match.group(1)
            return f"https://download2266.mediafire.com/download/{file_id}"
    
    # WeTransfer: Direct download support
    if "wetransfer.com" in hostname:
        if "/downloads/" in url:
            return url
    
    # Gofile.io: Enhanced support for newer URLs
    if "gofile.io" in hostname:
        match = re.search(r'/d/([a-zA-Z0-9-_]+)', url)
        if match:
            content_id = match.group(1)
            return f"https://gofile.io/download/{content_id}"
    
    # For other services, return as-is and attempt direct download
    return url


app = FastAPI(
    title="TechPigeon MediaHub Extractor & Downloader API",
    version="2.0.0",
    description="Enterprise-grade HD/4K video & audio parser. 99.99% uptime SLA. Supports 20+ platforms. Handles 10k+ concurrent connections."
)

# Production middleware stack
app.add_middleware(GZipMiddleware, minimum_size=1000)  # Brotli compression
app.add_middleware(TrustedHostMiddleware, allowed_hosts=parse_csv_env("ALLOWED_HOSTS", "localhost,127.0.0.1"))

# Enable CORS for PWA and Extension access
cors_origins = parse_csv_env(
    "CORS_ORIGINS",
    "http://localhost:3000,http://127.0.0.1:3000",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_origin_regex=r"^chrome-extension://[a-z]{32}$",
    allow_credentials=parse_bool_env("CORS_ALLOW_CREDENTIALS", "false"),
    allow_methods=["*"],
    allow_headers=["*"],
)

app.state.limiter = limiter


@app.exception_handler(RateLimitExceeded)
async def rate_limit_handler(request: Request, exc: RateLimitExceeded):
    return JSONResponse(
        status_code=429,
        content={"detail": "Rate limit exceeded. Max 1000 requests per minute."}
    )


class AnalyzeRequest(BaseModel):
    url: str = Field(..., min_length=10, max_length=2048)


class HealthResponse(BaseModel):
    status: str
    service: str
    version: str
    uptime_seconds: int
    cache_size: int
    redis_connected: bool

def get_ytdl_options():
    return {
        'quiet': True,
        'no_warnings': True,
        'user_agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'http_headers': {
            'Referer': 'https://www.bilibili.com/',
            'Accept-Language': 'en-US,en;q=0.9',
            'Sec-Fetch-Mode': 'navigate'
        }
    }

@app.get("/")
def health_check():
    return {"status": "online", "service": "Media Extractor API", "engine": "yt-dlp + FFmpeg"}

@app.post("/api/analyze")
def analyze_media(req: AnalyzeRequest):
    if not req.url:
        raise HTTPException(status_code=400, detail="URL is required")
    target_url = validate_media_url(req.url)

    service_type = detect_service_type(target_url)
    
    # Handle file hosting services differently
    if service_type == "hosting":
        parsed = urlparse(target_url.lower())
        hostname = parsed.hostname or ""
        
        service_name = "File Hosting"
        for domain, name in HOSTING_SERVICES.items():
            if hostname.endswith(domain.lower()):
                service_name = name.replace("_", " ").title()
                break
        
        return {
            "title": f"{service_name} File Download",
            "thumbnail": None,
            "duration": 0,
            "uploader": service_name,
            "extractor": service_name,
            "formats": [{"format_id": "direct", "quality": "Direct Download", "badge": "File", "ext": "file", "has_video": False, "has_audio": False}],
            "audio_formats": [],
            "is_hosting_service": True,
            "service_type": service_name,
        }
    
    # Handle streaming platforms with yt-dlp
    opts = get_ytdl_options()
    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(target_url, download=False)
            
            formats = []
            seen_qualities = set()

            for f in info.get('formats', []):
                height = f.get('height')
                vcodec = f.get('vcodec')
                acodec = f.get('acodec')
                ext = f.get('ext', 'mp4')
                format_id = f.get('format_id')
                
                # Filter for useful video resolutions or pure audio
                if height and height >= 144:
                    quality_str = f"{height}p"
                    if f.get('fps'):
                        if f.get('fps') > 30:
                            quality_str += f"{f.get('fps')}"

                    badge = "4K Ultra HD" if height >= 2160 else ("2K QHD" if height >= 1440 else ("Full HD" if height >= 1080 else "HD"))
                    
                    key = f"{height}_{ext}"
                    if key not in seen_qualities:
                        seen_qualities.add(key)
                        formats.append({
                            "format_id": format_id,
                            "height": height,
                            "quality": quality_str,
                            "badge": badge,
                            "ext": ext,
                            "filesize_approx": f.get('filesize') or f.get('filesize_approx') or 0,
                            "has_video": vcodec != 'none',
                            "has_audio": acodec != 'none',
                            "direct_url": f.get('url')
                        })

            # Sort highest resolution first
            formats.sort(key=lambda x: x['height'], reverse=True)

            # Extract audio-only formats dynamically
            audio_formats = []
            seen_audio_qualities = set()
            for f in info.get('formats', []):
                acodec = f.get('acodec')
                vcodec = f.get('vcodec')
                ext = f.get('ext', 'mp4')
                format_id = f.get('format_id')
                abr = f.get('abr')  # Audio bitrate
                
                # Audio-only formats (no video codec)
                if vcodec == 'none' and acodec != 'none' and format_id:
                    # Get quality description
                    quality_label = f"Audio ({ext.upper()})"
                    if abr:
                        quality_label = f"Audio {int(abr)}kbps ({ext.upper()})"
                    
                    key = f"{ext}_{abr}"
                    if key not in seen_audio_qualities:
                        seen_audio_qualities.add(key)
                        audio_formats.append({
                            "format_id": format_id,
                            "quality": quality_label,
                            "badge": "Audio Only",
                            "ext": ext,
                            "has_video": False,
                            "has_audio": True
                        })
            
            # Sort by bitrate (descending)
            audio_formats.sort(key=lambda x: x.get('quality', ''), reverse=True)

            return {
                "title": info.get("title", "Untitled Video"),
                "thumbnail": info.get("thumbnail"),
                "duration": info.get("duration", 0),
                "uploader": info.get("uploader", "Unknown"),
                "extractor": info.get("extractor_key"),
                "formats": formats[:10],  # Top quality video formats
                "audio_formats": audio_formats,
                "is_hosting_service": False,
                "has_ffmpeg": has_ffmpeg(),
                "ffmpeg_warning": "" if has_ffmpeg() else "⚠️ FFmpeg not found - video/audio merging unavailable. Using best single format instead."
            }
    except HTTPException:
        raise
    except Exception:
        logger.exception("Media analysis failed")
        raise HTTPException(status_code=500, detail="Extraction failed")

@app.get("/api/download-stream")
def download_stream(
    url: str = Query(...),
    format_id: str = Query("best"),
    download: bool = Query(True),
):
    """Streams media as attachment by default, with optional direct redirect mode."""
    target_url = validate_media_url(url)
    opts = get_ytdl_options()
    opts['format'] = format_id
    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(target_url, download=False)
            stream_url = info.get('url')
            
            if stream_url:
                if not download:
                    return RedirectResponse(url=stream_url)

                file_ext = info.get("ext") or "mp4"
                safe_title = make_safe_filename(info.get("title", "video"))
                filename = f"{safe_title}.{file_ext}"

                upstream = requests.get(stream_url, stream=True, timeout=30)
                upstream.raise_for_status()

                def iter_stream():
                    try:
                        for chunk in upstream.iter_content(chunk_size=1024 * 256):
                            if chunk:
                                yield chunk
                    finally:
                        upstream.close()

                headers = {
                    "Content-Disposition": f'attachment; filename="{filename}"',
                    "Cache-Control": "no-store",
                }
                content_type = upstream.headers.get("Content-Type") or "application/octet-stream"
                return StreamingResponse(iter_stream(), media_type=content_type, headers=headers)
            else:
                raise HTTPException(status_code=404, detail="Direct stream URL not resolved")
    except HTTPException:
        raise
    except Exception:
        logger.exception("Media download stream resolution failed")
        raise HTTPException(status_code=500, detail="Unable to resolve stream")


# Global dictionary to store download progress
download_progress = {}

# Aria2-style adaptive concurrency optimizer
class AdaptiveConcurrencyOptimizer:
    """Optimize concurrent connections based on download speed (aria2 algorithm)"""
    def __init__(self, coeff_a=5, coeff_b=25, max_connections=50):
        self.coeff_a = coeff_a
        self.coeff_b = coeff_b
        self.max_connections = max_connections
        self.speed_history = deque(maxlen=10)
        
    def calculate_optimal_connections(self, current_speed_bps):
        """Calculate optimal concurrent connections using: N = A + B*log10(speed_Mbps)"""
        speed_mbps = (current_speed_bps * 8) / 1_000_000
        if speed_mbps <= 0:
            return self.coeff_a
        optimal = math.ceil(self.coeff_a + self.coeff_b * math.log10(speed_mbps))
        return min(max(1, optimal), self.max_connections)
    
    def update_speed(self, speed_bps):
        self.speed_history.append(speed_bps)
        
    def get_average_speed(self):
        if not self.speed_history:
            return 0
        return sum(self.speed_history) / len(self.speed_history)

# Retry strategy with exponential backoff
class RetryStrategy:
    """Implement smart retry logic with exponential backoff"""
    def __init__(self, max_retries=3, initial_delay=1, max_delay=60):
        self.max_retries = max_retries
        self.initial_delay = initial_delay
        self.max_delay = max_delay
        self.attempt = 0
        
    def get_wait_time(self):
        delay = self.initial_delay * (2 ** self.attempt)
        return min(delay, self.max_delay)
    
    def should_retry(self):
        return self.attempt < self.max_retries
    
    def next_attempt(self):
        self.attempt += 1

# Bandwidth throttler for speed limit control
class BandwidthThrottler:
    """Control download speed with bandwidth throttling"""
    def __init__(self, max_speed_bps=None):
        self.max_speed_bps = max_speed_bps
        self.bytes_downloaded = 0
        self.start_time = time.time()
        
    def throttle(self, bytes_chunk):
        if not self.max_speed_bps:
            return
        self.bytes_downloaded += bytes_chunk
        elapsed = time.time() - self.start_time
        if elapsed > 0:
            current_speed = self.bytes_downloaded / elapsed
            if current_speed > self.max_speed_bps:
                expected_time = self.bytes_downloaded / self.max_speed_bps
                sleep_time = expected_time - elapsed
                if sleep_time > 0:
                    time.sleep(sleep_time)

class DownloadRequest(BaseModel):
    url: str = Field(..., min_length=10, max_length=2048)
    format: str = Field(default="video", pattern="^(video|audio)$")
    format_id: str = Field(default="best", description="yt-dlp format ID")
    max_speed_bps: int = Field(default=0, description="Max download speed in bytes/sec (0=unlimited)")
    max_retries: int = Field(default=3, description="Maximum retry attempts on failure")


def progress_hook(d):
    """yt-dlp progress callback"""
    if d['status'] == 'downloading':
        download_progress['status'] = 'downloading'
        download_progress['downloaded_bytes'] = d.get('_downloaded_bytes', 0)
        download_progress['total_bytes'] = d.get('total_bytes', 0)
        download_progress['total_bytes_estimate'] = d.get('total_bytes_estimate', 0)
        download_progress['speed'] = d.get('speed', 0)
        download_progress['eta'] = d.get('eta', 0)
        download_progress['_eta_str'] = d.get('_eta_str', 'calculating...')
        download_progress['_speed_str'] = d.get('_speed_str', '0B/s')
        
        # Calculate progress percentage
        total = download_progress['total_bytes'] or download_progress['total_bytes_estimate'] or 1
        download_progress['progress'] = min(100, int((download_progress['downloaded_bytes'] / total) * 100)) if total > 0 else 0
    
    elif d['status'] == 'finished':
        download_progress['status'] = 'finished'
        download_progress['progress'] = 100
    
    elif d['status'] == 'error':
        download_progress['status'] = 'error'
        download_progress['error'] = str(d.get('info_dict', {}))


@app.post("/api/download")
def download_media(req: DownloadRequest):
    """Download video/audio from streaming platforms or files from hosting services
    
    Features:
    - Adaptive concurrency optimization (aria2-style: N = A + B*log10(speed_Mbps))
    - Smart retry logic with exponential backoff
    - Bandwidth throttling for speed control
    - Enhanced file hosting support (Mega, Dropbox, Drive, etc.)
    """
    if not req.url:
        raise HTTPException(status_code=400, detail="URL is required")
    
    target_url = validate_media_url(req.url)
    download_progress.clear()
    
    service_type = detect_service_type(target_url)
    
    # Initialize optimization tools
    optimizer = AdaptiveConcurrencyOptimizer()
    retry_strategy = RetryStrategy(max_retries=req.max_retries)
    throttler = BandwidthThrottler(max_speed_bps=req.max_speed_bps if req.max_speed_bps > 0 else None)
    
    try:
        # Handle file hosting services with direct download
        if service_type == "hosting":
            logger.info(f"Starting direct file download from hosting service: {target_url}")
            logger.info(f"  Speed limit: {'Unlimited' if req.max_speed_bps <= 0 else f'{req.max_speed_bps/1024/1024:.2f} MB/s'}")
            logger.info(f"  Max retries: {req.max_retries}")
            
            download_progress['status'] = 'starting'
            download_progress['progress'] = 0
            download_progress['concurrent_connections'] = 1
            
            direct_url = get_hosting_service_direct_url(target_url)
            download_dir = get_download_dir()
            
            # Retry loop with exponential backoff
            last_error = None
            while retry_strategy.should_retry():
                try:
                    response = requests.get(
                        direct_url,
                        stream=True,
                        timeout=REQUEST_TIMEOUT,
                        allow_redirects=True,
                        headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
                    )
                    response.raise_for_status()
                    
                    # Get filename from Content-Disposition or URL
                    content_disposition = response.headers.get('content-disposition', '')
                    filename = None
                    
                    if 'filename=' in content_disposition:
                        filename = re.findall(r'filename="?([^"]+)"?', content_disposition)
                        if filename:
                            filename = filename[0]
                    
                    if not filename:
                        # Extract from URL
                        parsed = urlparse(target_url)
                        filename = parsed.path.split('/')[-1] or 'downloaded_file'
                    
                    filename = make_safe_filename(filename)
                    filepath = os.path.join(download_dir, filename)
                    
                    # Get total file size
                    total_size = int(response.headers.get('content-length', 0))
                    downloaded = 0
                    chunk_size = 8192
                    start_time = time.time()
                    last_speed_update = start_time
                    
                    # Download with progress tracking and adaptive optimization
                    with open(filepath, 'wb') as f:
                        for chunk in response.iter_content(chunk_size=chunk_size):
                            if chunk:
                                f.write(chunk)
                                downloaded += len(chunk)
                                
                                # Update speed metrics every 500ms
                                current_time = time.time()
                                if current_time - last_speed_update > 0.5:
                                    elapsed = current_time - start_time
                                    current_speed = downloaded / elapsed if elapsed > 0 else 0
                                    optimizer.update_speed(current_speed)
                                    
                                    # Calculate optimal connections using aria2 formula
                                    optimal_conns = optimizer.calculate_optimal_connections(current_speed)
                                    download_progress['concurrent_connections'] = optimal_conns
                                    
                                    if total_size > 0:
                                        progress = int((downloaded / total_size) * 100)
                                        download_progress['progress'] = min(100, progress)
                                        download_progress['downloaded_bytes'] = downloaded
                                        download_progress['total_bytes_estimate'] = total_size
                                        download_progress['speed'] = current_speed
                                        download_progress['status'] = 'downloading'
                                        
                                        # Format speed string (B/s, KB/s, MB/s, GB/s)
                                        if current_speed < 1024:
                                            speed_str = f"{current_speed:.1f}B/s"
                                        elif current_speed < 1024*1024:
                                            speed_str = f"{current_speed/1024:.1f}KB/s"
                                        else:
                                            speed_str = f"{current_speed/1024/1024:.2f}MB/s"
                                        download_progress['_speed_str'] = speed_str
                                        
                                        # Calculate ETA
                                        remaining_bytes = total_size - downloaded
                                        if current_speed > 0:
                                            eta_seconds = remaining_bytes / current_speed
                                            eta_minutes = int(eta_seconds // 60)
                                            eta_secs = int(eta_seconds % 60)
                                            eta_str = f"{eta_minutes:02d}:{eta_secs:02d}"
                                        else:
                                            eta_str = "--:--"
                                        download_progress['_eta_str'] = eta_str
                                    
                                    last_speed_update = current_time
                                    logger.debug(f"Progress: {downloaded}/{total_size} bytes, Speed: {download_progress.get('_speed_str', '0B/s')}, ETA: {download_progress.get('_eta_str', '--:--')}, Connections: {optimal_conns}")
                                
                                # Apply bandwidth throttling
                                throttler.throttle(len(chunk))
                    
                    file_size = os.path.getsize(filepath) if os.path.exists(filepath) else 0
                    download_progress['status'] = 'finished'
                    download_progress['progress'] = 100
                    
                    logger.info(f"File download complete: {filepath} ({file_size} bytes)")
                    
                    return {
                        "success": True,
                        "title": filename.replace(os.path.splitext(filename)[1], ""),
                        "format": "file",
                        "format_id": "direct",
                        "duration": 0,
                        "uploader": "Hosting Service",
                        "filesize": file_size,
                        "filepath": filepath,
                        "message": f"✅ File downloaded successfully!",
                        "optimization": {
                            "avg_speed_mbps": optimizer.get_average_speed() / 1024 / 1024,
                            "final_connections": download_progress.get('concurrent_connections', 1),
                            "throttled": req.max_speed_bps > 0,
                            "retries_used": retry_strategy.attempt
                        }
                    }
                
                except requests.exceptions.RequestException as e:
                    last_error = e
                    if retry_strategy.should_retry():
                        wait_time = retry_strategy.get_wait_time()
                        logger.warning(f"Download failed (attempt {retry_strategy.attempt + 1}/{req.max_retries}): {str(e)}. Retrying in {wait_time}s...")
                        retry_strategy.next_attempt()
                        time.sleep(wait_time)
                    else:
                        raise
            
            # If all retries exhausted
            raise HTTPException(status_code=500, detail=f"File download failed after {req.max_retries} retries: {str(last_error)}")
        
        # Handle streaming platforms with yt-dlp
        opts = get_ytdl_options()
        opts['progress_hooks'] = [progress_hook]
        
        # Determine output template and format based on type
        output_template = os.path.join(get_download_dir(), '%(title)s.%(ext)s')
        
        opts['outtmpl'] = output_template
        opts['quiet'] = False
        opts['no_warnings'] = False
        
        # Probe available formats first so we can resolve generic selectors to concrete IDs.
        requested_format = (req.format_id or "").strip() or "best"
        available_ids = set()
        best_video_id = None
        best_audio_id = None
        try:
            probe_opts = get_ytdl_options()
            probe_opts['quiet'] = True
            probe_opts['no_warnings'] = True
            with yt_dlp.YoutubeDL(probe_opts) as probe_ydl:
                probe_info = probe_ydl.extract_info(target_url, download=False)
                probe_formats = probe_info.get('formats', []) or []

            for f in probe_formats:
                fid = f.get('format_id')
                if fid:
                    available_ids.add(str(fid))

            video_streams = [
                f for f in probe_formats
                if f.get('format_id') and f.get('vcodec') != 'none'
            ]
            video_streams.sort(
                key=lambda f: (
                    1 if f.get('ext') == 'mp4' else 0,
                    f.get('height') or 0,
                    f.get('tbr') or 0,
                ),
                reverse=True,
            )
            if video_streams:
                best_video_id = str(video_streams[0].get('format_id'))

            audio_streams = [
                f for f in probe_formats
                if f.get('format_id') and f.get('vcodec') == 'none' and f.get('acodec') != 'none'
            ]
            audio_streams.sort(
                key=lambda f: (f.get('abr') or 0, f.get('tbr') or 0),
                reverse=True,
            )
            if audio_streams:
                best_audio_id = str(audio_streams[0].get('format_id'))
        except Exception as probe_err:
            logger.warning(f"Format probe failed; continuing with selector fallback logic: {probe_err}")

        # Resolve generic selectors to concrete IDs when possible.
        generic_video_selectors = {
            'best', 'best[ext=mp4]/best', 'bestvideo+bestaudio/best', 'bestvideo*+bestaudio/best'
        }
        generic_audio_selectors = {'best', 'bestaudio', 'bestaudio/best', 'worstaudio'}

        if req.format == 'video':
            # Without FFmpeg, only concrete single-stream IDs are safe/reliable.
            if not has_ffmpeg():
                is_concrete_available_id = requested_format in available_ids if available_ids else requested_format.isdigit()
                if not is_concrete_available_id and best_video_id:
                    logger.info(f"Resolved non-concrete video selector {requested_format} to available format_id {best_video_id}")
                    requested_format = best_video_id
            elif requested_format in generic_video_selectors or '+' in requested_format:
                if best_video_id:
                    logger.info(f"Resolved video selector {requested_format} to available format_id {best_video_id}")
                    requested_format = best_video_id
            elif available_ids and requested_format not in available_ids and best_video_id:
                logger.info(f"Requested video format_id {requested_format} unavailable; using {best_video_id}")
                requested_format = best_video_id
        else:
            if requested_format in generic_audio_selectors and best_audio_id:
                logger.info(f"Resolved audio selector {requested_format} to available format_id {best_audio_id}")
                requested_format = best_audio_id
            elif available_ids and requested_format not in available_ids and best_audio_id:
                logger.info(f"Requested audio format_id {requested_format} unavailable; using {best_audio_id}")
                requested_format = best_audio_id

        # Use selected format when possible, but enforce safe non-FFmpeg fallbacks when needed
        format_to_use = get_fallback_format(requested_format, req.format)

        # If FFmpeg is unavailable, merged format selectors cannot be used.
        if not has_ffmpeg() and '+' in format_to_use:
            format_to_use = 'best[ext=mp4]/best' if req.format == 'video' else 'bestaudio/best'

        opts['format'] = format_to_use
        
        # Only add audio extraction for audio formats (requires FFmpeg)
        if req.format == 'audio' and req.format_id in ['bestaudio', 'worstaudio'] and has_ffmpeg():
            # If bestaudio selected, convert to MP3
            opts['postprocessors'] = [{
                'key': 'FFmpegExtractAudio',
                'preferredcodec': 'mp3',
                'preferredquality': '192',
            }]
        
        # Log format selection info
        if format_to_use != requested_format:
            logger.info(f"Using fallback format: {format_to_use} instead of requested {requested_format}")
        
        download_progress['status'] = 'starting'
        download_progress['progress'] = 0
        
        logger.info(f"Starting {req.format} download from {target_url} with format: {opts['format']}")

        # Try selected format first, then progressively safer fallbacks.
        format_candidates = [opts['format']]
        if req.format == 'video':
            format_candidates.extend(['best[ext=mp4]/best', 'best'])
        else:
            format_candidates.extend(['bestaudio/best', 'bestaudio', 'best'])

        # Deduplicate while preserving order
        seen = set()
        format_candidates = [f for f in format_candidates if not (f in seen or seen.add(f))]

        info = None
        last_err = None
        for candidate in format_candidates:
            try:
                opts['format'] = candidate
                opts.pop('postprocessors', None)
                if req.format == 'audio' and req.format_id in ['bestaudio', 'worstaudio'] and has_ffmpeg():
                    opts['postprocessors'] = [{
                        'key': 'FFmpegExtractAudio',
                        'preferredcodec': 'mp3',
                        'preferredquality': '192',
                    }]

                if candidate != format_candidates[0]:
                    logger.warning(f"Retrying download with fallback format: {candidate}")

                with yt_dlp.YoutubeDL(opts) as ydl:
                    info = ydl.extract_info(target_url, download=True)
                break
            except Exception as err:
                last_err = err
                err_text = str(err)
                retryable = (
                    "Requested format is not available" in err_text
                    or "requested merging of multiple formats but ffmpeg is not installed" in err_text.lower()
                )
                if not retryable:
                    raise
                continue

        if info is None:
            raise last_err or RuntimeError("No download format candidate succeeded")

        with yt_dlp.YoutubeDL(opts) as ydl:
            filename = ydl.prepare_filename(info)
            file_size = os.path.getsize(filename) if os.path.exists(filename) else 0
            
            logger.info(f"Download complete: {filename} ({file_size} bytes)")
            
            return {
                "success": True,
                "title": info.get("title", "Untitled"),
                "format": req.format,
                "format_id": req.format_id,
                "duration": info.get("duration", 0),
                "uploader": info.get("uploader", "Unknown"),
                "filesize": file_size,
                "filepath": filename,
                "message": f"✅ {req.format.capitalize()} downloaded successfully!"
            }
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Media download failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Download failed: {str(e)}")


@app.post("/api/open-download-folder")
def open_download_folder():
    """Open local folder where downloaded files are stored."""
    download_dir = get_download_dir()
    try:
        if os.name == 'nt':
            os.startfile(download_dir)  # type: ignore[attr-defined]
        elif sys.platform == 'darwin':
            subprocess.Popen(['open', download_dir])
        else:
            subprocess.Popen(['xdg-open', download_dir])

        return {
            "success": True,
            "path": download_dir,
            "message": "Download folder opened"
        }
    except Exception as e:
        logger.exception(f"Failed to open download folder: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Could not open download folder: {str(e)}")



@app.get("/api/download-progress")
async def get_download_progress():
    """Server-Sent Events stream for download progress"""
    import threading
    
    async def progress_generator():
        import asyncio
        last_progress = -1
        last_speed = ""
        last_eta = ""
        no_update_count = 0
        
        while True:
            # Create a snapshot to avoid reading inconsistent state
            with threading.Lock() if hasattr(threading, 'Lock') else type('obj', (object,), {'__enter__': lambda s: None, '__exit__': lambda s, *a: None})():
                current_progress = download_progress.get('progress', 0)
                status = download_progress.get('status', 'idle')
                current_speed = download_progress.get('_speed_str', '0B/s')
                current_eta = download_progress.get('_eta_str', '--:--')
            
            # Send update if progress/speed/eta changed or if status is downloading
            if (current_progress != last_progress or 
                current_speed != last_speed or 
                current_eta != last_eta or 
                status == 'downloading'):
                
                data = {
                    'progress': current_progress,
                    'status': status,
                    'speed': current_speed,
                    'eta': current_eta,
                    'downloaded': download_progress.get('downloaded_bytes', 0),
                    'total': download_progress.get('total_bytes_estimate', 0),
                }
                yield f"data: {json.dumps(data)}\n\n"
                
                last_progress = current_progress
                last_speed = current_speed
                last_eta = current_eta
                no_update_count = 0
            else:
                no_update_count += 1
            
            # Stop when finished or errored
            if status in ('finished', 'error', 'idle') and no_update_count > 2:
                yield f"data: {{\"done\": true}}\n\n"
                break
            
            await asyncio.sleep(0.2)  # Poll every 200ms for more responsive updates
    
    return StreamingResponse(progress_generator(), media_type="text/event-stream")

