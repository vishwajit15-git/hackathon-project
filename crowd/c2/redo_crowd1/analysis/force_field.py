# analysis/force_field.py
# Computes a vector force field from the smooth normalised density field.
#
# Physical model — Social Force Theory:
#   In dense crowds, people experience pressure from their neighbours.
#   This pressure pushes individuals away from high-density zones toward
#   lower-density zones, analogous to pressure in a fluid.
#
#   The force at each cell is:   F = -∇ρ
#   where ρ (rho) is the normalised density field and ∇ρ is its spatial gradient.
#
#   The gradient ∇ρ = (∂ρ/∂x, ∂ρ/∂y) points in the direction of steepest
#   INCREASE in density. Negating it gives the direction people would naturally
#   move to relieve pressure — toward lower density.
#
#   The MAGNITUDE of the force (|F|) represents how strongly people in that
#   cell are being pushed — a gentle gradient → small force → manageable flow.
#   A steep gradient → large force → potential dangerous surge.
#
# Why use np.gradient() on the smoothed field (not the raw count grid)?
#   Gradients on a hard-edged discrete grid produce artificial spikes at every
#   cell boundary — not physically meaningful. The Gaussian-smoothed normalised
#   field from Step 3 has genuine spatial continuity, so its gradient accurately
#   represents the rate of density change across the crowd.

import numpy as np
from config import FORCE_MAGNITUDE_SCALE, FORCE_MIN_DENSITY_THRESHOLD


class ForceFieldCalculator:
    """
    Computes per-cell force vectors and resultant force magnitudes from
    the smooth normalised density field produced by HeatmapGenerator.

    Output structure (returned by compute()):
        'force_x'       — 2D float array: x-component of force at each cell
        'force_y'       — 2D float array: y-component of force at each cell
        'magnitude'     — 2D float array: |F| = sqrt(Fx² + Fy²), normalised 0→1
        'direction_deg' — 2D float array: angle in degrees (0=right, 90=down)
        'resultant_x'   — scalar: sum of all x-forces (net horizontal crowd flow)
        'resultant_y'   — scalar: sum of all y-forces (net vertical crowd flow)
        'resultant_mag' — scalar: magnitude of the whole-scene resultant force
        'resultant_deg' — scalar: direction of the whole-scene resultant force
    """

    def __init__(self):
        print(f"[ForceField] Scale: {FORCE_MAGNITUDE_SCALE} | "
              f"Min density threshold: {FORCE_MIN_DENSITY_THRESHOLD}")

    def compute(self, normalised_density: np.ndarray) -> dict:
        """
        Full force field computation from a normalised density grid.

        Args:
            normalised_density — float32 array of shape (GRID_ROWS, GRID_COLS)
                                  with values in [0.0, 1.0], from HeatmapGenerator

        Step-by-step:
          1. np.gradient() computes finite-difference derivatives along each axis.
             It returns (grad_y, grad_x) — note the axis order matches numpy's
             row-major layout where axis 0 = rows = y direction.

          2. We negate both components because force = -gradient:
             high density on the right → gradient points right → force points LEFT
             (pushing people away from the dense zone).

          3. We zero out forces in cells below FORCE_MIN_DENSITY_THRESHOLD.
             Empty or near-empty cells produce numerically noisy gradients that
             don't represent real crowd dynamics — they're just floating-point
             noise from the Gaussian tail.

          4. We scale force components by FORCE_MAGNITUDE_SCALE to make the
             arrows visible when rendered. Without scaling, a max gradient of
             ~0.3 between adjacent cells would produce tiny invisible arrows.

          5. Magnitude and direction are derived geometrically from (Fx, Fy).

          6. The RESULTANT force is the vector sum of all per-cell forces —
             it tells you the dominant direction of crowd movement across the
             entire scene. Think of it as the "average pressure direction".
        """
        rows, cols = normalised_density.shape

        # Step 1: compute spatial gradients
        # np.gradient returns derivatives along each axis in axis order (y, x)
        # grad_y = how fast density changes moving DOWN (row direction)
        # grad_x = how fast density changes moving RIGHT (column direction)
        grad_y, grad_x = np.gradient(normalised_density)

        # Step 2: force = negative gradient (push away from density increase)
        force_x = -grad_x * FORCE_MAGNITUDE_SCALE
        force_y = -grad_y * FORCE_MAGNITUDE_SCALE

        # Step 3: suppress forces in nearly-empty cells
        # Without this, Gaussian tails in sparse regions create phantom forces
        mask = normalised_density < FORCE_MIN_DENSITY_THRESHOLD
        force_x[mask] = 0.0
        force_y[mask] = 0.0

        # Step 4: magnitude at each cell — how hard is the crowd being pushed?
        magnitude = np.sqrt(force_x**2 + force_y**2)

        # Normalise magnitude to [0, 1] for consistent colour/arrow rendering
        max_mag = magnitude.max()
        magnitude_normalised = magnitude / (max_mag + 1e-8)

        # Step 5: direction in degrees (atan2 gives angle from positive x-axis)
        # We use atan2(force_y, force_x): 0° = right, 90° = down, 180° = left
        direction_deg = np.degrees(np.arctan2(force_y, force_x))

        # Step 6: scene-level resultant force (vector sum of all cell forces)
        # This gives a single arrow summarising the dominant crowd flow direction
        resultant_x = float(force_x.sum())
        resultant_y = float(force_y.sum())
        resultant_mag = float(np.sqrt(resultant_x**2 + resultant_y**2))
        resultant_deg = float(np.degrees(np.arctan2(resultant_y, resultant_x)))

        return {
            'force_x':          force_x,
            'force_y':          force_y,
            'magnitude':        magnitude_normalised,
            'direction_deg':    direction_deg,
            'resultant_x':      resultant_x,
            'resultant_y':      resultant_y,
            'resultant_mag':    resultant_mag,
            'resultant_deg':    resultant_deg,
            # Raw (unscaled, unnormalised) for Step 5 propagation logic
            'magnitude_raw':    magnitude,
        }

    def get_critical_cells(self, force_result: dict,
                           magnitude_threshold: float = 0.5) -> list[tuple[int,int]]:
        """
        Returns (row, col) indices of cells whose force magnitude exceeds
        the given threshold. These are the "at-risk" cells where crowd
        pressure is high enough to trigger propagation analysis in Step 5.

        magnitude_threshold: fraction of the max normalised magnitude (0–1).
        0.5 means "cells in the top 50% of force magnitude".
        """
        mag = force_result['magnitude']
        rows, cols = np.where(mag >= magnitude_threshold)
        return list(zip(rows.tolist(), cols.tolist()))