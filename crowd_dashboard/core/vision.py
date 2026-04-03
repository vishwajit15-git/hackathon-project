# =============================================================================
# core/vision.py — YOLOv8 Detection, Tracking & Raw Frame Output
# =============================================================================
# This file has ONE job: read a video frame, run YOLO on it, and return
# structured detection data. It knows NOTHING about vulnerability, grids,
# or the dashboard. That separation is intentional — if you later swap
# YOLOv8 for a different model, you only change this file.
#
# Output contract: Every other module expects detections as a list of dicts,
# each with keys: track_id, cx, cy, width, height, confidence
# Nothing more, nothing less.
# =============================================================================

import cv2
import numpy as np
from ultralytics import YOLO
from typing import Optional
from config import (
    YOLO_MODEL_PATH, YOLO_CONFIDENCE, YOLO_PERSON_CLASS_ID,
    YOLO_TRACKER, DISPLAY_WIDTH, DISPLAY_HEIGHT
)


# =============================================================================
# Detection dataclass-style dict schema (documented here for reference)
# =============================================================================
# Each detection returned by get_detections() is a dict:
# {
#   "track_id"   : int   — unique person ID from ByteTrack (stable across frames)
#   "cx"         : float — bounding box center X in pixels (in ORIGINAL frame size)
#   "cy"         : float — bounding box center Y in pixels
#   "width"      : float — bounding box width  in pixels
#   "height"     : float — bounding box height in pixels
#   "confidence" : float — YOLO detection confidence (0.0 to 1.0)
# }


class VisionProcessor:
    """
    Wraps YOLOv8 + ByteTrack into a simple frame-by-frame interface.

    Lifecycle:
        processor = VisionProcessor()          # Load model once
        while True:
            ret, frame = processor.read_frame()
            if not ret: break
            detections, annotated = processor.get_detections(frame)
            # detections = list of detection dicts
            # annotated  = frame with YOLO's own bounding boxes drawn

    Why load the model in __init__ and NOT in get_detections?
    Model loading is expensive (~1-2 seconds). Loading it once and reusing
    the same YOLO object is critical for real-time performance.
    """

    def __init__(self, source=None):
        """
        Args:
            source: Video source. None = use config.VIDEO_SOURCE.
                    Can be 0 (webcam), 1 (second webcam), or a file path string.
        """
        from config import VIDEO_SOURCE
        self.source = source if source is not None else VIDEO_SOURCE

        print(f"[Vision] Loading YOLO model: {YOLO_MODEL_PATH}")
        self.model = YOLO(YOLO_MODEL_PATH)

        print(f"[Vision] Opening video source: {self.source}")
        self.cap = cv2.VideoCapture(self.source)

        if not self.cap.isOpened():
            raise RuntimeError(
                f"[Vision] Cannot open video source: {self.source}. "
                "Check that your webcam is connected or the file path is correct."
            )

        # Read actual frame dimensions from the capture device.
        # These are used by analytics.py to correctly map pixel coords to grid coords.
        self.frame_width  = int(self.cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        self.frame_height = int(self.cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        print(f"[Vision] Frame size: {self.frame_width}x{self.frame_height}")

        # Track the last successfully read frame so Streamlit can display
        # something even when no new frame is ready yet.
        self._last_frame: Optional[np.ndarray] = None

    def read_frame(self) -> tuple[bool, Optional[np.ndarray]]:
        """
        Read the next frame from the video source.

        Returns:
            (success, frame) where frame is a BGR numpy array.
            If reading fails (end of video, disconnected camera), success=False.

        Why not use cap.read() directly in get_detections?
        Separating read from inference lets main_app.py decide whether to
        retry, loop the video, or show an error — without touching YOLO logic.
        """
        ret, frame = self.cap.read()

        # If end of video file — loop back to start (useful for demos)
        if not ret and isinstance(self.source, str):
            self.cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
            ret, frame = self.cap.read()

        if ret:
            self._last_frame = frame

        return ret, frame

    def get_detections(self, frame: np.ndarray) -> tuple[list[dict], np.ndarray]:
        """
        Run YOLOv8 + ByteTrack on a single frame.

        The key parameter is persist=True. Without it, ByteTrack doesn't
        accumulate the Kalman filter state needed to assign stable track IDs
        across frames. Always pass persist=True for tracking.

        Args:
            frame: BGR numpy array from read_frame()

        Returns:
            detections: List of detection dicts (see schema at top of file)
            annotated_frame: Frame with YOLO's built-in boxes drawn on it.
                             Drawing.py will add more annotations on top of this.
        """
        detections = []

        # Run YOLO inference + ByteTrack tracking in one call.
        # classes=[0] restricts detection to persons only — much faster
        # than detecting all 80 COCO classes and filtering afterward.
        results = self.model.track(
            frame,
            persist=True,                        # CRITICAL: maintains tracker state
            conf=YOLO_CONFIDENCE,
            classes=[YOLO_PERSON_CLASS_ID],
            tracker=YOLO_TRACKER,
            verbose=False                        # Suppress per-frame console spam
        )

        # results[0] contains all detections for this frame.
        # .boxes gives us the bounding box data.
        result = results[0]

        # Get the annotated frame from YOLO (it draws its own basic boxes).
        # We'll add our custom annotations (vulnerable highlights, etc.) on top.
        annotated_frame = result.plot(conf=False, labels=False)

        # Extract bounding box data if any persons were detected
        if result.boxes is not None and len(result.boxes) > 0:
            boxes = result.boxes

            # boxes.id can be None if the tracker failed to assign IDs
            # (e.g., on the very first frame before track history builds up)
            if boxes.id is not None:
                ids         = boxes.id.cpu().numpy().astype(int)      # Track IDs
                xyxy        = boxes.xyxy.cpu().numpy()                  # [x1,y1,x2,y2]
                confidences = boxes.conf.cpu().numpy()                  # Confidence scores

                for i, track_id in enumerate(ids):
                    x1, y1, x2, y2 = xyxy[i]

                    # Compute center point and dimensions from corner coords.
                    # Analytics uses center (cx, cy) for grid mapping and
                    # height for vulnerability detection.
                    cx     = (x1 + x2) / 2.0
                    cy     = (y1 + y2) / 2.0
                    width  = x2 - x1
                    height = y2 - y1

                    # Filter out tiny detections (< 20px tall) — these are
                    # usually false positives from background clutter.
                    if height < 20:
                        continue

                    detections.append({
                        "track_id"   : int(track_id),
                        "cx"         : float(cx),
                        "cy"         : float(cy),
                        "width"      : float(width),
                        "height"     : float(height),
                        "confidence" : float(confidences[i]),
                    })

        return detections, annotated_frame

    def get_frame_dimensions(self) -> tuple[int, int]:
        """Returns (width, height) of the video source frames."""
        return self.frame_width, self.frame_height

    def release(self):
        """
        Release the video capture handle.
        Always call this on shutdown to free the webcam/file handle.
        In Streamlit, call this in an atexit handler or when the session ends.
        """
        if self.cap.isOpened():
            self.cap.release()
            print("[Vision] Video capture released.")

    def __del__(self):
        """Destructor fallback — release capture if object is garbage collected."""
        try:
            self.release()
        except Exception:
            pass