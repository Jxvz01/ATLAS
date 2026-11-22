# ATLAS (Adaptive Terrain Intelligence & Life-saving Action System)

> **Disaster intelligence. Adaptive response.**

ATLAS is an end-to-end geospatial disaster-response coordination and adaptive resource-allocation platform. Built as a serious emergency-management infrastructure system, ATLAS synchronizes state command, clinical healthcare facilities, field rescue personnel, and citizens in distress into a shared operational decision-support cycle.

---

## 🏛️ Architecture & Portals

ATLAS connects four dedicated, role-partitioned portals across a unified real-time state and deterministic intelligence engine:

### 1. 🌐 Public Gateway & Landing Page (`/`)
- Institutional portal gateway with an illustrative 3D network topology visualization.
- Instant routing to role-specific interfaces and direct access to the Civilian SOS application.

### 2. 🛡️ Admin Command Center (`/admin/dashboard` & `/admin/login`)
- **MapLibre GL Satellite Intelligence**: Real satellite layer (ESRI World Imagery over the Mysuru Urban Response Zone), street vector layers, real-time vehicle tracking (`R-04`), road blockage obstacles, and hazard inundation zones.
- **ATLAS AI Decision Support Engine**: Multi-factor priority scoring ($Priority = 0.35 \times S + 0.30 \times U + 0.20 \times E + 0.15 \times V$), explainable prioritization rationales, detour calculation avoiding road closures, and one-click dispatch.
- **Operational Metrics**: Active incidents, critical alarms, deployed units, and hospital intake telemetry.

### 3. 🏥 Hospital Operations Portal (`/hospital/dashboard` & `/hospital/login`)
- Designed for **K.R. Hospital, Mysuru** (`HOSP-01`) trauma and emergency intake.
- **Real-Time KPIs**: Total Beds (120), Available Beds (42), ICU Available (8), Occupancy Rate (65%), and Incoming ETA.
- **Incoming Case Triage**: Live referral cards with triage urgency, patient condition, required care protocols, and one-click acceptance that automatically reserves bed capacity in the backend.
- **Capacity Management**: Ward-level breakdown (General Ward, ICU, Trauma, Emergency) and quick bed adjustments with confirmation safeguards.

### 4. 🚨 Rescuer Tactical Terminal (`/rescue/dashboard` & `/rescue/login`)
- Field-ready operational terminal for unit **R-04 (Water Rescue / Boat Team)**.
- **Current Assignment**: Incident overview, location, required capability matching, and safe detour route map.
- **Mission Lifecycle Control**: Interactive stage progression (`ASSIGNED → ACKNOWLEDGED → EN ROUTE → ON SCENE → COMPLETED`) connected to the backend.
- **Quick Field Actions**: On-site situation reporting (casualties, water level, road status), backup requests, medical evacuation alerts, and verified mission resolution.

### 5. 📱 Civilian Mobile Application (`/app`)
- Mobile-first emergency assistance application.
- **One-Tap SOS**: Streamlined category selection (`Flooding`, `Medical Emergency`, `Trapped / Need Rescue`, `Road Blockage`).
- **Live Response Tracker**: Milestone tracking (`Request Received` → `Rescue Team Assigned` → `En Route` → `On Site`).
- Emergency contacts, shelter directories, and broadcast advisories.

---

## ⚙️ Tech Stack

- **Backend**: Python 3.10+, FastAPI, Pydantic v2, Uvicorn, Pytest.
- **Geospatial & Intelligence Engine**: Haversine distance computations, convex-hull obstacle avoidance routing, multi-criteria capability matching.
- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, Zustand, React Router v7.
- **Map Visualizations**: MapLibre GL, ESRI World Imagery satellite tiles.
- **Icons**: Lucide React.

---

## 🚀 Getting Started

### Prerequisites
- Python 3.10+
- Node.js 18+ & npm

### 1. Backend Setup
```bash
# Clone the repository
git clone https://github.com/Jxvz01/ATLAS.git
cd ATLAS

# Set up virtual environment
python -m venv venv
.\venv\Scripts\activate   # On Windows
# source venv/bin/activate # On Linux/macOS

# Install dependencies
pip install -r backend/requirements.txt

# Run backend test suite
pytest backend/tests -v

# Start the FastAPI server (running on port 8000)
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --app-dir backend
```

### 2. Frontend Setup
```bash
cd frontend

# Install dependencies
npm install

# Build for production (verifies TypeScript types & bundling)
npm run build

# Start the development server (running on port 5173)
npm run dev
```

Visit `http://localhost:5173` in your browser.

---

## 🔐 Credentials & Default Access

The system implements role-based route guards (`ProtectedRoute.tsx`). Use the following credentials to access the individual operational interfaces:

| Portal | Route | Identifier / Username | Access Code / Password |
| :--- | :--- | :--- | :--- |
| **Admin Command** | `/admin/login` | `admin` | `atlas2026` |
| **Hospital Operations** | `/hospital/login` | `kr_hospital` | `hospital123` |
| **Rescuer Terminal** | `/rescue/login` | `R-04` | `rescue123` |
| **Civilian App** | `/app` | *Public Access* | *No login required* |

---

## 🧪 Testing & Verification

The deterministic decision engine and geospatial routing logic are validated via automated tests:

```bash
$env:PYTHONPATH="backend"
pytest backend/tests -v
```

All 7 test suites pass, verifying priority scoring, capability matching, obstacle avoidance detour routing, and multi-portal state synchronization.

---

## 📄 License
This prototype is released for research, simulation, and emergency-response disaster management prototyping.
