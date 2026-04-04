# 🚀 Smart Crowd Management & Slot Booking System

> A production-grade, AI-powered ecosystem designed to manage **50,000–100,000 visitors/day** in high-density environments like the Kumbh Mela, pilgrimage sites, and stadiums.

---

## 📂 Project Overview
This project provides a real-time safety and logistics layer for large-scale human gatherings. By combining **YOLOv8 Computer Vision**, **Firebase Real-time Sync**, and **Dijkstra-based Navigation**, we create a system that prevents stampedes, locates missing persons, and optimizes pilgrim flow through digital slot booking.

---

## 🛠️ The Tech Stack (The "Why")

### **Frontend: React 19 + Vite**
- **Why?**: We chose React 19 for its improved concurrent rendering, which is essential for dashboards that receive hundreds of telemetry updates per second. **Vite** provides near-instant HMR (Hot Module Replacement) for rapid development during high-pressure hackathon cycles.
- **Styling**: Vanilla CSS with modern Glassmorphism for a premium, high-visibility UI (Police/Admin focus).

### **Backend: Node.js + Express.js**
- **Why?**: Node's event-driven, non-blocking I/O model is perfect for handling high-frequency socket connections from CCTV sensors and mobile devices without bottlenecking the system.

### **Database: Firebase Firestore**
- **Why?**: Firestore's built-in real-time listeners allow our dashboards to update instantly as soon as the ML service detects a person or a booking is made, avoiding the lag of traditional polling.

### **ML Monitoring: YOLOv8 + SAHI + OpenCV SFace**
- **Why (YOLOv8)**: We use YOLOv8s for its state-of-the-art speed-to-accuracy ratio in real-time object detection.
- **Why (SAHI)**: Slicing Aided Hyper Inference (Tiling) is used to detect small human figures in high-altitude or dense CCTV shots where traditional models often fail.
- **Why (SFace)**: For missing persons, we use the SFace model for high-precision face matching that runs natively on the backend via OpenCV's DNN module.

### **Real-time Pipeline: Socket.io 4**
- **Why?**: Standard HTTP is too slow for emergency situations. Socket.io provides persistent bi-directional channels for sub-100ms telemetry delivery and mass-broadcasting alerts.

### **Geo-Routing: Dijkstra Algorithm**
- **Why?**: For stampede prevention, we need to calculate the *safest* route out of a crowded zone, not just the shortest. Our Dijkstra implementation weights zone "density" as the primary cost.

---

## 🚀 Key Features

- **📊 Multi-Zone Crowd Monitoring**: Real-time density calculation across 10+ zones with heatmaps and vector overlays.
- **🕵️ AI Missing Person Identification**: Visual scan monitor that identifies target individuals across surveillance feeds.
- **🎟️ Digital Slot Booking**: Atomic booking system with QR code generation for streamlined entry-pass management.
- **🚨 Automated Stampede Protocol**: AI-triggered evacuations with dynamic Hindi voice alerts and safe-routing guidance.
- **👥 Role-Based Access (RBAC)**: Dedicated interfaces for Admin, Police, Medical personnel, and Volunteers.
- **🔊 Hindi Voice Alerts**: Dynamic TTS generation for clear, emergency communication with pilgrims.

---

## 🏗️ Service Architecture & Port Map

| Component | Port | Purpose |
| :--- | :--- | :--- |
| **Backend API** | `5000` | Business logic, RBAC, and Firestore interface. |
| **Frontend Web** | `5173` | React Dashboard for staff and users. |
| **Crowd ML Dashboard**| `7860` | Gradio interface for real-time crowd telemetry. |
| **Person AI Tracker** | `7861` | Gradio interface for visual missing person search. |
| **ML REST API** | `8000` | Background face-matching and detection service. |

---

## ⚙️ Quick Start

### 1. Prerequisites
- Node.js 24+
- Python 3.12+ (configured in a `.venv`)
- Firebase Service Account Key (`backend/serviceAccountKey.json`)

### 2. Environment Setup
Create a `.env` in the `backend/` directory:
```env
PORT=5000
FIREBASE_SERVICE_ACCOUNT=(base64 string if not using file)
ML_SERVICE_URL=http://localhost:8000
ML_API_KEY=ml-crowd-dev-secret-2024
```

### 3. Execution
Run the following in separate terminals:
- **Backend**: `cd backend && npm run dev`
- **Frontend**: `cd frontend && npm run dev`
- **ML Monitoring**: `python crowd/c2/redo_crowd1/main.py`
- **AI Search**: `python person-detection/backend/missing_person_matcher.py`

---

## 🐳 Docker Deployment
```bash
# From project root
docker-compose up --build
```
*Note: Ensure your `serviceAccountKey.json` is present for the backend container.*
