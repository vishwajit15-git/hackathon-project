# sources/youtube_source.py
# YouTube stream handler with auto-reconnect capability.
#
# Why streams die:
#   yt-dlp extracts a time-limited CDN URL from YouTube. This URL is valid
#   for a few hours at most. When it expires, cap.read() silently returns
#   ret=False — the same signal as "video ended". Without reconnect logic,
#   the system gives up and the user sees "stream ended" unexpectedly.
#
# The fix:
#   We wrap the VideoCapture in a class that tracks reconnect attempts.
#   When the caller signals a read failure, the class re-extracts a fresh
#   CDN URL from the same YouTube link and reopens the capture from there.
#   From main.py's perspective, it's still just calling cap.read() — the
#   reconnect complexity is fully hidden inside this class.

import cv2
import time
import yt_dlp

from config import YOUTUBE_MAX_RECONNECTS, YOUTUBE_RECONNECT_DELAY


def _extract_stream_url(youtube_url: str) -> tuple[str, str]:
    """
    Asks yt-dlp for the best available direct video CDN URL.
    Returns (stream_url, video_title).
    
    We prefer mp4 because OpenCV's FFmpeg backend handles it most reliably.
    If no mp4 stream is available, we fall back to whatever is best.
    """
    ydl_opts = {
        'format': 'best[ext=mp4]/best',
        'quiet': True,
        'no_warnings': True,
    }
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(youtube_url, download=False)
        return info['url'], info.get('title', 'Unknown Title')


class ResilientYouTubeCapture:
    """
    A drop-in replacement for cv2.VideoCapture that automatically reconnects
    when a YouTube stream URL expires or the connection drops.

    Usage is identical to cv2.VideoCapture:
        cap = ResilientYouTubeCapture(url)
        ret, frame = cap.read()
        cap.release()

    Internally, it keeps track of how many consecutive read failures have
    occurred. A single failure might just be a dropped packet, so we retry
    immediately a few times. After MAX_RETRIES consecutive failures we
    re-extract a fresh CDN URL from YouTube and reopen the capture.
    This handles both transient network hiccups and URL expiry.
    """

    # How many consecutive frame read failures before we attempt reconnection
    # (not re-extraction — just retry the existing connection first)
    _MAX_READ_RETRIES = 5

    def __init__(self, youtube_url: str):
        self.youtube_url = youtube_url
        self._reconnect_count = 0
        self._consecutive_failures = 0
        self._cap = None

        # Initial connection
        self._connect()

    def _connect(self):
        """Extracts a fresh CDN URL and opens a new VideoCapture."""
        print(f"[YouTube] Extracting stream URL (attempt {self._reconnect_count + 1})...")
        stream_url, title = _extract_stream_url(self.youtube_url)

        if self._reconnect_count == 0:
            # First connection — print the title so the user knows what loaded
            print(f"[YouTube] Title: {title}")

        self._cap = cv2.VideoCapture(stream_url)

        if not self._cap.isOpened():
            raise RuntimeError(
                f"Could not open YouTube stream after URL extraction. "
                f"The video may be private, age-restricted, or unavailable."
            )

        self._consecutive_failures = 0
        print(f"[YouTube] Stream opened successfully.")

    def read(self) -> tuple[bool, any]:
        """
        Reads the next frame. On failure, attempts to reconnect transparently.

        The logic mirrors how a robust network client works:
          - First, try reading a few more times (maybe it's a transient blip)
          - If that keeps failing, re-extract the URL and reconnect entirely
          - If we've exhausted all reconnect attempts, give up and return False
        """
        ret, frame = self._cap.read()

        if ret:
            # Happy path — frame came through, reset failure counter
            self._consecutive_failures = 0
            return True, frame

        # Frame read failed
        self._consecutive_failures += 1

        if self._consecutive_failures < self._MAX_READ_RETRIES:
            # Don't panic yet — might just be a momentary network hiccup
            return False, None

        # Persistent failure — time to reconnect
        if self._reconnect_count >= YOUTUBE_MAX_RECONNECTS:
            print(f"[YouTube] Exhausted {YOUTUBE_MAX_RECONNECTS} reconnect attempts. Giving up.")
            return False, None

        self._reconnect_count += 1
        print(f"[YouTube] Stream dropped. Reconnecting in {YOUTUBE_RECONNECT_DELAY}s "
              f"(attempt {self._reconnect_count}/{YOUTUBE_MAX_RECONNECTS})...")
        time.sleep(YOUTUBE_RECONNECT_DELAY)

        try:
            self._connect()
            # Try reading immediately after reconnect
            ret, frame = self._cap.read()
            if ret:
                self._consecutive_failures = 0
            return ret, frame
        except Exception as e:
            print(f"[YouTube] Reconnect failed: {e}")
            return False, None

    def get(self, prop_id: int) -> float:
        """Passes through cv2 property queries (e.g. CAP_PROP_FPS)."""
        return self._cap.get(prop_id) if self._cap else 0.0

    def isOpened(self) -> bool:
        return self._cap is not None and self._cap.isOpened()

    def release(self):
        if self._cap:
            self._cap.release()
            self._cap = None
        print(f"[YouTube] Released. Total reconnects during session: {self._reconnect_count}")


def open_youtube_capture(youtube_url: str) -> ResilientYouTubeCapture:
    """
    Public factory function — returns a ResilientYouTubeCapture that
    main.py can use exactly like a regular cv2.VideoCapture.
    """
    return ResilientYouTubeCapture(youtube_url)