# =============================================================================
# core/state.py — Shared In-Memory State (replaces a database)
# =============================================================================
# Why this file exists: Streamlit reruns the ENTIRE script from top to bottom
# on every UI refresh. Without persistent state, you'd lose all tracking
# history every frame. We solve this with two mechanisms:
#   1. A Python dataclass (PersonTrack) to hold per-person data cleanly.
#   2. A GlobalState singleton stored inside st.session_state so Streamlit
#      preserves it across reruns.
#
# Think of GlobalState as your entire "database" — it lives in RAM, which is
# perfectly fine for a hackathon (no latency, no setup, instant access).
# =============================================================================

from dataclasses import dataclass, field
from typing import Optional
from collections import deque
import numpy as np
import time
from config import (
    GRID_ROWS, GRID_COLS, TRACK_HISTORY_LENGTH,
    STATE_EMPTY
)


# =============================================================================
# PersonTrack — One instance per tracked person, keyed by YOLO track_id
# =============================================================================

@dataclass
class PersonTrack:
    """
    Holds the full history and current status of a single tracked individual.

    Why a deque for position_history?
    A deque with maxlen automatically discards the oldest entry when the
    history is full. This gives us a sliding window of positions (last N frames)
    without manual memory management — perfect for computing velocity.

    Why store bbox_height separately from position?
    Because the vulnerability check only needs the Y center and height, not
    the full bbox. Keeping them separate makes the analytics code cleaner.
    """
    track_id: int

    # --- Position history: list of (cx, cy) tuples, newest at the right ---
    # deque maxlen = TRACK_HISTORY_LENGTH ensures we never look too far back.
    position_history: deque = field(
        default_factory=lambda: deque(maxlen=TRACK_HISTORY_LENGTH)
    )

    # --- Current frame data (updated every frame) ---
    current_cx: float = 0.0          # Bounding box center X (pixels)
    current_cy: float = 0.0          # Bounding box center Y (pixels)
    current_height: float = 0.0      # Bounding box height  (pixels)
    current_grid_col: int = 0        # Which grid column this person maps to
    current_grid_row: int = 0        # Which grid row    this person maps to

    # --- Derived analytics (computed by analytics.py each frame) ---
    velocity_x: float = 0.0          # Pixels/frame in X direction
    velocity_y: float = 0.0          # Pixels/frame in Y direction
    speed: float = 0.0               # Magnitude of velocity vector

    # --- Flags (set by analytics.py) ---
    is_vulnerable: bool = False       # True if height < VULNERABILITY_RATIO * expected
    is_in_crowded_cell: bool = False  # True if this person's cell exceeds crowd threshold

    # --- Metadata ---
    last_seen_frame: int = 0         # Frame number when last detected (for staleness)
    first_seen_time: float = field(default_factory=time.time)

    def update_position(self, cx: float, cy: float, height: float, frame_num: int):
        """
        Call this every frame a person is detected.
        Appends current position to history and updates current state.
        The velocity is computed AFTER this call by analytics.py, which has
        access to the full history.
        """
        self.position_history.append((cx, cy))
        self.current_cx = cx
        self.current_cy = cy
        self.current_height = height
        self.last_seen_frame = frame_num

    def compute_velocity(self, min_movement: float = 2.5):
        """
        Compute velocity vector from position history using a simple
        finite difference between the most recent and oldest stored position.

        Why not frame-by-frame difference?
        Single-frame differences are extremely noisy due to tracker jitter.
        Averaging over TRACK_HISTORY_LENGTH frames gives a smooth, reliable
        velocity estimate — like a moving average.

        Sets velocity_x, velocity_y, and speed on the object.
        """
        if len(self.position_history) < 2:
            # Not enough history yet — person just appeared
            self.velocity_x = 0.0
            self.velocity_y = 0.0
            self.speed = 0.0
            return

        # Take the oldest and newest positions in the history window
        oldest = self.position_history[0]
        newest = self.position_history[-1]
        n_frames = len(self.position_history) - 1  # Number of intervals

        # Average velocity = total displacement / number of frames
        vx = (newest[0] - oldest[0]) / n_frames
        vy = (newest[1] - oldest[1]) / n_frames
        speed = np.sqrt(vx**2 + vy**2)

        # Suppress jitter: if speed is below threshold, treat as stationary
        if speed < min_movement:
            self.velocity_x = 0.0
            self.velocity_y = 0.0
            self.speed = 0.0
        else:
            self.velocity_x = vx
            self.velocity_y = vy
            self.speed = speed


# =============================================================================
# GlobalState — The single "database" object persisted in st.session_state
# =============================================================================

class GlobalState:
    """
    The entire runtime state of the application in one object.

    Design principle: Keep it flat and simple. No nested objects beyond
    PersonTrack. Everything analytics.py needs should be directly accessible
    as an attribute.

    This class is instantiated ONCE and stored in st.session_state['app_state'].
    Every Streamlit rerun reads and writes to the SAME instance.
    """

    def __init__(self):
        # ----------------------------------------------------------------
        # Person Registry
        # Dict[track_id (int) -> PersonTrack]
        # This is your "persons table" — every tracked person lives here.
        # ----------------------------------------------------------------
        self.persons: dict[int, PersonTrack] = {}

        # ----------------------------------------------------------------
        # Grid Matrix
        # Shape: (GRID_ROWS, GRID_COLS), dtype int8
        # Each cell holds a STATE_* integer from config.py
        # This is what the Plotly heatmap visualizes.
        # ----------------------------------------------------------------
        self.grid: np.ndarray = np.zeros(
            (GRID_ROWS, GRID_COLS), dtype=np.int8
        )

        # ----------------------------------------------------------------
        # Grid Population Count
        # Shape: (GRID_ROWS, GRID_COLS), dtype int16
        # How many people are currently in each cell.
        # Separate from grid state so we can do math on it without
        # worrying about the STATE_ enum values.
        # ----------------------------------------------------------------
        self.grid_population: np.ndarray = np.zeros(
            (GRID_ROWS, GRID_COLS), dtype=np.int16
        )

        # ----------------------------------------------------------------
        # Grid Force Vectors
        # Shape: (GRID_ROWS, GRID_COLS, 2)
        # Stores the net force vector [vx, vy] for each cell.
        # Computed as the sum of all person velocity vectors in that cell.
        # This drives the DIRECTIONAL shockwave propagation in DFS.
        # ----------------------------------------------------------------
        self.grid_force: np.ndarray = np.zeros(
            (GRID_ROWS, GRID_COLS, 2), dtype=np.float32
        )

        # ----------------------------------------------------------------
        # Shockwave Cells
        # Set of (row, col) tuples currently in the active shockwave.
        # Reset every frame and recomputed by analytics.py's DFS.
        # ----------------------------------------------------------------
        self.shockwave_cells: set[tuple[int, int]] = set()

        # ----------------------------------------------------------------
        # Critical Cells
        # Set of (row, col) tuples with STATE_CRITICAL.
        # Stored separately for quick lookup during DFS seeding.
        # ----------------------------------------------------------------
        self.critical_cells: set[tuple[int, int]] = set()

        # ----------------------------------------------------------------
        # Metrics (displayed in the Streamlit sidebar/metrics row)
        # ----------------------------------------------------------------
        self.total_count: int = 0
        self.vulnerable_count: int = 0
        self.crowded_cell_count: int = 0
        self.critical_cell_count: int = 0
        self.shockwave_cell_count: int = 0
        self.squeeze_cell_count: int = 0

        # ----------------------------------------------------------------
        # Frame counter — used for staleness detection
        # (remove persons not seen for > N frames)
        # ----------------------------------------------------------------
        self.frame_count: int = 0

        # ----------------------------------------------------------------
        # Ground Plane Model
        # Linear regression result: height = m * y + c
        # Stored so drawing.py can display it, and so we don't recompute
        # it inside the drawing code.
        # ----------------------------------------------------------------
        self.ground_plane_slope: float = 0.0
        self.ground_plane_intercept: float = 100.0  # Sensible default

        # ----------------------------------------------------------------
        # Frame dimensions (set on first frame, used for grid mapping)
        # ----------------------------------------------------------------
        self.frame_width: int = 640
        self.frame_height: int = 480

    def reset_grid(self):
        """
        Clear all grid arrays at the start of each frame.
        Called by analytics.py before repopulating from fresh detections.
        We do NOT clear self.persons here — that's persistent across frames.
        """
        self.grid[:] = STATE_EMPTY
        self.grid_population[:] = 0
        self.grid_force[:] = 0.0
        self.shockwave_cells.clear()
        self.critical_cells.clear()

    def get_or_create_person(self, track_id: int) -> PersonTrack:
        """
        Fetch an existing PersonTrack or create a new one.
        This is the canonical way to access persons — never index
        self.persons directly in other modules.
        """
        if track_id not in self.persons:
            self.persons[track_id] = PersonTrack(track_id=track_id)
        return self.persons[track_id]

    def prune_stale_persons(self, max_frames_absent: int = 30):
        """
        Remove persons who haven't been detected for more than
        max_frames_absent frames. Prevents memory leak from IDs that
        the tracker lost and will never reassign.

        At 30fps, max_frames_absent=30 means ~1 second of tolerance
        before we drop the track — enough to handle brief occlusions.
        """
        stale_ids = [
            tid for tid, person in self.persons.items()
            if (self.frame_count - person.last_seen_frame) > max_frames_absent
        ]
        for tid in stale_ids:
            del self.persons[tid]

    def update_metrics(self):
        """
        Recompute all summary metrics from current state.
        Called at the END of each frame's analytics pass, so the
        Streamlit UI always reads fresh numbers.
        """
        self.total_count = len(self.persons)
        self.vulnerable_count = sum(
            1 for p in self.persons.values() if p.is_vulnerable
        )
        self.crowded_cell_count = int(np.sum(self.grid >= 2))  # STATE_CROWDED+
        self.critical_cell_count = len(self.critical_cells)
        self.shockwave_cell_count = len(self.shockwave_cells)
        self.squeeze_cell_count = int(np.sum(self.grid == 3))  # STATE_SQUEEZE


def get_state() -> GlobalState:
    """
    The canonical accessor for GlobalState throughout the entire app.

    Why this function instead of a module-level singleton?
    Because Streamlit imports modules fresh on each run in some environments.
    Storing state in st.session_state is the ONLY reliable way to persist
    objects across Streamlit reruns. This function abstracts that pattern
    so every other module just calls get_state() without knowing about
    session_state internals.

    Usage in any module:
        from core.state import get_state
        state = get_state()
        state.persons[42].is_vulnerable = True
    """
    # Import streamlit here (not at module top) to allow importing state.py
    # in non-Streamlit contexts (e.g., unit tests) without crashing.
    import streamlit as st

    if 'app_state' not in st.session_state:
        st.session_state['app_state'] = GlobalState()

    return st.session_state['app_state']