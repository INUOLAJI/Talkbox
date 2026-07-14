# Talkbox — Frontend

A real-time chat application built with React and Vite. Supports private messaging, group chats, file sharing, profile management, and dark mode.

## 🚀 Live App

**Live URL:** [https://talkbox-git-main-inuolajis-projects.vercel.app](https://talkbox-git-main-inuolajis-projects.vercel.app)

**Frontend Repo:** [https://github.com/INUOLAJU/Talkbox.git](https://github.com/INUOLAJU/Talkbox.git)

---

## 🛠 Tech Stack

| Tool | Purpose |
|------|---------|
| React 19 | UI framework |
| Vite 8 | Build tool & dev server |
| React Router v7 | Client-side routing |
| Bootstrap 5 | Styling & layout |
| Lucide React | Icons |
| WebSocket (native) | Real-time messaging |

---

## 📦 Features

- JWT authentication (login / register)
- Real-time messaging via WebSocket
- Private and group chat rooms
- File & image uploads (max 5MB)
- Unread message badges with live polling
- Online/offline presence indicators
- Profile settings (name, phone, bio, avatar)
- Dark / Light theme with persistence
- Sidebar chat search
- Mobile responsive layout
- 5-hour inactivity auto-logout

---

## ⚙️ Local Setup

### Prerequisites
- Node.js 18+

### Installation

```bash
# Clone the repo
git clone https://github.com/INUOLAJU/Talkbox.git
cd Talkbox/frontend

# Install dependencies
npm install
```

### Environment Variables

Create a `.env` file in the `frontend/` directory:

```env
VITE_API_BASE_URL=http://127.0.0.1:8000
VITE_WS_BASE_URL=ws://127.0.0.1:8000
```

> For production, replace with your deployed backend URL.

### Run the dev server

```bash
npm run dev
```

App will be available at `http://localhost:5173`

### Build for production

```bash
npm run build
```

---

## 🗂 Project Structure

```
frontend/
├── public/
│   ├── favicon.svg
│   └── icons.svg
├── src/
│   ├── assets/
│   ├── components/
│   │   ├── Auth.jsx        # Login & register forms
│   │   └── Dashboard.jsx   # Main chat UI
│   ├── App.jsx             # Routes & auth guard
│   ├── App.css
│   ├── index.css           # Global styles & dark mode
│   └── main.jsx
├── index.html
├── package.json
└── vite.config.js
```

---

## 🔌 Backend

This frontend connects to the Talkbox Django backend.

**Backend Repo:** [https://github.com/INUOLAJU/Talkbox-backend.git](https://github.com/INUOLAJU/Talkbox-backend.git)

---

> Backend API: [https://talkbox-backend.onrender.com](https://talkbox-backend.onrender.com)

## 📄 License

MIT
