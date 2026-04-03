import cv2
import time
import os
import sys
import requests

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from config import FRAME_WIDTH, FRAME_HEIGHT, FRAME_SKIP
from detectors.yolo_detector import PersonDetector
from analysis.density import DensityCalculator

# Configuration
API_URL = "http://localhost:5000/api/crowd/update"
API_KEY = "ml-crowd-dev-secret-2024"

# Zone -> Video Path Mapping
ZONES = {
    "ZONE_A": "video/Zone_A.mp4",
    "ZONE_B": "video/Zone_B.mp4",
    "ZONE_C": "video/Zone_C.mp4"
}

def push_to_backend(zone, count):
    """Pushes a sync payload containing crowd counts to the backend API"""
    try:
        requests.post(API_URL, json={
            "zone": zone,
            "currentCount": int(count),
            "totalCapacity": 2000,
            "source": "camera"
        }, headers={"x-api-key": API_KEY}, timeout=2)
    except requests.RequestException:
        pass  # Fails safe silently, continuing loop

def main():
    print("=" * 65)
    print("  Smart Crowd Headless Orchestrator (Multi-Zone Sync)")
    print("=" * 65)
    
    print("\n[Init] Loading YOLO Model (Instance 1)...")
    detector = PersonDetector()
    density_calc = DensityCalculator()

    captures = {}
    frame_counters = {}
    last_push_time = {}

    for zone, video_path in ZONES.items():
        if os.path.exists(video_path):
            cap = cv2.VideoCapture(video_path)
            if cap.isOpened():
                captures[zone] = cap
                frame_counters[zone] = 0
                last_push_time[zone] = 0
                print(f"[Init] Mapped & Opened {zone} -> '{video_path}'")
            else:
                print(f"[-] Hardware Failed to open '{video_path}'")
        else:
            print(f"[-] Video missing locally: '{video_path}'")

    if not captures:
        print("[!] No active video streams attached. Halting framework.")
        return

    print("\n[Stream] Launching Round-Robin parallel inference loops...\n")

    try:
        # Round Robin to ensure safe inference memory allocation
        while True:
            for zone, cap in captures.items():
                ret, frame = cap.read()
                
                # Infinite Loop the MP4s organically
                if not ret:
                    cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                    ret, frame = cap.read()
                    if not ret: continue

                frame_counters[zone] += 1
                
                # Perform model processing spaced out appropriately
                if frame_counters[zone] % (FRAME_SKIP + 1) == 0 or frame_counters[zone] == 1:
                    frame = cv2.resize(frame, (FRAME_WIDTH, FRAME_HEIGHT))
                    # Safely share instances via round-robin yields
                    boxes, _ = detector.detect(frame)
                    density_result = density_calc.compute(boxes)
                    current_count = density_result.get('total_people', 0)
                    
                    # Update live dashboard every 3 seconds per zone
                    if time.time() - last_push_time[zone] >= 3.0:
                        push_to_backend(zone, current_count)
                        last_push_time[zone] = time.time()
                        print(f"[{zone} LIVE] Detected: {current_count:03d} persons -> Syncing Telemetry")

            # Mini sleep avoids local CPU locking between global yields
            time.sleep(0.01)

    except KeyboardInterrupt:
        print("\n[Stop] Orchestrator manually interrupted. Releasing memory.")
    except Exception as e:
        print(f"\n[Crash] {e}")
    finally:
        for cap in captures.values():
            cap.release()

if __name__ == "__main__":
    main()
