# 📖 Smart Crowd Management API Reference (Complete)

This document outlines **strictly all** available REST API endpoints in the Smart Crowd Management System. Use these details to build your Postman collections.

> **Base URL:** `http://localhost:5000/api`
> **Authentication:** Bearer tokens used in `Authorization` header (`Bearer <YOUR_JWT>`) for protected routes.

---

## 1. Authentication APIs (`/auth`)

### 1.1 Register User

- **URL:** `POST /api/auth/signup`
- **Auth Required:** No
- **Validation:** Handles duplicate email (`409`) and duplicate phone number (`409`).
- **Method Body (JSON):**

```json
{
  "name": "Ravi Kumar",
  "email": "ravi@example.com",
  "password": "Password123",
  "phone": "9876543210",
  "role": "user" 
}
```

### 1.2 Login User

- **URL:** `POST /api/auth/login`
- **Auth Required:** No
- **Note:** All roles (`admin`, `user`, `police`, `volunteer`, `medical`) use this endpoint to login.
- **Method Body (JSON):**

```json
{
  "email": "ravi@example.com",
  "password": "Password123"
}
```

### 1.3 Admin Create User (Staff Creation)

- **URL:** `POST /api/auth/admin/create-user`
- **Auth Required:** Yes (Role: `admin`)
- **Description:** Only an Admin can officially create personnel accounts.
- **Method Body (JSON):**

```json
{
  "name": "Arjun Volunteer",
  "email": "arjun@example.com",
  "password": "Password123",
  "phone": "9876543210",
  "role": "volunteer" 
}
```

### 1.4 Get Current User

- **URL:** `GET /api/auth/me`
- **Auth Required:** Yes

### 1.5 Update Live Location

- **URL:** `PATCH /api/auth/update-location`
- **Auth Required:** Yes
- **Note:** Internally stores coordinates as Firestore GeoPoints.
- **Method Body (JSON):**

```json
{
  "latitude": 25.4358,
  "longitude": 81.8463,
  "zone": "ZONE_A"
}
```

---

## 2. Slot Booking APIs (`/slots`)

### 2.1 Create Slot (Admin only)

- **URL:** `POST /api/slots`
- **Auth Required:** Yes (Role: `admin`)
- **Method Body (JSON):**

```json
{
  "date": "2025-01-14",
  "startTime": "09:00",
  "endTime": "11:00",
  "zone": "SANGAM_NORTH",
  "totalCapacity": 5000,
  "specialSlot": false
}
```

### 2.2 Get Available Slots

- **URL:** `GET /api/slots?date=2025-01-14&zone=SANGAM_NORTH&specialOnly=false`
- **Auth Required:** No

### 2.3 Book a Slot

- **URL:** `POST /api/slots/book`
- **Auth Required:** Yes
- **Method Body (JSON):**

```json
{
  "slotId": "651a2b3c4d5e6f...",
  "groupSize": 3,
  "isFamily": true,
  "isSpecialNeeds": false
}
```

### 2.4 Get My Bookings

- **URL:** `GET /api/slots/my-bookings`
- **Auth Required:** Yes

### 2.5 Cancel Booking

- **URL:** `DELETE /api/slots/cancel/:bookingId`
- **Auth Required:** Yes

---

## 3. Crowd Monitoring APIs (`/crowd`)

### 3.1 Get Current Crowd Status

- **URL:** `GET /api/crowd/status`
- **Auth Required:** No

### 3.2 Update Crowd (Sensor/Camera hook)

- **URL:** `POST /api/crowd/update`
- **Auth Required:** Yes (Role: `admin` or valid system token)
- **Method Body (JSON):**

```json
{
  "zone": "ZONE_C",
  "currentCount": 1250,
  "totalCapacity": 2000,
  "source": "sensor"
}
```

### 3.3 Get Crowd History (Admin)

- **URL:** `GET /api/crowd/history/ZONE_C?limit=50`
- **Auth Required:** Yes (Role: `admin`)

---

## 4. Emergency & Alert APIs (`/alerts`)

### 4.1 Trigger Emergency Alert

- **URL:** `POST /api/alerts`
- **Auth Required:** Yes (Role: `admin`, `police`)
- **Method Body (JSON):**

```json
{
  "type": "STAMPEDE_RISK",
  "zone": "ZONE_A",
  "severity": "critical",
  "message": "Immediate crowd dispersal required at Gate 3.",
  "requiresEvacuation": true
}
```

### 4.2 Get Active Alerts

- **URL:** `GET /api/alerts/active`
- **Auth Required:** No

### 4.3 Get Alert History

- **URL:** `GET /api/alerts/history?limit=20`
- **Auth Required:** Yes (Role: `admin`)

### 4.4 Resolve Alert

- **URL:** `POST /api/alerts/:id/resolve`
- **Auth Required:** Yes (Role: `admin`, `police`)
- **Method Body (JSON):**

```json
{
  "resolutionNotes": "Crowd successfully managed. Normal flow resumed."
}
```

---

## 5. Missing Persons APIs (`/missing`)

### 5.1 Report Missing Person

- **URL:** `POST /api/missing`
- **Auth Required:** Yes
- **Method Body (JSON):**

```json
{
  "name": "Aarav Singh",
  "age": 7,
  "gender": "male",
  "description": "Wearing blue shirt. Last seen near lost and found booth.",
  "lastSeenZone": "ZONE_B",
  "photoUrl": "https://bucket.aws.com/photo.jpg"
}
```

### 5.2 Get Active Missing Cases

- **URL:** `GET /api/missing`
- **Auth Required:** Yes

### 5.3 Get All Missing Cases (Admin)

- **URL:** `GET /api/missing/all?limit=50`
- **Auth Required:** Yes (Role: `admin`, `police`)

### 5.4 Search Missing Person via Camera (ML Hook)

- **URL:** `POST /api/missing/search`
- **Auth Required:** Yes
- **Method Body (JSON):**

```json
{
  "caseId": "651a2b3c4...",
  "imageBase64": "data:image/jpeg;base64,/9j/4AAQSkZJRg..."
}
```

### 5.5 Update Missing Case Status

- **URL:** `PATCH /api/missing/:id/status`
- **Auth Required:** Yes (Role: `police`, `volunteer`, `admin`)
- **Method Body (JSON):**

```json
{
  "status": "found",
  "zone": "ZONE_C",
  "foundLocation": {
    "type": "Point",
    "coordinates": [81.8463, 25.4358]
  },
  "foundBy": "volunteer_user_uid"
}
```

---

## 6. Volunteer APIs (`/volunteer`)

### 6.1 Register as Volunteer (Activation)

- **URL:** `POST /api/volunteer/register`
- **Auth Required:** Yes (Role: `admin`)
- **Description:** Activation step for a volunteer user account. Assigns them to a Zone.
- **Method Body (JSON):**

```json
{
  "uid": "volunteer_user_uid",
  "zone": "ZONE_A",
  "longitude": 81.8463,
  "latitude": 25.4358
}
```

### 6.2 Get My Active Tasks

- **URL:** `GET /api/volunteer/tasks`
- **Auth Required:** Yes (Role: `volunteer`)

### 6.3 Update Volunteer Status

- **URL:** `PATCH /api/volunteer/status`
- **Auth Required:** Yes (Role: `volunteer`)
- **Method Body (JSON):**

```json
{
  "status": "available",
  "zone": "ZONE_A"
}
```

### 6.4 Update Location

- **URL:** `PATCH /api/volunteer/location`
- **Auth Required:** Yes (Role: `volunteer`)
- **Method Body (JSON):**

```json
{
  "longitude": 81.8463,
  "latitude": 25.4358,
  "zone": "ZONE_A"
}
```

### 6.5 Complete Assigned Task

- **URL:** `PATCH /api/volunteer/complete-task`
- **Auth Required:** Yes (Role: `volunteer`)

### 6.6 Get All Volunteers (Admin)

- **URL:** `GET /api/volunteer/all?limit=50`
- **Auth Required:** Yes (Role: `admin`)

---

## 7. Intelligent System APIs (`/prediction`, `/collision`, `/voice`)

### 7.1 Stampede Protocol Testing Hook

- **URL:** `POST /api/collision/stampede-protocol`
- **Auth Required:** No
- **Method Body (JSON):**

```json
{
  "currentCrowd": [
    { "zone": "ZONE_A", "headCount": 6000, "capacity": 5000 }
  ]
}
```

### 7.2 Get Crowd Prediction

- **URL:** `GET /api/prediction/crowd`
- **Auth Required:** No
- **Description:** Publicly accessible endpoint for crowd forecasting dashboards. Generates a 30-minute trend analysis.

### 7.3 Generate Hindi Voice Broadcast

- **URL:** `POST /api/voice/generate`
- **Auth Required:** Yes (Role: `admin`)
- **Method Body (JSON):**

```json
{
  "text": "Please remain calm and move slowly towards exit gate.",
  "language": "hi-IN"
}
```
