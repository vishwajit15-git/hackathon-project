# config.py — central configuration for all steps

# ──────────────────────────────────────────────
# YOLO Detection
# ──────────────────────────────────────────────
YOLO_MODEL            = "yolov8s.pt"   # small model — better accuracy than nano
CONFIDENCE_THRESHOLD  = 0.20           # lower = catches faint/far detections
PERSON_CLASS_ID       = 0

# ──────────────────────────────────────────────
# Resolution Decoupling
# ──────────────────────────────────────────────
FRAME_WIDTH      = 1280
FRAME_HEIGHT     = 720
INFERENCE_WIDTH  = 960   # increased from 640 — more pixels = better small-person detail
INFERENCE_HEIGHT = 540   # increased from 360

# ──────────────────────────────────────────────
# SAHI Tiled Inference
# ──────────────────────────────────────────────
USE_SAHI           = True
SAHI_SLICE_HEIGHT  = 0.4   # smaller tiles = each person appears larger to YOLO
SAHI_SLICE_WIDTH   = 0.4   # smaller tiles for denser/farther crowds
SAHI_OVERLAP_RATIO = 0.3   # more overlap = fewer missed border detections
SAHI_CONFIDENCE    = 0.18  # very low so distant faint blobs are still caught
SAHI_IOU_THRESH    = 0.45  # slightly tighter NMS to remove fewer true positives

# ──────────────────────────────────────────────
# Frame Skipping
# ──────────────────────────────────────────────
FRAME_SKIP = 1

# ──────────────────────────────────────────────
# Grid (shared by density, heatmap, force field)
# ──────────────────────────────────────────────
GRID_COLS =50
GRID_ROWS =25

# ──────────────────────────────────────────────
# Heatmap
# ──────────────────────────────────────────────
HEATMAP_SIGMA        = 1.2
HEATMAP_ALPHA        = 0.55
HEATMAP_COLORMAP     = 'COLORMAP_JET'
HEATMAP_BLUR_UPSCALE = True

# ──────────────────────────────────────────────
# Top-Down View  ← NEW
# ──────────────────────────────────────────────

# Output canvas size for the bird's-eye view panel in the UI
TOPVIEW_WIDTH  = 640
TOPVIEW_HEIGHT = 360

# ──────────────────────────────────────────────
# Force Field  ← NEW
# ──────────────────────────────────────────────

# Multiplier applied to gradient values before rendering arrows.
# Higher = longer, more visible arrows. Tune based on your grid size.
FORCE_MAGNITUDE_SCALE = 5.0

# Cells with normalised density below this threshold get zero force.
# Prevents noisy phantom forces in empty regions of the frame.
# Range: 0.0–1.0. Start at 0.05 (5% of max density).
FORCE_MIN_DENSITY_THRESHOLD = 0.05

# Arrow rendering settings
# Density of force arrows on screen — 1 = every cell, 2 = every other cell
FORCE_ARROW_STRIDE = 2

# Arrow colour in BGR (default: bright cyan — distinct from heatmap colours)
FORCE_ARROW_COLOR  = (255, 220, 0)   # cyan-yellow

# Resultant (whole-scene) arrow colour
FORCE_RESULTANT_COLOR = (0, 0, 255)  # red

# Magnitude threshold above which a cell is considered "at risk"
# Used in Step 5 propagation. 0.5 = top 50% of force magnitude.
FORCE_CRITICAL_THRESHOLD = 0.5

# ──────────────────────────────────────────────
# Default UI toggle states
# ──────────────────────────────────────────────
DEFAULT_SHOW_HEATMAP      = True
DEFAULT_SHOW_GRID_OVERLAY = False   # off by default — less cluttered with force arrows
DEFAULT_SHOW_BOXES        = True
DEFAULT_SHOW_ANCHORS      = False
DEFAULT_SHOW_STATS        = True
DEFAULT_SHOW_FORCES       = True
DEFAULT_SHOW_TOPVIEW      = True

# ──────────────────────────────────────────────
# YouTube / RTSP
# ──────────────────────────────────────────────
YOUTUBE_MAX_RECONNECTS  = 5
YOUTUBE_RECONNECT_DELAY = 3.0

# ──────────────────────────────────────────────
# Output
# ──────────────────────────────────────────────
OUTPUT_DIR        = "output"
SAVE_OUTPUT_VIDEO = False
OUTPUT_VIDEO_NAME = "crowd_output.mp4"

# ──────────────────────────────────────────────
# Gradio
# ──────────────────────────────────────────────
GRADIO_PORT  = 7860
GRADIO_SHARE = False