# main.py — Crowd Management System (Camera View + Force Field) - FULL FORCE

import cv2
import time
import os
import sys
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import gradio as gr

from config import (
    FRAME_WIDTH, FRAME_HEIGHT, FRAME_SKIP,
    OUTPUT_DIR, GRADIO_PORT, GRADIO_SHARE,
    DEFAULT_SHOW_HEATMAP, DEFAULT_SHOW_GRID_OVERLAY, DEFAULT_SHOW_BOXES,
    DEFAULT_SHOW_ANCHORS, DEFAULT_SHOW_STATS, DEFAULT_SHOW_FORCES,
    GRID_ROWS, GRID_COLS, FORCE_CRITICAL_THRESHOLD
)
DEFAULT_SHOW_FORCES = True
from detectors.yolo_detector import PersonDetector
from analysis.density import DensityCalculator
from analysis.heatmap import HeatmapGenerator
from analysis.force_field import ForceFieldCalculator
from visualization.overlay import (
    draw_person_boxes, draw_anchor_points, draw_density_grid,
    draw_density_stats, draw_force_arrows,
    draw_count_panel, draw_frame_info,
)


print("[Init] Loading YOLO model...")
detector     = PersonDetector()
density_calc = DensityCalculator()
heatmap_gen  = HeatmapGenerator()
force_calc   = ForceFieldCalculator()

os.makedirs(OUTPUT_DIR, exist_ok=True)

def get_available_videos():
    video_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "video")
    os.makedirs(video_dir, exist_ok=True)
    try:
        files = [f for f in os.listdir(video_dir) if f.lower().endswith(('.mp4', '.avi', '.mov', '.mkv'))]
        paths = [f"video/{f}" for f in files]
        return ["0"] + paths
    except Exception:
        return ["0"]

def determine_source(source_input: str):
    s = source_input.strip()
    if s.isdigit():
        return int(s), 'webcam', f'Webcam [{s}]'
    lower = s.lower()
    if 'youtube.com' in lower or 'youtu.be' in lower:
        return s, 'youtube', 'YouTube'
    if lower.startswith('rtsp://'):
        return s, 'rtsp', 'RTSP Camera'
    return s, 'file', 'Video File'


def open_capture(source, source_type: str):
    if source_type == 'webcam':
        from sources.webcam_source import open_webcam_capture
        return open_webcam_capture(camera_index=source)
    elif source_type == 'youtube':
        from sources.youtube_source import open_youtube_capture
        return open_youtube_capture(youtube_url=source)
    else:
        cap = cv2.VideoCapture(source)
        if source_type == 'rtsp':
            cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        if not cap.isOpened():
            raise RuntimeError(f"Could not open: {source}")
        return cap


def stream_video(source_input, target_zone, show_heatmap, show_grid, show_boxes,
                 show_anchors, show_stats, show_forces):
    import requests
    import threading

    def push_to_backend(count, zone):
        try:
            requests.post("http://localhost:5000/api/crowd/update", json={
                "zone": zone,
                "currentCount": count,
                "totalCapacity": 2000,
                "source": "camera"
            }, headers={"x-api-key": "ml-crowd-dev-secret-2024"}, timeout=1)
        except Exception:
            pass
    try:
        source, source_type, source_label = determine_source(source_input)
        cap = open_capture(source, source_type)
    except Exception as e:
        yield None, f"❌ Error opening source: {e}"
        return

    frame_number = 0
    last_boxes = []
    last_density_result = density_calc.compute([])
    last_heatmap_result = heatmap_gen.generate(last_density_result.get('count_grid', np.zeros((GRID_ROWS, GRID_COLS))))
    last_force_result = force_calc.compute(last_heatmap_result.get('normalised', np.zeros((GRID_ROWS, GRID_COLS))))
    last_stats = density_calc.get_density_stats(last_density_result)

    fps_display = 0.0
    fps_start_time = time.time()
    fps_frame_count = 0
    last_push_time = time.time()

    print(f"[Stream] Started: {source_label} for {target_zone}")

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        frame_number += 1
        fps_frame_count += 1
        frame = cv2.resize(frame, (FRAME_WIDTH, FRAME_HEIGHT))

        if frame_number % (FRAME_SKIP + 1) == 0 or frame_number == 1:
            last_boxes, _ = detector.detect(frame)
            last_density_result = density_calc.compute(last_boxes)
            last_stats = density_calc.get_density_stats(last_density_result)
            last_heatmap_result = heatmap_gen.generate(last_density_result.get('count_grid', np.zeros((GRID_ROWS, GRID_COLS))))
            last_force_result = force_calc.compute(last_heatmap_result.get('normalised', np.zeros((GRID_ROWS, GRID_COLS))))

        if fps_frame_count >= 30:
            elapsed = time.time() - fps_start_time
            fps_display = fps_frame_count / elapsed
            fps_frame_count = 0
            fps_start_time = time.time()

        if time.time() - last_push_time >= 2.0:
            current_count = last_density_result.get('total_people', 0)
            threading.Thread(target=push_to_backend, args=(current_count, target_zone)).start()
            last_push_time = time.time()

        annotated = frame.copy()

        if show_heatmap:
            annotated = heatmap_gen.blend_onto_frame(annotated, last_heatmap_result.get('heatmap_bgr', np.zeros_like(frame)))
        if show_grid:
            annotated = draw_density_grid(annotated, last_density_result, density_calc, show_counts=True, show_grid_lines=True)
        if show_boxes:
            annotated = draw_person_boxes(annotated, last_boxes)
        if show_anchors:
            annotated = draw_anchor_points(annotated, last_density_result.get('anchors', []))
        if show_forces:
            annotated = draw_force_arrows(annotated, last_force_result, density_calc)

        annotated = draw_count_panel(annotated, last_density_result.get('total_people', 0), fps_display)
        if show_stats:
            annotated = draw_density_stats(annotated, last_stats)
        annotated = draw_frame_info(annotated, frame_number, source_label)

        critical = force_calc.get_critical_cells(last_force_result, FORCE_CRITICAL_THRESHOLD)
        yield cv2.cvtColor(annotated, cv2.COLOR_BGR2RGB), (
            f"▶ {source_label} | Frame: {frame_number} | "
            f"People: {last_density_result.get('total_people', 0)} | "
            f"Peak: {last_stats.get('max_density', 0)} | "
            f"Critical: {len(critical)} | "
            f"Net force: {last_force_result.get('resultant_deg', 0):.0f}° | "
            f"FPS: {fps_display:.1f}"
        )

    cap.release()
    yield None, f"✅ Stream ended after {frame_number} frames."


with gr.Blocks(title="Crowd Management System", theme=gr.themes.Soft()) as demo:
    gr.Markdown("# 🚶 Crowd Management System\n### Camera View + Force Field (FULL FORCE MODE)")

    with gr.Row():
        with gr.Column(scale=1):
            with gr.Row():
                source_box = gr.Dropdown(label="Video Source", choices=get_available_videos(), value="0", allow_custom_value=True)
                refresh_btn = gr.Button("🔄 Refresh", size="sm")
            
            zone_box = gr.Dropdown(label="Target Zone", choices=["ZONE_A", "ZONE_B", "ZONE_C"], value="ZONE_A")
                
            gr.Markdown("**Visual layers**")
            show_heatmap = gr.Checkbox(label="🌡 Heatmap", value=DEFAULT_SHOW_HEATMAP)
            show_grid    = gr.Checkbox(label="📊 Discrete grid", value=DEFAULT_SHOW_GRID_OVERLAY)
            show_boxes   = gr.Checkbox(label="📦 Person boxes", value=DEFAULT_SHOW_BOXES)
            show_anchors = gr.Checkbox(label="📍 Anchor points", value=DEFAULT_SHOW_ANCHORS)
            show_forces  = gr.Checkbox(label="➡ Force arrows", value=True)
            show_stats   = gr.Checkbox(label="📈 Stats panels", value=DEFAULT_SHOW_STATS)

            start_btn = gr.Button("▶ Start Stream", variant="primary")
            stop_btn  = gr.Button("⏹ Stop", variant="stop")

        with gr.Column(scale=3):
            video_out = gr.Image(label="Live Feed (Camera View + Force Field)", streaming=True, height=540)
            status_box = gr.Textbox(label="Status", interactive=False, max_lines=1)

    start_btn.click(
        fn=stream_video,
        inputs=[source_box, zone_box, show_heatmap, show_grid, show_boxes, show_anchors, show_stats, show_forces],
        outputs=[video_out, status_box],
        show_progress=False
    )
    
    refresh_btn.click(
        fn=lambda: gr.update(choices=get_available_videos()), 
        inputs=[], 
        outputs=[source_box]
    )

def run_multi_zone_daemon():
    print("\n[Daemon] Starting background multi-zone telemetry sync...")
    import requests
    API_URL = "http://localhost:5000/api/crowd/update"
    API_KEY = "ml-crowd-dev-secret-2024"
    ZONES = {
        "ZONE_A": "video/Zone_A.mp4",
        "ZONE_B": "video/Zone_B.mp4",
        "ZONE_C": "video/Zone_C.mp4"
    }

    bg_detector = PersonDetector()
    bg_density_calc = DensityCalculator()
    
    captures = {}
    frame_counters = {}
    last_push_time = {}
    for zone, video_path in ZONES.items():
        base_dir = os.path.dirname(os.path.abspath(__file__))
        full_path = os.path.join(base_dir, video_path)
        if os.path.exists(full_path):
            cap = cv2.VideoCapture(full_path)
            if cap.isOpened():
                captures[zone] = cap
                frame_counters[zone] = 0
                last_push_time[zone] = 0
                print(f"[Daemon] Attached {zone}")
    
    while True:
        try:
            for zone, cap in captures.items():
                ret, frame = cap.read()
                if not ret:
                    cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                    ret, frame = cap.read()
                    if not ret: continue

                frame_counters[zone] += 1
                if frame_counters[zone] % (FRAME_SKIP + 1) == 0 or frame_counters[zone] == 1:
                    frame = cv2.resize(frame, (FRAME_WIDTH, FRAME_HEIGHT))
                    boxes, _ = bg_detector.detect(frame)
                    density_result = bg_density_calc.compute(boxes)
                    current_count = density_result.get('total_people', 0)
                    
                    if time.time() - last_push_time[zone] >= 3.0:
                        try:
                            # Silent background post
                            requests.post(API_URL, json={
                                "zone": zone,
                                "currentCount": int(current_count),
                                "totalCapacity": 2000,
                                "source": "camera"
                            }, headers={"x-api-key": API_KEY}, timeout=2)
                        except Exception:
                            pass
                        last_push_time[zone] = time.time()
            time.sleep(0.01)
        except Exception:
            time.sleep(1)

if __name__ == "__main__":
    import threading
    daemon_thread = threading.Thread(target=run_multi_zone_daemon, daemon=True)
    daemon_thread.start()

    print(f"\n{'='*70}")
    print("  Crowd Management System — FULL FORCE MODE (Multi-Zone Active)")
    print(f"  UI running at http://localhost:{GRADIO_PORT}")
    print(f"{'='*70}\n")
    demo.launch(server_port=GRADIO_PORT, share=GRADIO_SHARE, inbrowser=True)