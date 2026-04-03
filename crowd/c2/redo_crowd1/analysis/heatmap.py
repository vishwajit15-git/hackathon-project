# analysis/heatmap.py
# Converts the discrete density grid from Step 2 into a continuous scalar field
# using Gaussian kernel convolution.
#
# The pipeline is three steps:
#   1. Gaussian smooth  — spread each cell's count into neighbours via bell curve
#   2. Re-normalise     — bring values back to [0.0, 1.0] after smoothing
#   3. Render           — map the float field to a BGR colour image for display
#
# The output of this module is a full-resolution BGR image (same size as the
# camera frame) that can be blended directly onto the video feed.

import cv2
import numpy as np
from scipy.ndimage import gaussian_filter

from config import (
    GRID_ROWS, GRID_COLS,
    FRAME_WIDTH, FRAME_HEIGHT,
    HEATMAP_SIGMA, HEATMAP_ALPHA,
    HEATMAP_COLORMAP, HEATMAP_BLUR_UPSCALE
)


class HeatmapGenerator:
    """
    Transforms a discrete count grid into a smooth continuous heatmap image.

    The key insight is that we work at TWO resolutions intentionally:
      - Grid resolution (GRID_ROWS × GRID_COLS = 9×16): where the Gaussian
        smoothing happens. Working at grid resolution keeps the convolution
        very cheap — we're blurring a 9×16 array, not a 720×1280 image.
      - Frame resolution (FRAME_HEIGHT × FRAME_WIDTH): the final upscaled
        colour image that gets blended onto the video. Upscaling a smooth
        field produces smooth results; upscaling a discrete grid produces
        blocky pixel art. That's the whole reason we smooth FIRST then upscale.

    Think of it like this: a weather radar works on a coarse grid of maybe
    100×100 cells, applies smoothing so pressure fronts look like smooth
    gradients, then renders that smooth field onto a high-resolution map.
    Same principle here.
    """

    def __init__(self):
        print(f"[Heatmap] Sigma: {HEATMAP_SIGMA} | Alpha: {HEATMAP_ALPHA} | "
              f"Colormap: {HEATMAP_COLORMAP}")

    def _smooth(self, count_grid: np.ndarray) -> np.ndarray:
        """
        Applies a 2D Gaussian filter to the raw count grid.

        scipy's gaussian_filter is a separable convolution — it applies a 1D
        Gaussian along rows, then a 1D Gaussian along columns. This is
        mathematically identical to a full 2D convolution with a Gaussian kernel
        but much faster (O(n) vs O(n²) in the kernel size).

        The sigma parameter controls the width of the bell curve in grid-cell
        units. sigma=1.0 means the influence of one cell falls to ~37% at one
        cell away, and ~2% at two cells away. sigma=2.0 spreads influence
        further — a person's presence is felt two or three cells away.

        mode='reflect' means the filter treats the grid as if it were mirrored
        at the edges, which avoids the artificial darkening at frame borders
        that you'd get with zero-padding.
        """
        smoothed = gaussian_filter(
            count_grid.astype(np.float32),
            sigma=HEATMAP_SIGMA,
            mode='reflect'
        )
        return smoothed

    def _normalise(self, smoothed: np.ndarray) -> np.ndarray:
        """
        Rescales the smoothed field so its maximum value is exactly 1.0
        and its minimum is 0.0.

        Why is this necessary after smoothing? The Gaussian kernel redistributes
        energy across cells but doesn't preserve the maximum value. A cell that
        had a count of 5 might end up with a smoothed value of 3.2 because some
        of its "energy" was shared with neighbours. Without normalisation, the
        colour mapping would be inconsistent between frames — a frame with 10
        people might look dimmer than a frame with 20 people even if the
        relative distribution is identical.

        After normalisation, the colour always spans the full range from
        blue (least dense region in THIS frame) to red (most dense region),
        which makes the heatmap maximally informative regardless of crowd size.

        Edge case: if the entire frame is empty (max=0), we return all zeros
        rather than dividing by zero.
        """
        max_val = smoothed.max()
        if max_val < 1e-6:
            return np.zeros_like(smoothed)
        return smoothed / max_val

    def _upscale_and_colourise(self, normalised: np.ndarray) -> np.ndarray:
        """
        Converts the normalised float grid into a full-resolution BGR colour image.

        The pipeline here is:
          1. Scale float values [0,1] → uint8 values [0,255]
          2. Optionally apply a secondary Gaussian blur AFTER upscaling
             (HEATMAP_BLUR_UPSCALE) to eliminate any residual blockiness from
             the bilinear interpolation step
          3. Apply OpenCV's built-in colormap to map grayscale → colour

        We use INTER_CUBIC for upscaling rather than INTER_LINEAR because
        cubic interpolation produces smoother gradients — it considers a 4×4
        neighbourhood rather than just the 2×2 nearest pixels, which gives
        a genuinely smooth result rather than one with subtle linear kinks.

        The colormap (default COLORMAP_JET) maps:
            0   → blue   (empty / safe)
            128 → green/yellow (moderate density)
            255 → red    (critical density)
        This is the same scale used in thermal cameras, weather radar, and
        MRI scans — humans have strong intuitions about "hot = red = danger".
        """
        # Step 1: float [0,1] → uint8 [0,255]
        as_uint8 = (normalised * 255).astype(np.uint8)

        # Step 2: upscale from grid resolution to frame resolution
        # We go via an intermediate size if HEATMAP_BLUR_UPSCALE is set,
        # which allows us to do a gentle post-upscale blur on a manageable array
        upscaled = cv2.resize(
            as_uint8,
            (FRAME_WIDTH, FRAME_HEIGHT),
            interpolation=cv2.INTER_CUBIC
        )

        # Step 3 (optional): soft blur after upscaling to remove any remaining
        # blockiness. Kernel size 15 gives a gentle softening without losing
        # the spatial structure of the heatmap.
        if HEATMAP_BLUR_UPSCALE:
            upscaled = cv2.GaussianBlur(upscaled, (15, 15), sigmaX=0)

        # Step 4: apply the colormap — converts single-channel grayscale
        # to a 3-channel BGR colour image
        colormap_id = getattr(cv2, HEATMAP_COLORMAP, cv2.COLORMAP_JET)
        coloured = cv2.applyColorMap(upscaled, colormap_id)

        return coloured

    def generate(self, count_grid: np.ndarray) -> dict:
        """
        Full pipeline: count grid → smoothed field → normalised field → colour image.

        Returns a dict so callers can access intermediate results if needed —
        for example, Step 4 will consume 'normalised' directly to compute
        gradients, bypassing the colour rendering step entirely.

        Fields:
            'smoothed'    — float array (GRID_ROWS × GRID_COLS), post-Gaussian values
            'normalised'  — float array (GRID_ROWS × GRID_COLS), values in [0.0, 1.0]
            'heatmap_bgr' — uint8 array (FRAME_HEIGHT × FRAME_WIDTH × 3), colour image
        """
        smoothed   = self._smooth(count_grid)
        normalised = self._normalise(smoothed)
        heatmap    = self._upscale_and_colourise(normalised)

        return {
            'smoothed':    smoothed,
            'normalised':  normalised,
            'heatmap_bgr': heatmap,
        }

    def blend_onto_frame(self, frame: np.ndarray, heatmap_bgr: np.ndarray) -> np.ndarray:
        """
        Blends the heatmap colour image onto the video frame using HEATMAP_ALPHA
        as the transparency of the heatmap layer.

        The formula is:  output = alpha * heatmap + (1 - alpha) * frame
        At alpha=0.5 you see equal parts heatmap and video.
        At alpha=0.3 the video dominates and the heatmap is a subtle overlay.
        At alpha=0.7 the heatmap dominates — useful for analysis screenshots
        where you want maximum colour contrast over visual realism.

        We use cv2.addWeighted rather than manual numpy multiplication because
        it handles the uint8 saturation correctly and is implemented in C++ —
        much faster than doing the blend in Python/numpy for a 1280×720 image.
        """
        return cv2.addWeighted(heatmap_bgr, HEATMAP_ALPHA,
                               frame, 1.0 - HEATMAP_ALPHA, 0)