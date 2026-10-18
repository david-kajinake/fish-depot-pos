# Fresh Victoria Fish POS

**Fresh Victoria Fish POS** is a high-performance, professional-grade business management and point-of-sale (POS) system built specifically for fish depots handling retail and wholesale distribution. Designed with a strictly decoupled, stateless architecture, the backend provides a robust REST API while the web frontend operates as a modern client-side application independent of Django server sessions.

---

## 🎨 Design Palette & Visual Identity

The interface is crafted using a clean, modern color palette optimized for high-volume operational speed and clarity:
*   **Ocean Blue (`#00509E`)**: Primary brand and header accent.
*   **Coral (`#FF6B6B`)**: Action warnings and attention badges.
*   **Emerald Green (`#10B981`)**: Positive balances, successful transactions, and stock indicators.

---

## 🚀 Architecture & Technical Highlights

*   **Stateless Authentication**: Powered by **SimpleJWT** for all client devices (web frontend, desktop app, mobile app). Token-authenticated endpoints keep the server decoupled with zero reliance on Django server sessions.
*   **Asynchronous Background Tasks**: Utilizes **Celery** backed by **Redis** to offload heavy operations, such as dynamic ReportLab PDF generation and automated email dispatches, ensuring zero UI lag.
*   **Client-Driven UI Permitting**: HTML templates serve as a neutral shell; permissions and role-based feature gating (e.g., Admin Automation tabs) are evaluated dynamically on the client via `/api/auth/me/`.
*   **Containerized Environment**: Fully containerized using **Docker Compose** for seamless multi-service orchestration (Django web server, Celery worker, and Redis broker).

---

## 🛠️ Tech Stack

*   **Backend**: Python, Django, Django REST Framework (DRF), SimpleJWT, Celery, Redis.
*   **Frontend**: Vanilla JavaScript (ES Modules), HTML5, CSS3, Chart.js.
*   **Document Generation**: ReportLab (dynamic PDF statement compilation).
*   **Database**: SQLite (Development) / PostgreSQL compatible.
*   **DevOps & Infrastructure**: Docker, Docker Compose.

---

## 📦 Core Modules & Features

1. **Inventory & Supply Management**:
   - Live stock tracking by fish sizes and weights.
   - Supply invoice logging and supplier history tracking.
2. **Customer & Supplier Directories**:
   - Comprehensive customer and supplier profiles.
   - Debt balance tracking, payment ledger management, and purchase history views.
3. **Automated & Manual PDF Statements**:
   - Asynchronous PDF statement generation for customer balances, sales history, supplier deliveries, and expenses using **ReportLab**.
   - Direct email dispatch via SMTP.
4. **Expense Tracking & Analytics**:
   - Daily expense grouping with multi-view comparison charts (Time & Item analytics via Chart.js).
5. **Admin User Management & Granular Permission Matrix**:
   - Toggleable Table and Card views for registered staff and operators.
   - SQL-style permission matrix allowing fine-grained control over operations:
     * *Can call it a day*
     * *Can record sales & stock supply*
     * *Can record expenses & debt payments*
     * *Can send customer messages (SMS/WhatsApp)*
     * *Can edit customer/supplier information*
     * *Can generate statements*
6. **Dynamic Settings & Automation**:
   - System automation rules (auto-send receipts, automated bills, full-day statement dispatches, suspicious login alerts).
   - Personal display preferences (dark/light themes, font family, scaling, notification sounds).

---

## 🚀 Getting Started & Installation

### Prerequisites
*   Python 3.13+
*   Docker & Docker Compose (Recommended)
*   Redis (If running locally without Docker)

### Option 1: Running with Docker Compose (Recommended)
Spin up the entire stack (Django, Redis, and Celery worker) simultaneously:

1. Clone the repository:
   ```bash
   git clone https://github.com/david-kajinake/fish-depot-pos.git
   cd fish-depot-pos

2. Create a separate branch with your prefered name
3. Add your modifications
4. Commit and push to the branch you created
5. Create a pull request 