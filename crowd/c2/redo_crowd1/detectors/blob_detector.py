# detectors/blob_detector.py
#
# Head-like Blob Detector — catches dark circular/elliptical shapes
# that YOLO misses when people are far away or partially occluded.
#
# These appear as: small dark dots, black bags on heads, round blobs
# from top-down angles, or any compact dark circular structure.
#
# Strategy:
#   1. Convert frame to grayscale
#   2. Apply CLAHE (adaptive histogram equalisation) to boost local contrast
#      so distant faint blobs become visible
#   3. Invert the image (dark objects become bright blobs)
#   4. Run OpenCV SimpleBlobDetector tuned for head-sized circles
#   5. Filter out blobs whose centres overlap with YOLO boxes (avoid double-count)
#   6. Return synthetic bounding boxes for remaining blobs

import cv2
import numpy as np


# ── Tuneable parameters ─────────────────────────────────────────────────────

# Expected head diameter range in PIXELS at your inference resolution (960x540).
# A head that is 15–60 px across covers near-medium crowd distances well.
# Increase BLOB_MAX_RADIUS for closer cameras; decrease for drone/CCTV overhead.
BLOB_MIN_RADIUS = 5    # px  — ignore blobs smaller than this (noise)
BLOB_MAX_RADIUS = 35   # px  — ignore blobs larger than this (not a head)

# How dark (0) or bright (255) must the blob be in the inverted image?
# Lower MIN_THRESHOLD = catch fainter blobs (more recall, more noise).
BLOB_MIN_THRESHOLD = 30
BLOB_MAX_THRESHOLD = 200

# Minimum circularity: 1.0 = perfect circle, 0.5 = roughly oval.
# Heads from above are roughly circular; bags may be more oval — keep low.
BLOB_MIN_CIRCULARITY = 0.45

# Minimum convexity: 1.0 = perfectly convex, 0.5 = allow concave shapes.
BLOB_MIN_CONVEXITY = 0.6

# Minimum inertia ratio: 1.0 = circle, 0.0 = line.
# Keeps roundish blobs and excludes elongated shapes (arms, pipes, etc.)
BLOB_MIN_INERTIA = 0.3

# Box expansion around each blob centre — how many pixels to pad
# on each side to produce the synthetic bounding box.
# Should match ~1 blob radius on each side.
BLOB_BOX_PADDING = 4

# Overlap suppression: a blob is suppressed if its centre falls within
# this many pixels of ANY existing YOLO bounding box (to avoid counting
# YOLO-detected people a second time via blob).
BLOB_YOLO_SUPPRESS_DIST = 12   # px

# CLAHE parameters for local contrast enhancement
CLAHE_CLIP_LIMIT    = 3.0
CLAHE_TILE_GRID     = (8, 8)

# ─────────────────────────────────────────────────────────────────────────────


def _build_blob_detector() -> cv2.SimpleBlobDetector:
    """Configure and return an OpenCV SimpleBlobDetector tuned for heads."""
    params = cv2.SimpleBlobDetector_Params()

    params.minThreshold = BLOB_MIN_THRESHOLD
    params.maxThreshold = BLOB_MAX_THRESHOLD
    params.thresholdStep = 10

    params.filterByArea = True
    params.minArea = np.pi * BLOB_MIN_RADIUS ** 2
    params.maxArea = np.pi * BLOB_MAX_RADIUS ** 2

    params.filterByCircularity = True
    params.minCircularity = BLOB_MIN_CIRCULARITY

    params.filterByConvexity = True
    params.minConvexity = BLOB_MIN_CONVEXITY

    params.filterByInertia = True
    params.minInertiaRatio = BLOB_MIN_INERTIA

    return cv2.SimpleBlobDetector_create(params)


# Module-level detector — built once, reused every frame
_detector = _build_blob_detector()


def _preprocess(frame: np.ndarray) -> np.ndarray:
    """
    Prepare the frame for blob detection:
      1. Greyscale  — blobs are defined by intensity, not colour
      2. CLAHE      — boosts local contrast so faint distant blobs pop
      3. Blur       — smooths pixel noise, helps blobs coalesce
      4. Invert     — SimpleBlobDetector finds BRIGHT blobs; we want dark ones
    """
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)

    clahe = cv2.createCLAHE(clipLimit=CLAHE_CLIP_LIMIT, tileGridSize=CLAHE_TILE_GRID)
    enhanced = clahe.apply(gray)

    blurred = cv2.GaussianBlur(enhanced, (5, 5), 0)
    inverted = cv2.bitwise_not(blurred)
    return inverted


def _centre_in_yolo_box(cx: float, cy: float, yolo_boxes: list) -> bool:
    """
    Returns True if blob centre (cx, cy) falls inside or very close to
    any existing YOLO bounding box — meaning YOLO already counted this person.
    """
    pad = BLOB_YOLO_SUPPRESS_DIST
    for (bx1, by1, bx2, by2) in yolo_boxes:
        if (bx1 - pad) <= cx <= (bx2 + pad) and (by1 - pad) <= cy <= (by2 + pad):
            return True
    return False


def detect_blobs(frame: np.ndarray, yolo_boxes: list,
                 scale_x: float = 1.0, scale_y: float = 1.0) -> list:
    """
    Detect head-like blobs in *frame* (inference-resolution BGR image).

    Args:
        frame      : BGR frame at inference resolution (e.g. 960 x 540)
        yolo_boxes : List of [x1,y1,x2,y2] boxes already found by YOLO
                     (inference-space coords). Used to suppress duplicates.
        scale_x    : Horizontal scale factor to convert blob boxes to display space.
        scale_y    : Vertical scale factor to convert blob boxes to display space.

    Returns:
        List of [x1, y1, x2, y2] bounding boxes in DISPLAY-space coordinates,
        one per new blob not already covered by a YOLO detection.
    """
    processed = _preprocess(frame)
    keypoints = _detector.detect(processed)

    new_boxes = []
    for kp in keypoints:
        cx, cy = kp.pt
        radius = max(BLOB_MIN_RADIUS, int(kp.size / 2))

        # Skip if YOLO already detected this person
        if _centre_in_yolo_box(cx, cy, yolo_boxes):
            continue

        # Build a synthetic bounding box around the blob centre
        pad = radius + BLOB_BOX_PADDING
        x1 = max(0, int(cx - pad))
        y1 = max(0, int(cy - pad))
        x2 = int(cx + pad)
        y2 = int(cy + pad)

        # Scale from inference space to display space
        new_boxes.append([
            int(x1 * scale_x),
            int(y1 * scale_y),
            int(x2 * scale_x),
            int(y2 * scale_y),
        ])

    return new_boxes
