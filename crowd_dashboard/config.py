# =============================================================================
# config.py — Single Source of Truth for ALL tunable parameters
# =============================================================================
# Why this file exists: In a hackathon, you will constantly be tuning thresholds
# (e.g., "what counts as crowded?", "how short is too short?"). Having every
# magic number here means you change ONE value and the whole system adapts.
# Never hardcode these numbers anywhere else in the codebase.
# =============================================================================

# --- Video Source ---
# Set to 0 for webcam, or provide a path string like "assets/sample_video.mp4"
VIDEO_SOURCE = 0

# --- YOLOv8 Model ---
YOLO_MODEL_PATH = "yolov8n.pt"       # 'n' = nano, fastest for real-time use
YOLO_CONFIDENCE = 0.4                # Minimum detection confidence (0.0 - 1.0)
YOLO_PERSON_CLASS_ID = 0             # In COCO dataset, class 0 = 'person'
YOLO_TRACKER = "bytetrack.yaml"      # ByteTrack is more stable than botsort for crowds

# --- Grid Configuration ---
# The frame is divided into a GRID_COLS x GRID_ROWS matrix.
# Each cell of this grid represents a patch of the floor.
# 20x20 gives good spatial resolution without being too slow.
GRID_COLS = 20
GRID_ROWS = 20

# --- Density & Crowding ---
# How many people in a single grid cell before it's considered "Crowded"?
# Tune this based on your camera FOV and expected crowd density.
CROWDING_THRESHOLD = 2

# --- Vulnerability Detection (Relative Height) ---
# A person is "Vulnerable" if their bounding box height is less than
# VULNERABILITY_RATIO * (expected height for their depth zone).
# 0.80 means "less than 80% of expected height" → likely fallen/crouching.
VULNERABILITY_RATIO = 0.80

# Minimum number of people needed in a depth zone to make a reliable
# regression estimate. Zones with fewer people are skipped.
MIN_ZONE_POPULATION = 3

# Number of horizontal depth zones to divide the frame into.
# More zones = more accurate ground plane, but needs more people per zone.
DEPTH_ZONES = 5

# --- Movement & Speed ---
# How many past frames to keep in position history per person.
# Used for computing velocity vectors (speed + direction).
TRACK_HISTORY_LENGTH = 15            # ~0.5 seconds at 30fps

# Minimum pixel displacement per frame to be considered "moving"
# (filters out jitter from the tracker).
MIN_MOVEMENT_THRESHOLD = 2.5         # pixels

# --- Squeeze Detection ---
# "Squeeze" = people in a cell are moving TOWARD each other (inward vectors).
# We measure this using the average dot product of velocity vectors vs the
# centripetal direction (pointing toward cell center).
# If the average dot product exceeds this threshold, the cell is "Squeezing".
SQUEEZE_DOT_THRESHOLD = 0.3          # Range: -1.0 (diverging) to 1.0 (converging)
MIN_PEOPLE_FOR_SQUEEZE = 2           # Need at least 2 people to detect squeeze

# --- DFS Shockwave ---
# The DFS propagates pressure from Critical cells outward.
# MAX_SHOCKWAVE_DEPTH limits how far the wave can spread in one frame
# (prevents the whole grid lighting up instantly).
MAX_SHOCKWAVE_DEPTH = 6

# --- Cell State Enum Values (used as integer levels in the numpy grid) ---
# Using integers lets us use numpy operations (e.g., grid > STATE_CROWDED).
STATE_EMPTY    = 0
STATE_OCCUPIED = 1
STATE_CROWDED  = 2
STATE_SQUEEZE  = 3    # Crowded + inward force vectors
STATE_CRITICAL = 4    # Crowded + Vulnerable person present
STATE_SHOCKWAVE = 5   # Cells reached by DFS pressure propagation

# --- UI / Visualization ---
# Colors for each cell state in the Plotly heatmap (as RGB strings for Plotly).
# Order must match STATE integer values above (index 0 = STATE_EMPTY, etc.)
CELL_COLORS = [
    "#0a0a1a",   # 0 = EMPTY        → near-black (dark background)
    "#1a3a5c",   # 1 = OCCUPIED     → dark blue
    "#e6a817",   # 2 = CROWDED      → amber/yellow warning
    "#e05c00",   # 3 = SQUEEZE      → orange (pressure building)
    "#cc0000",   # 4 = CRITICAL     → bright red (danger)
    "#ff44ff",   # 5 = SHOCKWAVE    → magenta/purple (spreading wave)
]

# Annotation colors for OpenCV (BGR format, not RGB!)
BGR_NORMAL     = (0, 255, 0)         # Green  → normal person
BGR_VULNERABLE = (0, 0, 255)         # Red    → vulnerable person
BGR_CROWDED    = (0, 165, 255)       # Orange → crowded zone label
BGR_CRITICAL   = (0, 0, 180)         # Dark red → critical zone

# Frame display size in Streamlit (resize for consistent UI layout)
DISPLAY_WIDTH  = 640
DISPLAY_HEIGHT = 480