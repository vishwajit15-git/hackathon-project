# sources/webcam_source.py
# Handles live webcam / USB camera feed initialization

import cv2
from config import FRAME_WIDTH, FRAME_HEIGHT


def open_webcam_capture(camera_index: int = 0) -> cv2.VideoCapture:
    """
    Opens a webcam capture at the given device index.
    Index 0 = built-in/default camera, 1 = first external USB camera, etc.
    
    We also set the frame resolution here so frames coming out of this
    capture are already at our target size — avoids resizing every single frame.
    """
    cap = cv2.VideoCapture(camera_index)

    if not cap.isOpened():
        raise RuntimeError(
            f"Could not open camera at index {camera_index}. "
            f"Check if your webcam is connected and not in use by another app."
        )

    # Request our preferred resolution from the camera
    # Note: the camera may not support it exactly and will pick the closest match
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, FRAME_WIDTH)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, FRAME_HEIGHT)

    actual_w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    actual_h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    print(f"[Webcam] Opened camera {camera_index} at {actual_w}x{actual_h}")

    return cap