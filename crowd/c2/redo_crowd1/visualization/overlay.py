# visualization/overlay.py
# (Force arrows now SUPER visible - bigger, thicker, minimum length)

import cv2
import numpy as np
from config import GRID_ROWS, GRID_COLS


# ── Color constants (BGR) ─────────────────────────────────────────────────
COLOR_BOX            = (0, 255, 0)
COLOR_TEXT           = (255, 255, 255)
COLOR_COUNT_BG       = (30, 30, 30)
COLOR_FORCE          = (0, 165, 255)      # Orange
COLOR_FORCE_CRITICAL = (0, 0, 255)        # Red


def draw_person_boxes(frame: np.ndarray, boxes: list) -> np.ndarray:
    for (x1, y1, x2, y2) in boxes:
        cv2.rectangle(frame, (x1, y1), (x2, y2), COLOR_BOX, 2)
        label = "P"
        label_size, baseline = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 1)
        label_y = max(y1 - 5, label_size[1])
        cv2.rectangle(frame, (x1, label_y - label_size[1] - 3),
                      (x1 + label_size[0], label_y + baseline), COLOR_BOX, cv2.FILLED)
        cv2.putText(frame, label, (x1, label_y - 2),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 0), 1)
    return frame


def draw_anchor_points(frame: np.ndarray, anchors: list) -> np.ndarray:
    for (ax, ay) in anchors:
        cv2.circle(frame, (int(ax), int(ay)), 4, (255, 255, 0), -1)
    return frame


def draw_density_grid(frame: np.ndarray, density_result: dict,
                      calculator, show_counts: bool = True,
                      show_grid_lines: bool = True) -> np.ndarray:
    # (same as before - unchanged)
    count_grid = density_result.get('count_grid', np.zeros((GRID_ROWS, GRID_COLS)))
    density_grid = density_result.get('density_grid', np.zeros((GRID_ROWS, GRID_COLS)))

    overlay = frame.copy()
    for row in range(GRID_ROWS):
        for col in range(GRID_COLS):
            density_val = float(density_grid[row, col])
            if density_val > 0:
                scalar = np.array([[[density_val * 255]]], dtype=np.uint8)
                coloured = cv2.applyColorMap(scalar, cv2.COLORMAP_JET)
                cell_colour = tuple(int(c) for c in coloured[0, 0])
                x1, y1, x2, y2 = calculator.get_cell_pixel_bounds(row, col)
                cv2.rectangle(overlay, (x1, y1), (x2, y2), cell_colour, cv2.FILLED)

    cv2.addWeighted(overlay, 0.4, frame, 0.6, 0, frame)

    if show_grid_lines:
        h, w = frame.shape[:2]
        cell_w = w / GRID_COLS
        cell_h = h / GRID_ROWS
        line_colour = (80, 80, 80)
        for c in range(1, GRID_COLS):
            cv2.line(frame, (int(c * cell_w), 0), (int(c * cell_w), h), line_colour, 1)
        for r in range(1, GRID_ROWS):
            cv2.line(frame, (0, int(r * cell_h)), (w, int(r * cell_h)), line_colour, 1)

    if show_counts:
        for row in range(GRID_ROWS):
            for col in range(GRID_COLS):
                count_val = int(count_grid[row, col])
                if count_val == 0:
                    continue
                x1, y1, x2, y2 = calculator.get_cell_pixel_bounds(row, col)
                cx, cy = (x1 + x2) // 2, (y1 + y2) // 2
                label = str(count_val)
                text_size, _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.55, 2)
                tx = cx - text_size[0] // 2
                ty = cy + text_size[1] // 2
                cv2.putText(frame, label, (tx + 1, ty + 1), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 0, 0), 2)
                cv2.putText(frame, label, (tx, ty), cv2.FONT_HERSHEY_SIMPLEX, 0.55, COLOR_TEXT, 1)
    return frame


def draw_force_arrows(frame: np.ndarray, force_result: dict, calculator) -> np.ndarray:
    """SUPER VISIBLE force arrows — bigger, thicker, minimum length"""
    if not force_result or 'force_vectors' not in force_result:
        return frame

    vectors = force_result['force_vectors']
    critical_cells = force_result.get('critical_cells', [])

    drawn = False
    for row in range(GRID_ROWS):
        for col in range(GRID_COLS):
            vec = vectors[row, col]
            mag = np.linalg.norm(vec)

            # Minimum visible magnitude
            if mag < 0.001:
                continue

            x1, y1, x2, y2 = calculator.get_cell_pixel_bounds(row, col)
            cx = (x1 + x2) // 2
            cy = (y1 + y2) // 2

            dx, dy = vec
            scale = max(35, mag * 60)          # MUCH bigger arrows
            ex = int(cx + dx * scale)
            ey = int(cy + dy * scale)

            color = COLOR_FORCE_CRITICAL if (row, col) in critical_cells else COLOR_FORCE

            cv2.arrowedLine(frame, (cx, cy), (ex, ey), color, thickness=4, tipLength=0.4)
            cv2.circle(frame, (cx, cy), 5, color, -1)

            drawn = True

    # Debug text if no arrows were drawn (helps you know if force calc is working)
    if not drawn:
        cv2.putText(frame, "FORCE: No movement detected", (50, 150),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 255), 2)

    return frame


def draw_density_stats(frame: np.ndarray, stats: dict) -> np.ndarray:
    # (same as before)
    h, w = frame.shape[:2]
    lines = [
        f"Cells occupied: {stats.get('occupied_cells', 0)}/{stats.get('total_cells', 0)} ({stats.get('occupancy_pct', 0):.0f}%)",
        f"Mean density:   {stats.get('mean_density', 0):.3f}  |  Peak: {stats.get('max_density', 0)}",
        f"Avg per occupied: {stats.get('mean_per_occupied', 0):.1f}",
    ]
    padding = 8
    line_h = 20
    panel_w = 430
    panel_h = len(lines) * line_h + padding * 2
    x0 = padding
    y0 = h - panel_h - padding

    overlay = frame.copy()
    cv2.rectangle(overlay, (x0, y0), (x0 + panel_w, y0 + panel_h), (20, 20, 20), cv2.FILLED)
    cv2.addWeighted(overlay, 0.7, frame, 0.3, 0, frame)

    for i, line in enumerate(lines):
        ty = y0 + padding + (i + 1) * line_h - 4
        cv2.putText(frame, line, (x0 + padding, ty),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.48, COLOR_TEXT, 1)
    return frame


def draw_count_panel(frame: np.ndarray, count: int, fps: float = 0.0) -> np.ndarray:
    padding = 10
    panel_w = 260
    panel_h = 75
    overlay = frame.copy()
    cv2.rectangle(overlay, (padding, padding), (padding + panel_w, padding + panel_h), COLOR_COUNT_BG, cv2.FILLED)
    cv2.addWeighted(overlay, 0.75, frame, 0.25, 0, frame)

    cv2.putText(frame, f"People: {count}", (padding + 10, padding + 38),
                cv2.FONT_HERSHEY_SIMPLEX, 1.0, COLOR_TEXT, 2)
    cv2.putText(frame, f"FPS: {fps:.1f}", (padding + 10, padding + 62),
                cv2.FONT_HERSHEY_SIMPLEX, 0.55, (180, 180, 180), 1)
    return frame


def draw_frame_info(frame: np.ndarray, frame_number: int, source_label: str) -> np.ndarray:
    h, w = frame.shape[:2]
    info_text = f"{source_label} | Frame #{frame_number}"
    text_size, _ = cv2.getTextSize(info_text, cv2.FONT_HERSHEY_SIMPLEX, 0.45, 1)
    x = w - text_size[0] - 12
    y = h - 12
    cv2.putText(frame, info_text, (x + 1, y + 1), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 0, 0), 1)
    cv2.putText(frame, info_text, (x, y), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (200, 200, 200), 1)
    return frame