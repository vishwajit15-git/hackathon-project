# =============================================================================
# main_app.py — Streamlit Dashboard Entry Point
# =============================================================================
# This file is the ONLY file Streamlit runs. Its job is layout and rendering.
# It should contain NO analytics logic and NO CV logic — it just calls the
# modules we built and displays what they return.
#
# Streamlit execution model (important to understand):
#   Streamlit re-runs this ENTIRE script from top to bottom on every "event."
#   An "event" can be: a button click, a slider change, or our auto-refresh
#   timer firing. This means all variables are re-initialized every run.
#   Persistent state (the video capture, person tracks, grid) MUST live in
#   st.session_state — which is exactly what core/state.py's get_state() does.
#
# Run with:
#   streamlit run main_app.py
# =============================================================================

import streamlit as st
import cv2
import numpy as np
import time
from streamlit_autorefresh import st_autorefresh
from streamlit_autorefresh import st_autorefresh
from core.state import get_state
from core.vision import VisionProcessor
from core.analytics import run_analytics_pipeline
from utils.drawing import prepare_display_frame
from utils.grid_viz import build_grid_figure, build_legend_html
from config import DISPLAY_WIDTH, DISPLAY_HEIGHT


# =============================================================================
# PAGE CONFIG — Must be the FIRST Streamlit call in the script
# =============================================================================

st.set_page_config(
    page_title="Crowd Safety Dashboard",
    page_icon="🚨",
    layout="wide",
    initial_sidebar_state="expanded",
)


# =============================================================================
# CUSTOM CSS — Dark theme styling
# =============================================================================

st.markdown("""
<style>
/* Dark background for the whole app */
.stApp { background-color: #0d0d1a; color: #e0e0e0; }

/* Metric cards */
div[data-testid="metric-container"] {
    background: #1a1a2e;
    border: 1px solid #2a2a4a;
    border-radius: 8px;
    padding: 12px 16px;
}

/* Alert box for critical events */
.alert-critical {
    background: #3d0000;
    border: 2px solid #cc0000;
    border-radius: 8px;
    padding: 12px;
    color: #ff9999;
    font-weight: bold;
    text-align: center;
    animation: pulse 1s infinite;
}
@keyframes pulse {
    0%   { border-color: #cc0000; }
    50%  { border-color: #ff4444; }
    100% { border-color: #cc0000; }
}

/* Section headers */
.section-header {
    color: #7090ff;
    font-size: 1.1em;
    font-weight: 600;
    border-bottom: 1px solid #2a2a4a;
    padding-bottom: 4px;
    margin-bottom: 12px;
}

/* Grid container */
.grid-container {
    background: #0d0d1a;
    border: 1px solid #2a2a4a;
    border-radius: 8px;
    padding: 8px;
}
</style>
""", unsafe_allow_html=True)


# =============================================================================
# AUTO-REFRESH — Drives the real-time update loop
# =============================================================================
# st_autorefresh fires a Streamlit rerun every `interval` milliseconds.
# 150ms ≈ ~6-7 FPS in the dashboard. Set lower for faster updates,
# but be aware that very low values (<100ms) can cause browser lag.
# The `key` parameter prevents multiple timers from stacking up on reruns.

st_autorefresh(interval=150, limit=None, key="dashboard_refresh")


# =============================================================================
# SESSION STATE INITIALIZATION
# =============================================================================
# We use session_state to persist objects that are expensive to create
# (the VisionProcessor loads a YOLO model) across Streamlit reruns.

state = get_state()

if "vision" not in st.session_state:
    try:
        st.session_state["vision"] = VisionProcessor()
        # Store frame dimensions in state so analytics can use them for grid mapping
        w, h = st.session_state["vision"].get_frame_dimensions()
        state.frame_width  = w
        state.frame_height = h
    except RuntimeError as e:
        st.error(f"🚫 Camera Error: {e}")
        st.stop()

vision: VisionProcessor = st.session_state["vision"]


# =============================================================================
# SIDEBAR — Controls and configuration
# =============================================================================

with st.sidebar:
    st.markdown("## ⚙️ Controls")

    # Allow user to toggle grid overlay on the video feed
    show_grid_overlay = st.toggle("Show Grid Overlay on Video", value=True)

    st.markdown("---")
    st.markdown("## 📊 System Info")
    st.markdown(f"**Grid:** {state.frame_width}×{state.frame_height} → 20×20 cells")
    st.markdown(f"**Frame #:** {state.frame_count}")
    st.markdown(f"**Tracked persons:** {len(state.persons)}")

    st.markdown("---")
    st.markdown("## 🎨 Legend")
    st.markdown(build_legend_html(), unsafe_allow_html=True)

    st.markdown("---")
    st.markdown("## ℹ️ About")
    st.markdown("""
    **Crowd Safety Dashboard**
    Real-time crowd management using:
    - YOLOv8 + ByteTrack detection
    - Relative height vulnerability detection
    - Movement vector squeeze analysis
    - DFS directional shockwave propagation
    """)


# =============================================================================
# MAIN FRAME PROCESSING — Read, detect, analyze
# =============================================================================

ret, frame = vision.read_frame()

if not ret:
    st.warning("⚠️ No frame available. Check your video source.")
    st.stop()

# Run YOLOv8 detection + ByteTrack
detections, yolo_frame = vision.get_detections(frame)

# Run full analytics pipeline (updates state in-place)
run_analytics_pipeline(detections, state, state.frame_count + 1)

# Prepare annotated display frame
# We give drawing.py the YOLO-annotated frame (not the raw frame)
# so it draws on top of YOLO's own minimal annotations.
if show_grid_overlay:
    display_frame = prepare_display_frame(yolo_frame, state)
else:
    # Still apply person annotations and HUD, just skip grid overlay
    from utils.drawing import draw_person_annotations, draw_hud
    f = draw_person_annotations(yolo_frame, state)
    f = draw_hud(f, state)
    f = cv2.resize(f, (DISPLAY_WIDTH, DISPLAY_HEIGHT))
    display_frame = cv2.cvtColor(f, cv2.COLOR_BGR2RGB)


# =============================================================================
# DASHBOARD LAYOUT — Title + Metrics Row + Two-Column Main Content
# =============================================================================

# --- Title Bar ---
st.markdown(
    "<h1 style='text-align:center; color:#7090ff; margin-bottom:4px;'>"
    "🚨 Crowd Safety Dashboard"
    "</h1>",
    unsafe_allow_html=True
)

# --- Critical Alert Banner (only shown when critical cells exist) ---
if state.critical_cell_count > 0:
    st.markdown(
        f"<div class='alert-critical'>"
        f"⚠️ CRITICAL ALERT — {state.critical_cell_count} CRITICAL ZONE(S) DETECTED "
        f"| {state.shockwave_cell_count} SHOCKWAVE CELLS ACTIVE"
        f"</div>",
        unsafe_allow_html=True
    )

st.markdown("<br>", unsafe_allow_html=True)

# --- Metrics Row (5 key numbers at a glance) ---
m1, m2, m3, m4, m5 = st.columns(5)

with m1:
    st.metric(
        "👥 Total People",
        state.total_count,
        delta=None
    )
with m2:
    st.metric(
        "⚠️ Vulnerable",
        state.vulnerable_count,
        delta=None,
        # Red delta color if any vulnerable people detected
    )
with m3:
    st.metric(
        "🟡 Crowded Cells",
        state.crowded_cell_count,
    )
with m4:
    st.metric(
        "🔴 Critical Cells",
        state.critical_cell_count,
    )
with m5:
    st.metric(
        "🌊 Shockwave Cells",
        state.shockwave_cell_count,
    )

st.markdown("---")

# --- Main Two-Column Layout ---
left_col, right_col = st.columns([1.2, 1], gap="large")

# ============================================================
# LEFT COLUMN — Live annotated video feed
# ============================================================
with left_col:
    st.markdown("<p class='section-header'>📹 Live Camera Feed</p>",
                unsafe_allow_html=True)

    # st.image expects RGB (we converted in prepare_display_frame)
    st.image(
        display_frame,
        caption=f"Frame {state.frame_count} | "
                f"{len(detections)} persons detected this frame",
        use_container_width=True
    )

    # Show ground plane model info (useful for debugging vulnerability detection)
    with st.expander("📐 Ground Plane Model", expanded=False):
        slope     = state.ground_plane_slope
        intercept = state.ground_plane_intercept
        st.markdown(f"""
        **Regression Model:** `height = {slope:.3f} × y + {intercept:.1f}`

        This model estimates the expected bounding-box height at any Y position
        based on current detections. A person is flagged **Vulnerable** if their
        actual height is less than **80%** of this expected value.

        - **Slope (m):** `{slope:.4f}` — {"↓ Negative (farther = smaller, correct)" if slope < 0 else "↑ Positive (check camera angle)"}`
        - **Intercept (c):** `{intercept:.1f}` px
        """)


# ============================================================
# RIGHT COLUMN — 2D Grid heatmap + force analysis
# ============================================================
with right_col:
    st.markdown("<p class='section-header'>🗺️ Pressure Grid (DFS Shockwave)</p>",
                unsafe_allow_html=True)

    # Build and render the Plotly grid heatmap
    grid_fig = build_grid_figure(state)
    st.plotly_chart(
        grid_fig,
        use_container_width=True,
        config={"displayModeBar": False}  # Hide Plotly toolbar for clean look
    )

    # --- Per-zone Force Analysis ---
    with st.expander("🧭 Active Zone Details", expanded=True):
        # Show details for all non-empty cells above a certain interest level
        active_cells = [
            (r, c, int(state.grid[r, c]), int(state.grid_population[r, c]),
             float(state.grid_force[r, c, 0]), float(state.grid_force[r, c, 1]))
            for r in range(20) for c in range(20)
            if state.grid[r, c] >= 2  # CROWDED or above
        ]

        if not active_cells:
            st.info("No crowded zones detected. Move closer to the camera.")
        else:
            # Display as a compact table
            import pandas as pd
            state_names = {2: "Crowded", 3: "Squeeze ⚠", 4: "CRITICAL 🚨", 5: "Wave 🌊"}
            rows = []
            for r, c, s, pop, fx, fy in active_cells[:12]:  # Cap at 12 rows
                force_mag = float(np.sqrt(fx**2 + fy**2))
                # Direction as a compass arrow based on dominant force component
                if force_mag > 0.5:
                    angle = np.degrees(np.arctan2(fy, fx))
                    # Map angle to compass arrow
                    arrows = ["→", "↘", "↓", "↙", "←", "↖", "↑", "↗"]
                    idx = int(((angle + 180 + 22.5) / 45)) % 8
                    direction = arrows[idx]
                else:
                    direction = "·"

                rows.append({
                    "Cell": f"({r},{c})",
                    "State": state_names.get(s, str(s)),
                    "People": pop,
                    "Force": f"{force_mag:.1f}",
                    "Dir": direction
                })

            df = pd.DataFrame(rows)
            st.dataframe(
                df,
                use_container_width=True,
                height=min(300, len(rows) * 40 + 40),
                hide_index=True
            )


# =============================================================================
# FOOTER
# =============================================================================

st.markdown("---")
st.markdown(
    "<p style='text-align:center; color:#444; font-size:0.75em;'>"
    "Crowd Safety Dashboard • YOLOv8 + ByteTrack + DFS Shockwave • "
    "Built for Hackathon 2024"
    "</p>",
    unsafe_allow_html=True
)