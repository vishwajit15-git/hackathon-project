# detectors/yolo_detector.py
# Person detection using YOLOv8, with two modes:
#
#   1. Full-frame inference — fast, good for nearby/large people
#   2. SAHI tiled inference — slower but catches small/distant people
#      by slicing the frame into overlapping tiles so each person appears
#      larger relative to YOLO's field of view
#
# Resolution decoupling: YOLO only sees INFERENCE_WIDTH x INFERENCE_HEIGHT
# frames. Detected boxes are then scaled back up to DISPLAY resolution
# before being handed to the overlay module. This gives you fast inference
# AND sharp display simultaneously.

import cv2
import numpy as np
from ultralytics import YOLO

from config import (
    YOLO_MODEL, CONFIDENCE_THRESHOLD, PERSON_CLASS_ID,
    INFERENCE_WIDTH, INFERENCE_HEIGHT,
    USE_SAHI, SAHI_SLICE_HEIGHT, SAHI_SLICE_WIDTH,
    SAHI_OVERLAP_RATIO, SAHI_CONFIDENCE, SAHI_IOU_THRESH,
    FRAME_WIDTH, FRAME_HEIGHT
)
from detectors.blob_detector import detect_blobs


class PersonDetector:
    """
    Wraps YOLOv8 inference with optional SAHI tiled detection.

    The key mental model for SAHI:
        Imagine you're trying to spot ants on a football field from a helicopter.
        If you look at the whole field at once, the ants are invisible. But if
        you hover over each section of the field one by one, you can spot them
        clearly. SAHI does exactly this — it divides the camera frame into
        overlapping "sections", runs YOLO on each, and stitches the results back.

    Scale factor:
        Since YOLO runs on a smaller resolution copy of the frame, the box
        coordinates it returns are in "inference space" (e.g. 640x360).
        We must multiply them by (display_w / inference_w, display_h / inference_h)
        to get coordinates that correctly map onto the full-resolution display frame.
    """

    def __init__(self):
        print(f"[YOLO] Loading model: {YOLO_MODEL}")
        self.model = YOLO(YOLO_MODEL)
        
        # Precompute the scale factors once — used every frame to map
        # inference-space boxes back to display-space coordinates
        self.scale_x = FRAME_WIDTH  / INFERENCE_WIDTH
        self.scale_y = FRAME_HEIGHT / INFERENCE_HEIGHT

        device = self._get_device()
        print(f"[YOLO] Model loaded. Device: {device}")
        print(f"[YOLO] Inference resolution: {INFERENCE_WIDTH}x{INFERENCE_HEIGHT}")
        print(f"[YOLO] SAHI tiled inference: {'ON' if USE_SAHI else 'OFF'}")

    def _get_device(self) -> str:
        import torch
        return "GPU (CUDA)" if torch.cuda.is_available() else "CPU"

    def _resize_for_inference(self, frame: np.ndarray) -> np.ndarray:
        """
        Shrinks the display-resolution frame down to inference resolution.
        This is the frame YOLO actually sees — smaller = faster inference.
        INTER_LINEAR is a good balance of speed and quality for downscaling.
        """
        return cv2.resize(frame, (INFERENCE_WIDTH, INFERENCE_HEIGHT),
                          interpolation=cv2.INTER_LINEAR)

    def _scale_boxes_to_display(self, boxes_inference: list) -> list:
        """
        Maps bounding boxes from inference-space back to display-space.

        Example: if inference is 640x360 and display is 1280x720,
        scale_x = 2.0 and scale_y = 2.0. A box at [100, 50, 200, 150]
        in inference space becomes [200, 100, 400, 300] in display space.
        """
        scaled = []
        for (x1, y1, x2, y2) in boxes_inference:
            scaled.append([
                int(x1 * self.scale_x),
                int(y1 * self.scale_y),
                int(x2 * self.scale_x),
                int(y2 * self.scale_y),
            ])
        return scaled

    # ──────────────────────────────────────────────────────────────────────────
    # Full-frame inference
    # ──────────────────────────────────────────────────────────────────────────

    def _detect_fullframe(self, small_frame: np.ndarray) -> list:
        """
        Standard single-pass YOLO inference on the full (inference-size) frame.
        Fast, but misses small/distant people because their pixels are tiny.
        Returns boxes in inference-space coordinates.
        """
        results = self.model(
            small_frame,
            conf=CONFIDENCE_THRESHOLD,
            classes=[PERSON_CLASS_ID],
            verbose=False
        )
        boxes = []
        for box in results[0].boxes:
            x1, y1, x2, y2 = box.xyxy[0].tolist()
            boxes.append([int(x1), int(y1), int(x2), int(y2)])
        return boxes

    # ──────────────────────────────────────────────────────────────────────────
    # SAHI tiled inference
    # ──────────────────────────────────────────────────────────────────────────

    def _generate_tiles(self, frame: np.ndarray) -> list[tuple]:
        """
        Divides the inference frame into overlapping tiles.

        Overlap is critical — without it, a person standing exactly on a tile
        boundary would be split across two tiles and missed by both. With 20%
        overlap, any person is guaranteed to appear fully inside at least one tile.

        Each tile is represented as:
            (tile_image, x_offset, y_offset)
        where (x_offset, y_offset) is the top-left corner of the tile in the
        original frame — needed to translate tile-local box coords back to
        frame coords after inference.
        """
        h, w = frame.shape[:2]
        tile_h = int(h * SAHI_SLICE_HEIGHT)
        tile_w = int(w * SAHI_SLICE_WIDTH)
        step_h = int(tile_h * (1 - SAHI_OVERLAP_RATIO))
        step_w = int(tile_w * (1 - SAHI_OVERLAP_RATIO))

        tiles = []
        y = 0
        while y < h:
            x = 0
            while x < w:
                # Clamp tile boundaries so we don't go out of frame
                y2 = min(y + tile_h, h)
                x2 = min(x + tile_w, w)
                tile = frame[y:y2, x:x2]
                tiles.append((tile, x, y))
                x += step_w
                if x + tile_w > w and x < w:
                    # Ensure we always cover the right edge
                    break
            y += step_h
            if y + tile_h > h and y < h:
                break

        return tiles

    def _run_yolo_on_tile(self, tile: np.ndarray) -> list:
        """
        Runs YOLO on a single tile. The tile is first resized to YOLO's
        native 640x640 input size (letterboxed internally by ultralytics).
        Returns boxes in tile-local coordinates.
        """
        results = self.model(
            tile,
            conf=SAHI_CONFIDENCE,
            classes=[PERSON_CLASS_ID],
            verbose=False,
            imgsz=640        # Force YOLO to its native resolution for each tile
        )
        boxes = []
        th, tw = tile.shape[:2]
        for box in results[0].boxes:
            # Boxes come back normalized to the tile — convert to pixel coords
            x1, y1, x2, y2 = box.xyxy[0].tolist()
            # Clamp to tile boundaries (YOLO can sometimes predict slightly outside)
            x1, y1 = max(0, int(x1)), max(0, int(y1))
            x2, y2 = min(tw, int(x2)), min(th, int(y2))
            boxes.append([x1, y1, x2, y2])
        return boxes

    def _translate_tile_boxes(self, boxes: list, x_offset: int, y_offset: int) -> list:
        """
        Shifts tile-local box coordinates back into full inference-frame coordinates
        by adding the tile's top-left offset. Simple but essential step —
        without this, all detections would cluster in the top-left corner.
        """
        return [
            [x1 + x_offset, y1 + y_offset, x2 + x_offset, y2 + y_offset]
            for (x1, y1, x2, y2) in boxes
        ]

    def _nms(self, boxes: list, iou_threshold: float) -> list:
        """
        Non-Maximum Suppression — removes duplicate boxes that arise when
        a person appears in multiple overlapping tiles and gets detected twice.

        The algorithm:
          1. Sort boxes by area (larger boxes first, as proxies for confidence)
          2. For each box, compute IoU (Intersection over Union) with all
             remaining boxes. IoU = overlap_area / union_area.
          3. Suppress (remove) any box whose IoU with the current box
             exceeds the threshold — it's a duplicate of the same person.

        IoU intuition: if two boxes overlap by >50% of their combined area,
        they're almost certainly detecting the same person.
        """
        if not boxes:
            return []

        boxes_arr = np.array(boxes, dtype=float)
        x1, y1, x2, y2 = boxes_arr[:,0], boxes_arr[:,1], boxes_arr[:,2], boxes_arr[:,3]
        areas = (x2 - x1) * (y2 - y1)

        # Sort by area descending
        order = areas.argsort()[::-1]
        keep = []

        while order.size > 0:
            i = order[0]
            keep.append(i)

            # Compute IoU of box i with all remaining boxes
            inter_x1 = np.maximum(x1[i], x1[order[1:]])
            inter_y1 = np.maximum(y1[i], y1[order[1:]])
            inter_x2 = np.minimum(x2[i], x2[order[1:]])
            inter_y2 = np.minimum(y2[i], y2[order[1:]])

            inter_w = np.maximum(0.0, inter_x2 - inter_x1)
            inter_h = np.maximum(0.0, inter_y2 - inter_y1)
            intersection = inter_w * inter_h

            union = areas[i] + areas[order[1:]] - intersection
            iou   = intersection / (union + 1e-6)

            # Keep only boxes with IoU below threshold (not duplicates)
            surviving = np.where(iou <= iou_threshold)[0]
            order = order[surviving + 1]

        return [boxes[k] for k in keep]

    def _detect_sahi(self, small_frame: np.ndarray) -> list:
        """
        Full SAHI pipeline:
          1. Tile the frame into overlapping patches
          2. Run YOLO on each patch individually
          3. Translate patch-local boxes back to frame coordinates
          4. Combine all detections and run NMS to remove duplicates

        Returns merged, deduplicated boxes in inference-space coordinates.
        """
        all_boxes = []
        tiles = self._generate_tiles(small_frame)

        for tile_img, x_off, y_off in tiles:
            tile_boxes = self._run_yolo_on_tile(tile_img)
            frame_boxes = self._translate_tile_boxes(tile_boxes, x_off, y_off)
            all_boxes.extend(frame_boxes)

        # Also run once on the full frame — catches people that span multiple tiles
        full_boxes = self._detect_fullframe(small_frame)
        all_boxes.extend(full_boxes)

        # NMS removes the inevitable duplicates from tile overlaps
        return self._nms(all_boxes, SAHI_IOU_THRESH)

    # ──────────────────────────────────────────────────────────────────────────
    # Public interface
    # ──────────────────────────────────────────────────────────────────────────

    def detect(self, display_frame: np.ndarray) -> tuple[list[list[int]], int]:
        """
        Main detection entry point. Accepts a full-resolution display frame,
        shrinks it for inference, runs detection (SAHI or full-frame depending
        on config), then scales boxes back up to display resolution.

        Also runs blob detection to catch head-like dark circular shapes
        (far-away crowd heads, black wrapped heads, bags, round hats) that
        YOLO misses when people are too small for its receptive field.

        Returns:
            boxes  — list of [x1, y1, x2, y2] in display-space coordinates
            count  — total number of people detected (YOLO + blobs)
        """
        # Step 1: Downscale for fast inference
        small_frame = self._resize_for_inference(display_frame)

        # Step 2: Detect in inference space (YOLO)
        if USE_SAHI:
            boxes_inference = self._detect_sahi(small_frame)
        else:
            boxes_inference = self._detect_fullframe(small_frame)

        # Step 3: Blob detection — finds head-like dark circular shapes
        # Pass inference-space YOLO boxes so blobs inside them are suppressed
        blob_boxes_display = detect_blobs(
            small_frame,
            yolo_boxes=boxes_inference,
            scale_x=self.scale_x,
            scale_y=self.scale_y
        )

        # Step 4: Scale YOLO boxes up to display resolution
        boxes_display = self._scale_boxes_to_display(boxes_inference)

        # Step 5: Merge YOLO + blob detections
        all_boxes = boxes_display + blob_boxes_display

        return all_boxes, len(all_boxes)