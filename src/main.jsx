import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'

const TASKS_API_URL = typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1" || window.location.hostname.includes("serveousercontent") || window.location.hostname.includes("lhr.life") || window.location.hostname.includes("loca.lt"))
  ? "https://rmp-system.vercel.app/api/tasks"
  : "/api/tasks";

const USERS_API_URL = typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1" || window.location.hostname.includes("serveousercontent") || window.location.hostname.includes("lhr.life") || window.location.hostname.includes("loca.lt"))
  ? "https://rmp-system.vercel.app/api/users"
  : "/api/users";

function getApiUrl(key) {
  return key === "users" ? USERS_API_URL : TASKS_API_URL;
}

// Force-override window.storage to guarantee persistent database writes across refreshes
if (typeof window !== "undefined") {
  window.storage = {
    get: async (key, shared) => {
      if (shared) {
        try {
          const res = await fetch(`${getApiUrl(key)}?t=${Date.now()}`);
          if (!res.ok) {
            throw new Error(`API error: ${res.status}`);
          }
          const data = await res.json();
          return { value: JSON.stringify(data) };
        } catch (e) {
          console.error("Shared database read error", e);
          return null;
        }
      } else {
        try {
          const val = localStorage.getItem(key);
          return val ? { value: val } : null;
        } catch (e) {
          console.error("Storage read error", e);
          return null;
        }
      }
    },
    set: async (key, value, shared) => {
      if (shared) {
        try {
          const res = await fetch(getApiUrl(key), {
            method: "PUT",
            headers: {
              "Content-Type": "application/json"
            },
            body: value
          });
          return res.ok;
        } catch (e) {
          console.error("Shared database write error", e);
          return false;
        }
      } else {
        try {
          localStorage.setItem(key, value);
          return true;
        } catch (e) {
          console.error("Storage write error", e);
          return false;
        }
      }
    },
    delete: async (key, shared) => {
      if (shared) {
        try {
          const res = await fetch(getApiUrl(key), {
            method: "PUT",
            headers: {
              "Content-Type": "application/json"
            },
            body: "[]"
          });
          return res.ok;
        } catch (e) {
          console.error("Shared database delete error", e);
          return false;
        }
      } else {
        try {
          localStorage.removeItem(key);
          return true;
        } catch (e) {
          console.error("Storage delete error", e);
          return false;
        }
      }
    }
  };
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
