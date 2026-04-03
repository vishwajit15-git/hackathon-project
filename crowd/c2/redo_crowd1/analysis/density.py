# analysis/density.py
# Population density calculator for the crowd management system.
#
# Core responsibility: take a list of bounding boxes from YOLO and convert
# them into a 2D density grid — a (GRID_ROWS x GRID_COLS) NumPy array where
# each cell holds the count and normalized density of people in that region.
#
# This module is intentionally stateless: given the same boxes and frame size,
# it always returns the same result. No history, no smoothing (yet — that comes
# in later steps when we need temporal analysis for force calculations).

import numpy as np
from config import GRID_ROWS, GRID_COLS, FRAME_WIDTH, FRAME_HEIGHT


class DensityCalculator:
    """
    Converts YOLO bounding boxes into a spatial density grid.

    The grid divides the camera frame into GRID_ROWS × GRID_COLS cells.
    For each frame, we:
        1. Compute the anchor point for each detected person (bottom-center of box)
        2. Determine which grid cell that anchor falls into
        3. Increment that cell's count
        4. Normalize the count grid to produce a 0.0–1.0 density grid

    Why keep this in a class rather than plain functions?
        Because in later steps (force fields, propagation), we'll want to
        add smoothing history and per-cell thresholds. Having a class makes
        it natural to add state (like a rolling average buffer) without
        changing the public interface that main.py depends on.
    """

    def __init__(self):
        # Precompute cell dimensions once — these don't change between frames
        # so there's no point recalculating them 30 times per second
        self.cell_w = FRAME_WIDTH  / GRID_COLS   # width  of one cell in pixels
        self.cell_h = FRAME_HEIGHT / GRID_ROWS   # height of one cell in pixels

        # Precompute cell pixel area — used when we want true spatial density
        # (people per pixel² is tiny, so we scale to people per 1000px² instead)
        self.cell_area_px = self.cell_w * self.cell_h

        print(f"[Density] Grid: {GRID_COLS} cols × {GRID_ROWS} rows")
        print(f"[Density] Cell size: {self.cell_w:.1f} × {self.cell_h:.1f} px "
              f"({self.cell_area_px:.0f} px²)")

    def _get_anchor(self, box: list[int]) -> tuple[float, float]:
        """
        Extracts the anchor point for a single bounding box.

        We use the BOTTOM-CENTER of the box rather than the centroid because
        it represents where the person's feet are touching the ground.

        Why this matters for crowd management:
            Consider a person standing 30 metres from the camera. Their bounding
            box might span from y=300 to y=400 in a 720px frame. Their centroid
            is at y=350 — floating in the middle of their body. But their feet
            are at y=400, which correctly corresponds to the ground-level grid
            cell they're occupying. Using centroid would assign them to the wrong
            (higher) cell, making the density map slightly inaccurate for the
            spatial force calculations we'll build in Step 4.
        """
        x1, y1, x2, y2 = box
        anchor_x = (x1 + x2) / 2.0   # horizontal center of the box
        anchor_y = float(y2)           # bottom edge = feet position
        return anchor_x, anchor_y

    def _anchor_to_cell(self, anchor_x: float, anchor_y: float) -> tuple[int, int]:
        """
        Converts a pixel-space anchor point to a (row, col) grid cell index.

        The math is straightforward division:
            col = floor(anchor_x / cell_width)
            row = floor(anchor_y / cell_height)

        We clamp to [0, GRID_COLS-1] and [0, GRID_ROWS-1] to handle edge cases
        where YOLO predicts a box that slightly overflows the frame boundary
        (this happens occasionally, especially near frame edges).

        Think of it like a number line divided into equal segments:
            [0 ... cell_w) → col 0
            [cell_w ... 2*cell_w) → col 1
            [2*cell_w ... 3*cell_w) → col 2   etc.
        """
        col = int(anchor_x / self.cell_w)
        row = int(anchor_y / self.cell_h)

        # Clamp to valid grid range (handles boxes that slightly exceed frame)
        col = max(0, min(col, GRID_COLS - 1))
        row = max(0, min(row, GRID_ROWS - 1))

        return row, col

    def compute(self, boxes: list[list[int]]) -> dict:
        """
        Main entry point. Takes YOLO boxes and returns a density result dict.

        Args:
            boxes: list of [x1, y1, x2, y2] bounding boxes in display-space

        Returns a dict with four fields so callers can pick what they need:
            'count_grid'    — (GRID_ROWS, GRID_COLS) int array: raw person count per cell
            'density_grid'  — (GRID_ROWS, GRID_COLS) float array: normalized 0.0–1.0
            'total_people'  — int: total detected people (sanity check vs YOLO count)
            'max_density'   — int: highest count in any single cell (useful for alerts)
            'anchors'       — list of (x, y) pixel coords, one per person (for debug overlay)
            'cell_assignments' — list of (row, col) per person (for debug overlay)

        Why return a dict instead of multiple values?
            As we add more fields in later steps (e.g. smoothed density, velocity),
            we can extend the dict without breaking any existing caller code.
        """
        # Initialise the count grid to all zeros for this frame
        count_grid = np.zeros((GRID_ROWS, GRID_COLS), dtype=np.int32)

        anchors = []
        cell_assignments = []

        for box in boxes:
            # Step 1: Find where this person is (their ground-contact point)
            ax, ay = self._get_anchor(box)
            anchors.append((ax, ay))

            # Step 2: Map that pixel position to a grid cell
            row, col = self._anchor_to_cell(ax, ay)
            cell_assignments.append((row, col))

            # Step 3: Increment the cell's count
            count_grid[row, col] += 1

        # Step 4: Normalize to 0.0–1.0 density
        # We normalize against the MAXIMUM count in any single cell,
        # not against the total. This makes the density relative to the
        # "most crowded spot in view" rather than the total crowd size.
        #
        # Why? Because the absolute count per cell depends on cell size and
        # camera resolution, which vary. But knowing "this cell is at 80% of
        # the max observed density" is meaningful regardless of setup.
        max_count = int(count_grid.max())

        if max_count > 0:
            # Float division produces values in [0.0, 1.0]
            density_grid = count_grid.astype(np.float32) / max_count
        else:
            # No people detected — all zeros, avoid division by zero
            density_grid = np.zeros((GRID_ROWS, GRID_COLS), dtype=np.float32)

        return {
            'count_grid':       count_grid,
            'density_grid':     density_grid,
            'total_people':     len(boxes),
            'max_density':      max_count,
            'anchors':          anchors,
            'cell_assignments': cell_assignments,
        }

    def get_cell_pixel_bounds(self, row: int, col: int) -> tuple[int, int, int, int]:
        """
        Returns the pixel bounding box (x1, y1, x2, y2) of a specific grid cell.

        This is used by the overlay module to draw grid lines and cell highlights.
        Having it here (rather than duplicating the math in overlay.py) keeps the
        grid geometry logic in one place — if we ever change the grid layout, we
        only need to update this class.
        """
        x1 = int(col * self.cell_w)
        y1 = int(row * self.cell_h)
        x2 = int((col + 1) * self.cell_w)
        y2 = int((row + 1) * self.cell_h)
        return x1, y1, x2, y2

    def get_density_stats(self, density_result: dict) -> dict:
        """
        Computes summary statistics across the whole grid — useful for the
        status bar display and for setting alert thresholds in later steps.

        Returns things like mean density, std deviation, and which cells are
        above various thresholds. We'll expand this in Steps 4 and 5 when we
        need to identify which cells have "gone critical".
        """
        count_grid = density_result['count_grid']
        density_grid = density_result['density_grid']

        # Cells with at least one person (ignore empty cells for meaningful stats)
        occupied = count_grid[count_grid > 0]

        return {
            'mean_density':    float(density_grid.mean()),
            'std_density':     float(density_grid.std()),
            'max_density':     density_result['max_density'],
            'occupied_cells':  int((count_grid > 0).sum()),
            'total_cells':     GRID_ROWS * GRID_COLS,
            'occupancy_pct':   float((count_grid > 0).mean() * 100),
            'mean_per_occupied': float(occupied.mean()) if len(occupied) > 0 else 0.0,
        }