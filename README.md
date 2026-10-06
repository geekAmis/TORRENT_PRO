# 🚀 TORRENT_PRO <a href="https://secommu.com"><img src="https://img.shields.io/badge/LIVE_DEMO-secommu.com-brightgreen?style=for-the-badge&logo=googlechrome" alt="Live Demo"></a>



[![FastAPI](https://img.shields.io/badge/FastAPI-005571?style=for-the-badge&logo=fastapi)](https://fastapi.tiangolo.com/)
[![Libtorrent](https://img.shields.io/badge/Libtorrent-Python-blue?style=for-the-badge)](https://www.libtorrent.org/)
[![PostgreSQL](https://img.shields.io/badge/SQLAlchemy-Database-blue?style=for-the-badge)](https://www.sqlalchemy.org/)
[![Google OAuth](https://img.shields.io/badge/Auth-Google_OAuth-red?style=for-the-badge)](https://developers.google.com/identity/sign-in/web/guides/overview)

---
## 🖥️ Interface Preview
<table style="width: 100%; border-collapse: collapse; border: none;">
  <tr>
    <td style="padding: 5px; border: none; width: 50%;">
      <img src="https://github.com/user-attachments/assets/5901c87f-e49e-462f-8ede-4619892ce4d2" alt="Screenshot 1" style="width: 100%; border-radius: 8px; border: 1px solid #30363d;">
    </td>
    <td style="padding: 5px; border: none; width: 50%;">
      <img src="https://github.com/user-attachments/assets/d9812c7c-aace-4c76-b2c7-0ace5acb668d" alt="Screenshot 2" style="width: 100%; border-radius: 8px; border: 1px solid #30363d;">
    </td>
  </tr>
</table>
<p align="center">
  <img src="https://github.com/user-attachments/assets/d9812c7c-aace-4c76-b2c7-0ace5acb668d" width="30%" style="border-radius: 5px; margin: 5px;">
  <img src="https://github.com/user-attachments/assets/d2684602-6959-466c-a8a7-fc3c1fbcad4c" width="30%" style="border-radius: 5px; margin: 5px;">
  <img src="https://github.com/user-attachments/assets/973bb67f-38b3-4ac6-8ab3-edc4651b75a2" width="30%" style="border-radius: 5px; margin: 5px;">
</p>

<p align="center">
  <img src="https://github.com/user-attachments/assets/44b5efbc-c22b-4a71-a968-29ca94ee3f76" width="30%" style="border-radius: 5px; margin: 5px;">
  <img src="https://github.com/user-attachments/assets/53446dbe-0b9a-4025-923c-003a830cd563" width="30%" style="border-radius: 5px; margin: 5px;">
</p>



A high-performance, scalable, and multi-user Torrent Management Backend. This system allows users to add torrents via Magnet links or `.torrent` files, manage downloads, and respect subscription-based resource limits (MB and Torrent counts).

## ✨ Key Features

### 🛡️ Advanced User Management
* **Google OAuth2 Integration:** Seamless and secure authentication via Google.
* **Subscription System:** Tiered access levels. Admins can define limits for:
    * `MB Limit`: Maximum total data a user can download.
    * `Torrent Limit`: Maximum number of active torrents allowed per user.
* **Automated Profiling:** Automatic user creation and profile syncing (avatar/email) upon first login.

### 📥 Torrent Engine (Powered by libtorrent)
* **Hybrid Adding:** Support for both **Magnet Links** and **Physical `.torrent` files**.
* **Smart Resume:** On server restart, the system automatically scans the database and resumes all incomplete downloads.
* **Real-time Monitoring:** Asynchronous background tasks monitor download speed, progress, peer count, and states.
* **Global Library Sharing:** If a user adds a torrent that is already being downloaded by someone else in the system, it is instantly "linked" to their library without wasting extra bandwidth.

### 👨‍💼 Admin Dashboard API
* **User Oversight:** Monitor all users, their download statistics, and subscription statuses.
* **Subscription Management:** Create new tiers and assign them to users on the fly.
* **System Control:** Full control over the torrent ecosystem.

---

## 🏗️ Architecture

The project follows a modern asynchronous architecture:

* **Backend:** `FastAPI` for high-concurrency API requests.
* **Frontend:** `Flask` just for up without nginx.
* **Torrent Core:** `libtorrent` wrapped in `asyncio` tasks for non-blocking monitoring.
* **Database:** `SQLAlchemy` with `PostgreSQL` (or SQLite) for persistent storage of user data, file metadata, and subscription tiers.
* **Concurrency:** Uses `asyncio.create_task` to run independent torrent monitors for every active hash.

---

## 🛠️ Tech Stack

| Component | Technology |
| :--- | :--- |
| **Language** | Python 3.9+ |
| **Web Framework** | FastAPI |
| **Torrent Engine** | libtorrent |
| **Authentication** | Authlib (Google OAuth2) + JWT |
| **ORM** | SQLAlchemy |
| **Task Management** | Asyncio |

---

## 🚀 Getting Started

### Prerequisites
* Python 3.9+
* `libtorrent` installed on your system
* Google Cloud Console Project (for OAuth credentials)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/geekAmis/TORRENT_PRO.git
   cd TORRENT_PRO
   ```

2. **Install dependencies**
   ```bash
   python3 -m venv venv && source venv/bin/activate
   pip install -r requirements.txt
   ```

3. **Environment Configuration**
   Create a `.env` file or update `config/init.py` with your credentials:
   ```env
   GOOGLE_CLIENT_ID=your_id.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=your_secret
   SECRET_KEY=your_super_secret_jwt_key
   ADMIN_EMAILS={'admin@example.com', ...}
   ...
   ```

4. **Run the API server**
   ```bash
   uvicorn main:app --host 127.0.0.1 --port 8000 --proxy-headers --forwarded-allow-ips '*'
   ```

5. **Run the WEB Client**
   ```bash
   cd ./web
   unicorn -w 4 -b 127.0.0.1:80 app:app
   ```
---

## 🛣️ API Roadmap

| Endpoint | Method | Description | Auth |
| :--- | :--- | :--- | :--- |
| `/auth/login` | `GET` | Redirect to Google Login | Public |
| `/torrent/file` | `POST` | Upload `.torrent` file | User |
| `/torrent/magnet`| `POST` | Add via Magnet link | User |
| `/torrent/all` | `GET` | Get user's torrent list | User |
| `/torrent/download/{hash}`| `GET` | Download a completed file | User |
| `/admin/users` | `GET` | Get all users list | Admin |
| `and more` | `more` | more | more |

---

## 📝 License

Distributed under the MIT License. See `LICENSE` for more information.

---
**Built with ❤️ for the Cyberpunk Tech Enthusiast.**

---
