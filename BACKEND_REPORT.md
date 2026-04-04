# 🚀 Backend Technical Report: Smart Crowd Management System

## 1. Executive Summary
The backend layer of this project serves as the **"Safety & Logistics Coordinator"** for high-density environments (50k–100k daily visitors). It provides a high-throughput API for digital slot booking, real-time crowd telemetry, and automated emergency response.

---

## 2. Core Architecture & Tech Stack

### **Runtime: Node.js 24 + Express.js**
- **Why?**: We chose Node.js for its **non-blocking I/O model**. In a crowd emergency, the server must handle thousands of concurrent telemetry packets from CCTV sensors and mobile devices simultaneously. Node’s event loop ensures that safety-critical alerts are processed in sub-100ms windows.

### **Communication: Socket.io 4 (Bidirectional Telemetry)**
- **Why?**: Standard HTTP is unidirectional and slow. Socket.io provides persistent bi-directional channels. This allows the backend to "push" emergency alerts and updated crowd density heatmaps to all users instantly, rather than waiting for them to refresh.

### **Database: Firebase Firestore (Real-time NoSQL)**
- **Why?**: Firestore provides native **Real-time Snapshot listeners**. This means as soon as the ML service updates a zone's density, the dashboard and volunteer apps are notified via Firebase's internal sync engine, reducing latency across the global system.

---

## 3. Specialized Safety Modules

### **📊 Real-time Density Engine**
- **Logic**: The ML layer (YOLOv8) sends density data to the `/api/crowd/update` endpoint.
- **Workflow**: 
  1. Receive Person Count & Zone ID. 
  2. Calculate "Risk Score" based on predefined zone capacity. 
  3. Emit `crowd:update` via Socket.io.
  4. Record history in Firestore for 30-min trend forecasting.

### **🗺️ Dijkstra-Based "Safe Path" Routing**
Traditional GPS finds the *shortest* path; we find the *safest*.
- **Algorithm**: Dijkstra.
- **Implementation**: The "cost" of each path segment in our graph is calculated using **Current Crowd Density**. If Zone B is crowded, the cost of going through it increases, forcing the algorithm to route pilgrims through less congested zones (Zone D/E).
- **Service**: Located in `backend/services/dijkstraService.js`.

### **🔊 Automated Hindi Voice Alerts (Google TTS)**
- **Logic**: During a high-risk event (Stampede risk > 0.75), a specific Hindi alert is required.
- **Workflow**: The backend uses Google TTS to generate a dynamic Hindi voice broadcast. A Socket event `alert:voice` is broadcast to all active clients (PA speakers, volunteer handsets) with the audio URL for immediate playback.

---

## 4. API & Security Layer

- **Role-Based Access Control (RBAC)**: Using **Firebase Admin SDK**, we enforce strict role validation (`admin`, `police`, `medical`, `volunteer`, `user`).
- **Security Middleware**: 
  - **Helmet**: Shields the server from common web vulnerabilities (XSS, Clickjacking).
  - **Rate Limiting**: Throttles auth attempts to prevent brute-force attacks on the pilgrim portal.
  - **API Key Protection**: Restricts the high-speed telemetry routes to authenticated ML cameras only.

---

## 5. Development & Deployment
- **Environment**: Orchestrated via **Docker Compose**, separating the Node.js API from the Python-based ML inference services.
- **Scalability**: The backend is designed for horizontal scaling using the **Socket.io Redis Adapter**, allowing multiple server instances to share the same real-time state.

---

## ✅ Conclusions
This backend architecture prioritizes **Response Latency and Data Integrity**. By offloading heavy ML processing to specialized Python services while coordinating the response via Node.js, we satisfy both safety-critical speed and production-grade reliability. 🕵️‍♂️📊🎫🚨
