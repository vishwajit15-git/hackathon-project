# =============================================================================
# utils/drawing.py — OpenCV Annotation & Frame Overlay Helpers
# =============================================================================
# This file has ONE job: take a frame and state, and draw annotations on it.
# It knows nothing about detection logic or grid math.
# All visual decisions (colors, font sizes, line thickness) come from config.py.
#
# The annotated frame returned here is what Streamlit displays in the left column.
# =============================================================================

import cv2
import numpy as np
from core.state import GlobalState
from config import (
    BGR_NORMAL, BGR_VULNERABLE, BGR_CROWDED, BGR_CRITICAL,
    DISPLAY_WIDTH, DISPLAY_HEIGHT,
    STATE_CRITICAL, STATE_CROWDED, STATE_SHOCKWAVE, STATE_SQUEEZE,
    GRID_ROWS, GRID_COLS
)


def draw_person_annotations(frame: np.ndarray, state: GlobalState) -> np.ndarray:
    """
    Draw per-person bounding boxes, labels, and velocity arrows on the frame.

    For each tracked person:
      - VULNERABLE persons get a thick RED box + a "⚠ VULNERABLE" label.
      - NORMAL persons get a standard GREEN box + their Track ID.
      - Everyone gets a velocity arrow showing direction and speed.

    Why draw arrows?
    The velocity arrow lets operators instantly see crowd flow direction at a
    glance, even without the grid view. It also provides a visual confirmation
    that the movement tracking is working correctly during debugging.

    The arrow length is proportional to speed, clamped to a max of 50px
    so it doesn't obscure other annotations in dense crowds.
    """
    for person in state.persons.values():
        cx = int(person.current_cx)
        cy = int(person.current_cy)
        h  = int(person.current_height)
        w  = int(h * 0.4)  # Approximate width from height (person aspect ratio ~0.4)

        # Compute bounding box corners from center + dimensions
        x1, y1 = cx - w // 2, cy - h // 2
        x2, y2 = cx + w // 2, cy + h // 2

        # Choose color and label based on vulnerability status
        if person.is_vulnerable:
            color     = BGR_VULNERABLE
            label     = f"ID:{person.track_id} VULNERABLE"
            thickness = 3
        else:
            color     = BGR_NORMAL
            label     = f"ID:{person.track_id}"
            thickness = 2

        # Draw bounding box
        cv2.rectangle(frame, (x1, y1), (x2, y2), color, thickness)

        # Draw label background (filled rectangle for readability)
        label_size, _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.45, 1)
        cv2.rectangle(
            frame,
            (x1, y1 - label_size[1] - 6),
            (x1 + label_size[0] + 4, y1),
            color, -1  # -1 = filled
        )
        cv2.putText(
            frame, label,
            (x1 + 2, y1 - 3),
            cv2.FONT_HERSHEY_SIMPLEX, 0.45,
            (255, 255, 255),  # White text on colored background
            1, cv2.LINE_AA
        )

        # Draw velocity arrow (only if person is actually moving)
        if person.speed > 1.0:
            # Scale arrow length: 1 pixel/frame speed → 3px arrow, max 50px
            arrow_scale = min(50.0, person.speed * 3.0)
            end_x = int(cx + (person.velocity_x / max(person.speed, 1e-6)) * arrow_scale)
            end_y = int(cy + (person.velocity_y / max(person.speed, 1e-6)) * arrow_scale)
            cv2.arrowedLine(
                frame, (cx, cy), (end_x, end_y),
                (255, 255, 0),  # Cyan arrow
                2, tipLength=0.3
            )

    return frame


def draw_grid_overlay(frame: np.ndarray, state: GlobalState) -> np.ndarray:
    """
    Draw a subtle grid overlay on the video frame to help operators see
    how the scene maps to the grid cells.

    Only draws lines for CROWDED/CRITICAL/SHOCKWAVE cells (not empty ones)
    to keep the overlay clean and uncluttered.

    The grid cell borders are drawn semi-transparently by blending with the
    original frame. OpenCV doesn't support true alpha channels for drawing,
    so we use the addWeighted trick: draw on a copy, then blend.
    """
    overlay = frame.copy()
    fh, fw = frame.shape[:2]
    cell_w = fw / GRID_COLS
    cell_h = fh / GRID_ROWS

    for r in range(GRID_ROWS):
        for c in range(GRID_COLS):
            cell_state = state.grid[r, c]

            # Only highlight non-empty cells
            if cell_state <= 1:
                continue

            # Compute pixel bounding box of this grid cell
            px1 = int(c * cell_w)
            py1 = int(r * cell_h)
            px2 = int((c + 1) * cell_w)
            py2 = int((r + 1) * cell_h)

            # Choose fill color based on cell state
            if cell_state == STATE_CRITICAL:
                fill_color = (0, 0, 180)      # Dark red fill
            elif cell_state == STATE_SQUEEZE:
                fill_color = (0, 100, 200)    # Orange fill
            elif cell_state == STATE_SHOCKWAVE:
                fill_color = (180, 0, 180)    # Magenta fill
            elif cell_state == STATE_CROWDED:
                fill_color = (0, 130, 220)    # Amber fill
            else:
                fill_color = (60, 60, 60)     # Subtle grey for occupied

            # Fill cell with semi-transparent color
            cv2.rectangle(overlay, (px1, py1), (px2, py2), fill_color, -1)

    # Blend overlay with original frame (30% overlay, 70% original)
    cv2.addWeighted(overlay, 0.30, frame, 0.70, 0, frame)

    # Draw grid lines (thin, white, very transparent)
    for r in range(GRID_ROWS + 1):
        y = int(r * cell_h)
        cv2.line(frame, (0, y), (fw, y), (40, 40, 40), 1)
    for c in range(GRID_COLS + 1):
        x = int(c * cell_w)
        cv2.line(frame, (x, 0), (x, fh), (40, 40, 40), 1)

    return frame


def draw_hud(frame: np.ndarray, state: GlobalState) -> np.ndarray:
    """
    Draw a Heads-Up Display (HUD) in the top-left corner of the frame
    showing key metrics at a glance:
        - Total persons detected
        - Vulnerable persons count
        - Critical cells count
        - Active shockwave cells

    The HUD uses a dark semi-transparent background panel for readability
    against any scene background.
    """
    # HUD panel background
    hud_bg = frame.copy()
    cv2.rectangle(hud_bg, (5, 5), (270, 130), (20, 20, 20), -1)
    cv2.addWeighted(hud_bg, 0.65, frame, 0.35, 0, frame)

    lines = [
        (f"People:      {state.total_count}",        (180, 255, 180)),  # light green
        (f"Vulnerable:  {state.vulnerable_count}",   (100, 100, 255)),  # light red
        (f"Crowded Cells:{state.crowded_cell_count}", (100, 200, 255)),  # amber
        (f"Critical:    {state.critical_cell_count}", (50,  50,  200)),  # red
        (f"Shockwave:   {state.shockwave_cell_count}",( 255, 80, 255)), # magenta
    ]

    for i, (text, color) in enumerate(lines):
        cv2.putText(
            frame, text,
            (12, 28 + i * 22),
            cv2.FONT_HERSHEY_SIMPLEX, 0.55,
            color, 1, cv2.LINE_AA
        )

    return frame


def prepare_display_frame(frame: np.ndarray, state: GlobalState) -> np.ndarray:
    """
    Master function that applies all annotations in the correct order and
    resizes the frame for consistent Streamlit display.

    Order matters:
      1. Grid overlay first (behind person annotations)
      2. Person boxes and arrows on top
      3. HUD last (always on top of everything)
      4. Resize to DISPLAY_WIDTH x DISPLAY_HEIGHT

    Returns a BGR numpy array ready for st.image() (after RGB conversion).
    """
    frame = draw_grid_overlay(frame, state)
    frame = draw_person_annotations(frame, state)
    frame = draw_hud(frame, state)

    # Resize to consistent display dimensions for Streamlit
    frame = cv2.resize(frame, (DISPLAY_WIDTH, DISPLAY_HEIGHT))

    # Convert BGR → RGB for Streamlit (st.image expects RGB)
    frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

    return frame