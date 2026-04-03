# Smart Crowd Management & Slot Booking System

> Production-grade backend for managing **50,000–100,000 visitors/day** at large-scale crowd environments (Kumbh Mela, pilgrimage sites, stadiums).

---

## 🚀 Quick Start

### 1. Local Development
```bash
cd backend
cp .env.example .env        # fill in your values
npm install
npm run dev                 # nodemon hot-reload on :5000
```

### 2. Docker (Full Stack)
```bash
# From project root
docker-compose up --build   # starts backend + MongoDB + ML stub
```

Health check: `GET http://localhost:5000/health`

---

## 🏗️ Architecture

```
Client / CCTV / ML Service
        ↓
  Express REST API  ←→  Firebase Firestore
        ↓
   Socket.io (real-time)
        ↓
  Python ML Stub
```

---

## 📁 Project Structure

```
backend/
├── config/           # Firebase Admin, env validation
├── middleware/        # Firebase Auth, role-based access
├── controllers/       # Business logic handlers  
├── routes/           # Express route groups
├── services/         # Socket, geo (Dijkstra), voice TTS, assignment, notification
├── utils/            # QR generator, Haversine distance, Winston logger
├── sockets/          # Socket.io event handlers
├── serviceAccountKey.json # Firebase Credentials
└── server.js         # Entry point
```

---

## 🔐 Authentication & Roles

Firebase Auth (ID Tokens). Roles: `user | admin | police | medical | volunteer`

```bash
# Signup
POST /api/auth/signup
{ "name": "Ravi Kumar", "email": "ravi@example.com", "password": "Password123", "role": "user" }

# Login → receive Firebase ID Token
POST /api/auth/login
{ "email": "ravi@example.com", "password": "Password123" }
```

---

## 📡 API Reference

### Auth
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/auth/signup` | — | Register user |
| POST | `/api/auth/login` | — | Login, get JWT |
| GET | `/api/auth/me` | ✅ | Current user profile |
| PATCH | `/api/auth/update-location` | ✅ | Update GPS location |

### Slots
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/slots/create` | admin | Create time slot |
| GET | `/api/slots` | — | List slots (filter: date, zone, specialOnly) |
| POST | `/api/slots/book` | ✅ | Book slot (atomic, returns QR) |
| GET | `/api/slots/my-bookings` | ✅ | My bookings + QR codes |
| DELETE | `/api/slots/cancel/:bookingId` | ✅ | Cancel booking |

### Crowd
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/crowd/update` | admin/police | Update zone density → emits socket |
| GET | `/api/crowd/status` | — | All zones status + risk summary |
| GET | `/api/crowd/history/:zone` | admin | Historical crowd records |

### Collision / Stampede
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/collision/check` | — | ML pushes risk data → triggers protocol |
| GET | `/api/collision/risk` | admin/police | Query ML risk assessment |

### Alerts
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/alerts/create` | admin/police/medical | Create + broadcast alert |
| GET | `/api/alerts/active` | — | Active alerts |
| PATCH | `/api/alerts/:id/resolve` | admin | Resolve alert |
| GET | `/api/alerts/history` | admin | Paginated alert history |

### Missing Person
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/missing/report` | ✅ | Report missing person |
| GET | `/api/missing/status/:caseId` | ✅ | Case status |
| POST | `/api/missing/search` | admin/police | Trigger ML face match |
| GET | `/api/missing/all` | admin/police | All cases |

### Volunteer Force
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/volunteer/register` | admin | Activate volunteer (UID based) |
| GET | `/api/volunteer/all` | admin/police | List all volunteers (Sorted) |
| PATCH | `/api/volunteer/status` | ✅ | Update availability |

### Prediction & AI
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/prediction/crowd` | — | 30-min crowd forecast (Public) |
| POST | `/api/prediction/detect` | admin/police | CCTV frame detection |

### Hindi Voice Alerts
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/voice/generate` | admin/police | Dynamic Hindi TTS generation |
| POST | `/api/voice/alert` | admin/police | Trigger pre-defined Hindi alert |
| GET | `/api/voice/messages` | — | List Hindi templates |

---

## 📡 Socket.io Events

### Client → Server
| Event | Payload | Description |
|-------|---------|-------------|
| `join:room` | `{role, userId, zone}` | Join role/user/zone rooms |
| `crowd:manual-update` | `{zone, currentCount, totalCapacity}` | Admin crowd update |
| `crowd:get-status` | `{zone}` | Request zone status |
| `emergency:acknowledge` | `{alertId, acknowledgedBy, role}` | Acknowledge alert |
| `route:request` | `{fromZone, toZone, currentDensityMap}` | Request safe route |
| `evacuation:trigger` | `{zone, message, routes}` | Trigger zone evacuation |
| `volunteer:zone-update` | `{volunteerId, zone}` | Update volunteer zone |

### Server → Client
| Event | Description |
|-------|-------------|
| `crowd:update` | Zone density changed |
| `alert:emergency` | Emergency alert broadcast |
| `alert:voice` | Hindi audio URL for playback |
| `route:update` | Safe evacuation route |
| `missing:found` | Missing person located |
| `volunteer:task` | Task assigned to volunteer |
| `evacuation:order` | Zone evacuation order |

---

## 🚨 Stampede Response Flow

```
ML → POST /api/collision/check  { zone: "C", riskScore: 0.82 }
      ↓
  riskScore > 0.75 → STAMPEDE PROTOCOL:
  1. Create Alert (severity 5, type: stampede)
  2. Generate Hindi voice alert (Google TTS)
  3. Broadcast to ALL socket clients (alert:emergency + alert:voice)
  4. Dijkstra route to safe exit zones (J, I, G)
  5. Emit route:update to users in affected zone
  6. Auto-assign nearest available volunteer (emergency_handling)
  7. Notify police + medical rooms via socket
```

---

## 🗺️ Zone Map (Kumbh Mela Layout)

| Zone | Name | Type | Capacity |
|------|------|------|----------|
| A | Sangam Ghat (Main) | Ghat | 5,000 |
| B | Triveni Ghat | Ghat | 4,000 |
| C | Ram Ghat | Ghat | 3,500 |
| D | Market Area North | Market | 6,000 |
| E | Central Corridor | Corridor | 8,000 |
| F | Camp Area West | Camp | 10,000 |
| G | Medical Hub | Medical | 2,000 |
| H | Volunteer Center | Admin | 1,500 |
| I | Entry Gate Alpha | Entry | 3,000 |
| J | Parking & Exit | Exit | 15,000 |

---

## ⚙️ Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 5000 | Server port |
| `FIREBASE_API_KEY` | — | Required for login simulation |
| `FIREBASE_SERVICE_ACCOUNT` | — | Base64 Service Account (Optional) |
| `ML_SERVICE_URL` | http://localhost:8000 | FastAPI ML service |
| `STAMPEDE_RISK_THRESHOLD` | 0.75 | ML risk score threshold (0–1) |

---

## 🐳 Docker Services

| Service | Image | Port |
|---------|-------|------|
| `backend` | Node 20 Alpine | 5000 |
| `mongo` | mongo:7.0 | 27017 |
| `ml_service` | Python FastAPI stub | 8000 |

---

## 🧰 Tech Stack

| Layer | Technology |
|-------|------------|
| Runtime | Node.js 24 |
| Framework | Express.js |
| Database | Firebase Firestore |
| Real-time | Socket.io 4 |
| Auth | Firebase Admin SDK |
| ML Integration | Python (REST) |
| Routing Algo | Dijkstra |
| Voice TTS | Google Translate TTS |
| Logging | Winston |
| Deployment | Docker + Compose |
