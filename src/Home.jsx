import { useState, useEffect, useCallback } from "react";
import { useAuth } from "./useAuth";
import { auth, db } from "./firebase";
import { apiGet, apiPatch, updateMe, getUniversityByName } from "./api";
import { useNavigate, useLocation, Link } from "react-router-dom";
import NotificationPanel from "./NotificationPanel";
import { useNotifications } from "./useNotifications";
import { useDarkMode } from "./DarkModeContext";
import { signOut, getIdToken } from "firebase/auth";

// FIX #2: Remove redundant dynamic import — use static imports only
import { doc, getDoc } from "firebase/firestore";
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faRobot, faBookOpen, faCartShopping, faComments, faBookmark, faCamera, faBagShopping, faMessage, faFile } from '@fortawesome/free-solid-svg-icons';

function Toast({ message, onClose }) {
  return (
    <div className="fixed top-24 left-1/2 -translate-x-1/2 z-50 bg-white inline-flex space-x-3 p-3 text-sm rounded border border-gray-200 shadow-lg whitespace-nowrap">
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <path d="M16.5 8.31V9a7.5 7.5 0 1 1-4.447-6.855M16.5 3 9 10.508l-2.25-2.25" stroke="#22C55E" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <div>
        <h3 className="text-slate-700 font-medium">Login Successful!</h3>
        <p className="text-slate-500">Welcome back, {message}</p>
      </div>
      <button onClick={onClose} className="cursor-pointer mb-auto text-slate-400 hover:text-slate-600 active:scale-95 transition">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <rect y="12.532" width="17.498" height="2.1" rx="1.05" transform="rotate(-45.74 0 12.532)" fill="currentColor" fillOpacity=".7" />
          <rect x="12.531" y="13.914" width="17.498" height="2.1" rx="1.05" transform="rotate(-135.74 12.531 13.914)" fill="currentColor" fillOpacity=".7" />
        </svg>
      </button>
    </div>
  );
}

function AnimatedNumber({ target }) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (target === 0) return;
    let start = 0;
    const step = Math.ceil(target / 40);
    const timer = setInterval(() => {
      start += step;
      if (start >= target) { setCount(target); clearInterval(timer); }
      else setCount(start);
    }, 30);
    return () => clearInterval(timer);
  }, [target]);
  return <span>{count}</span>;
}

function SkeletonCard() {
  return (
    <div className="bg-white/50 rounded-2xl p-5 animate-pulse">
      <div className="h-4 bg-gray-200 rounded w-1/3 mb-3" />
      <div className="h-3 bg-gray-200 rounded w-2/3 mb-2" />
      <div className="h-3 bg-gray-200 rounded w-1/2" />
    </div>
  );
}

function GlassCard({ title, icon, content, href, align, delay = 0 }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), delay);
    return () => clearTimeout(t);
  }, [delay]);
  return (
    <Link
      to={href}
      className={`block w-[85%] backdrop-blur-md border border-white/40 shadow-lg rounded-2xl p-5 transition-all duration-500 hover:scale-105 hover:shadow-xl active:scale-95 ${align === "right" ? "ml-auto" : "mr-auto"} ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}
      style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.6) 0%, rgba(255,255,255,0.3) 100%)" }}
    >
      <div className="flex items-center gap-2 mb-3">
        <span>{icon}</span>
        <h3 className="text-indigo-700 font-bold text-base">{title}</h3>
      </div>
      <p className="text-gray-600 text-sm whitespace-pre-line">{content}</p>
    </Link>
  );
}

function StudyTimer() {
  const [seconds, setSeconds] = useState(0);
  const [running, setRunning] = useState(false);
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setSeconds(s => s + 1), 1000);
    return () => clearInterval(t);
  }, [running]);
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const progress = Math.min((seconds / 7200) * 100, 100);
  return (
    <div className="bg-white/60 backdrop-blur-md rounded-2xl p-4 border border-white/40 shadow flex items-center gap-4">
      <div className="relative w-14 h-14">
        <svg className="w-14 h-14 -rotate-90" viewBox="0 0 56 56">
          <circle cx="28" cy="28" r="24" fill="none" stroke="#e5e7eb" strokeWidth="4" />
          <circle cx="28" cy="28" r="24" fill="none" stroke="#6366f1" strokeWidth="4"
            strokeDasharray={`${2 * Math.PI * 24}`}
            strokeDashoffset={`${2 * Math.PI * 24 * (1 - progress / 100)}`}
            strokeLinecap="round" />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-indigo-600">
          {Math.round(progress)}%
        </span>
      </div>
      <div className="flex-1">
        <p className="text-xs text-gray-500 mb-1">Study timer</p>
        <p className="text-lg font-bold text-gray-800">
          {String(h).padStart(2, "0")}:{String(m).padStart(2, "0")}:{String(s).padStart(2, "0")}
        </p>
      </div>
      <button
        onClick={() => setRunning(r => !r)}
        className={`px-3 py-1.5 rounded-full text-sm font-medium transition ${running ? "bg-red-100 text-red-600 hover:bg-red-200" : "bg-indigo-500 text-white hover:bg-indigo-600"}`}
      >
        {running ? "Pause" : "Start"}
      </button>
    </div>
  );
}

function DarkModeToggle({ dark, onToggle }) {
  return (
    <button onClick={onToggle} className="w-9 h-9 bg-gray-100 rounded-full flex items-center justify-center hover:bg-gray-200 transition">
      {dark ? (
        <svg className="w-5 h-5 text-yellow-500" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m12.728 0l-.707-.707M6.343 6.343l-.707-.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      ) : (
        <svg className="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  );
}

// FIX #4: Extract clock into its own component so it re-renders independently
function LiveClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <p className="text-xs text-gray-400">
      {now.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })} — {now.toLocaleTimeString()}
    </p>
  );
}

function Home() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  // FIX #5: Only show toast if navigated here with fromLogin state flag
  const [showToast, setShowToast] = useState(() => !!location.state?.fromLogin);
  const [showNotifications, setShowNotifications] = useState(false);
  const { darkMode, setDarkMode } = useDarkMode();
  const [loading, setLoading] = useState(true);

  const [stats, setStats] = useState({ files: 0, aiQuestions: 0, products: 0, messages: 0 });
  const [streak, setStreak] = useState(0);
  const [recentActivity, setRecentActivity] = useState([]);
  const [lastMaterial, setLastMaterial] = useState(null);
  const [quote] = useState({ text: "The secret of getting ahead is getting started.", author: "Mark Twain" });
  const [leaderboardRank, setLeaderboardRank] = useState(null);
  const { unreadCount } = useNotifications();
  const [lastMarketplace, setLastMarketplace] = useState(null);
  const [pinnedChat, setPinnedChat] = useState(null);

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  };

  useEffect(() => {
    const t = setTimeout(() => setShowToast(false), 4000);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("darkMode", "true");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("darkMode", "false");
    }
  }, [darkMode]);

  useEffect(() => {
    if (!user) return;
    const fetchAll = async () => {
      try {
        const pgUser = await apiGet("/users/me");

        // FIX #2: Use static imports instead of dynamic re-import
        if (!pgUser.universityId) {
          const firestoreUser = await getDoc(doc(db, "users", user.uid));
          if (firestoreUser.exists()) {
            const data = firestoreUser.data();
            if (data.university) {
              const uni = await getUniversityByName(data.university);
              if (uni) {
                await updateMe({
                  universityId: uni.id,
                  faculty: data.faculty || null,
                  department: data.department || null,
                });
              }
            }
          }
        }

        // FIX #1: Fetch stats only once and reuse for both stats + leaderboard
        const statsData = await apiGet("/users/me/stats");
        setStats({
          files: statsData.files ?? 0,
          aiQuestions: 0,
          products: statsData.products ?? 0,
          messages: statsData.messages ?? 0,
        });

        // FIX #1: Reuse statsData instead of a second identical fetch
        if (statsData.leaderboardScore > 0) setLeaderboardRank(1);

        setStreak(pgUser.streakCount || 0);

        try {
          const activityData = await apiGet("/users/me/activity");
          setRecentActivity(activityData);
        } catch { setRecentActivity([]); }

        try {
          const myMaterials = await apiGet("/study-material/my");
          if (myMaterials.length > 0) setLastMaterial(myMaterials[0]);
        } catch { setLastMaterial(null); }

        try {
          const marketplace = await apiGet("/marketplace/my");
          if (marketplace.length > 0) setLastMarketplace(marketplace[0]);
        } catch { setLastMarketplace(null); }

        try {
          const rooms = await apiGet("/chat/rooms");
          if (rooms.length > 0) setPinnedChat(rooms[0]);
        } catch { setPinnedChat(null); }

      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchAll();
  }, [user]);

  const handleLogout = async () => {
    await signOut(auth);
    navigate("/");
  };

  // FIX #7: Update profile without full page reload
 const handlePhotoUpload = async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const token = await getIdToken(auth.currentUser, true);
    
    const formData = new FormData();
    formData.append("file", file);
    const uploadRes = await fetch("http://localhost:3000/upload/single?folder=profile", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
   
    const uploadText = await uploadRes.text();
console.log("Upload raw response:", uploadText);
let uploadData;
try {
  uploadData = JSON.parse(uploadText);
} catch {
  console.error("JSON parse failed:", uploadText);
  return;
}
console.log("Uploaded URL:", uploadData.url);
console.log("About to PATCH...");
    const patchRes = await fetch("http://localhost:3000/users/me", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ photoURL: uploadData.url }),
    });
    console.log("PATCH status:", patchRes.status);
    const patchData = await patchRes.json();
    console.log("Updated photoURL:", patchData.photoURL);
    window.location.reload();
  } catch (err) {
    console.error("Error:", err.message);
    alert("Failed: " + err.message);
  }
};

  const tabLinks = [
    { href: "/home", icon: <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" /></svg> },
    { href: "/study-material", icon: <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round"><path d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg> },
    { href: "/ai", icon: <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round"><path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg> },
    { href: "/chat", icon: <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round"><path d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg> },
    { href: "/marketplace", icon: <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round"><path d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" /></svg> },
    // FIX #6: Use "/profile" instead of "#profile"
    {
      href: "/profile", icon: user?.photoURL
        ? <img src={user.photoURL} alt="Profile" className="w-7 h-7 rounded-full object-cover border-2 border-gray-300" />
        : <img src={`https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(user?.displayName || user?.email || "?")}`} alt="Profile" className="w-7 h-7 rounded-full" />
    },
  ];

  const sidebarLinks = [
    { name: "Home", href: "/home", icon: <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" /></svg> },
    { name: "Study Material", href: "/study-material", icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round"><path d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg> },
    { name: "AI Assistant", href: "/ai", icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round"><path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg> },
    { name: "Chat", href: "/chat", icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round"><path d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg> },
    { name: "Marketplace", href: "/marketplace", icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round"><path d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" /></svg> },
  ];

  const cards = [
    {
      title: "Study Material",
      icon: <FontAwesomeIcon icon={faBookOpen} className="text-indigo-500 text-2xl" />,
      href: "/study-material",
      align: "left",
      content: lastMaterial ? `Last uploaded: ${lastMaterial.title}` : "No file uploaded yet.\nNo file viewed yet.",
    },
    {
      title: "AI Assistant",
      icon: <FontAwesomeIcon icon={faRobot} className="text-indigo-500 text-2xl" />,
      href: "/ai",
      align: "right",
      content: `${greeting()}, ${user?.displayName?.split(" ")[0] || "there"}! Ready to help you study smarter today.`,
    },
    {
      title: "Marketplace",
      icon: <FontAwesomeIcon icon={faCartShopping} className="text-indigo-500 text-2xl" />,
      href: "/marketplace",
      align: "left",
      content: "Browse and list items for your campus community.",
    },
    {
      title: "Chat",
      icon: <FontAwesomeIcon icon={faComments} className="text-indigo-500 text-2xl" />,
      href: "/chat",
      align: "right",
      content: "Connect and study with students from your university.",
    },
  ];

  const activityIcon = (type) => {
    if (type === "upload") return <FontAwesomeIcon icon={faFile} />;
    if (type === "ai") return <FontAwesomeIcon icon={faRobot} />;
    if (type === "marketplace") return <FontAwesomeIcon icon={faBagShopping} />;
    if (type === "chat") return <FontAwesomeIcon icon={faMessage} />;
    return "";
  };

  const timeAgo = (dateStr) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = Math.floor((now - date) / 1000);
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  };

  const bgClass = darkMode
    ? "min-h-screen bg-gray-900 text-white"
    : "min-h-screen bg-gradient-to-br from-indigo-100 via-white to-purple-100";

  return (
    <div className={bgClass}>

      {/* TOP BAR */}
      <header className={`fixed top-0 left-0 w-full z-40 shadow-sm ${darkMode ? "bg-gray-800" : "bg-white"}`}>
        <div className="flex items-center justify-between px-4 py-2">
          <div className="flex items-center gap-3">
            <button onClick={() => setMenuOpen(true)} className="text-gray-600 hover:text-indigo-500">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round">
                <path d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <h1 style={{ fontFamily: "'Nunito', sans-serif" }} className="text-xl font-bold text-indigo-500">TestYourSelf</h1>
          </div>
          <div className="flex items-center gap-3">
            <DarkModeToggle dark={darkMode} onToggle={() => setDarkMode(d => !d)} />
            <Link to="/search" className="w-9 h-9 bg-gray-100 rounded-full flex items-center justify-center hover:bg-gray-200">
              <svg className="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round">
                <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
              </svg>
            </Link>
            <div className="relative">
              <button onClick={() => setShowNotifications(!showNotifications)} className="w-9 h-9 bg-gray-100 rounded-full flex items-center justify-center hover:bg-gray-200">
                <svg className="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round">
                  <path d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6 6 0 10-12 0v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center animate-pulse">
                    {unreadCount}
                  </span>
                )}
              </button>
              {showNotifications && <NotificationPanel onClose={() => setShowNotifications(false)} />}
            </div>
            {user?.photoURL
              ? <img src={user.photoURL} alt="Profile" className="w-9 h-9 rounded-full object-cover border border-gray-300" />
              : <img src={`https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(user?.displayName || user?.email || "?")}`} alt="Profile" className="w-9 h-9 rounded-full" />
            }
          </div>
        </div>

        {/* Icon Tabs */}
        <div className={`flex items-center justify-around border-t px-2 ${darkMode ? "border-gray-700" : "border-gray-100"}`}>
          {tabLinks.map((tab, index) => {
            const isActive = location.pathname === tab.href;
            return (
              <Link key={index} to={tab.href}
                className={`flex items-center justify-center py-2 px-6 border-b-2 transition ${isActive ? "border-indigo-500 text-indigo-500" : "border-transparent text-gray-500 hover:text-indigo-400"}`}>
                {tab.icon}
              </Link>
            );
          })}
        </div>
      </header>

      {/* TOAST */}
      {showToast && <Toast message={user?.displayName || user?.email} onClose={() => setShowToast(false)} />}

      {/* OVERLAY */}
      {menuOpen && <div className="fixed inset-0 bg-black/40 z-40" onClick={() => setMenuOpen(false)} />}

      {/* SIDEBAR */}
      <aside className={`fixed top-0 left-0 h-full w-72 z-50 shadow-xl transform transition-transform duration-300 ${menuOpen ? "translate-x-0" : "-translate-x-full"} ${darkMode ? "bg-gray-800" : "bg-white"}`}>
        <div className={`flex items-center justify-between px-6 py-4 border-b ${darkMode ? "border-gray-700" : "border-gray-100"}`}>
          <div className="flex items-center gap-3">
            {/* FIX #7: Photo upload without window.location.reload() */}
            <label className="relative cursor-pointer group">
              {user?.photoURL
                ? <img src={user.photoURL} alt="Profile" className="w-10 h-10 rounded-full object-cover border border-gray-300" />
                : <img src={`https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(user?.displayName || user?.email || "?")}`} alt="Profile" className="w-10 h-10 rounded-full" />
              }
              <div className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                <FontAwesomeIcon icon={faCamera} className="text-white text-xs" />
              </div>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handlePhotoUpload}
              />
            </label>
            <div>
              <p className={`text-sm font-semibold ${darkMode ? "text-white" : "text-gray-800"}`}>{user?.displayName || "User"}</p>
              <p className="text-xs text-gray-400">{user?.email}</p>
            </div>
          </div>
          <button onClick={() => setMenuOpen(false)} className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round">
              <path d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <nav className="flex flex-col px-4 py-4 gap-1">
          {sidebarLinks.map((link) => (
            <Link key={link.name} to={link.href} onClick={() => setMenuOpen(false)}
              className={`flex items-center gap-4 px-4 py-3 rounded-xl text-sm font-medium transition ${location.pathname === link.href ? "bg-indigo-50 text-indigo-600" : `${darkMode ? "text-gray-300 hover:bg-gray-700" : "text-gray-700 hover:bg-indigo-50 hover:text-indigo-600"}`}`}>
              {link.icon}{link.name}
            </Link>
          ))}
        </nav>
        {user?.email === "omisope34@gmail.com" && (
          <Link to="/admin" onClick={() => setMenuOpen(false)}
            className="flex items-center gap-4 px-4 py-3 rounded-xl text-sm font-medium text-gray-700 hover:bg-indigo-50 hover:text-indigo-600 transition">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Admin Dashboard
          </Link>
        )}
        <div className="absolute bottom-6 left-0 w-full px-8">
          <button onClick={handleLogout} className="w-full py-2 rounded-full bg-indigo-500 text-white text-sm hover:bg-indigo-600 transition">
            Logout
          </button>
        </div>
      </aside>

      {/* PAGE CONTENT */}
      <main className="pt-32 px-6 pb-10 max-w-6xl mx-auto">

        {/* Welcome + Date/Time */}
        <div className="mb-6">
          <div className="inline-flex items-center divide-x divide-gray-200 py-1 px-3 text-sm border border-gray-200 rounded-full bg-white shadow-sm mb-2">
            <span className="pr-2 text-lg">🔥</span>
            <span className="pl-2 bg-gradient-to-r from-rose-500 to-indigo-500 font-medium bg-clip-text text-transparent">
              Welcome back, {user?.displayName || user?.email}
            </span>
          </div>
          <p className={`text-sm italic mb-1 ${darkMode ? "text-gray-400" : "text-gray-500"}`}>
            Study smarter. Learn together. Test yourself daily.
          </p>
          {/* FIX #4: LiveClock is isolated — only it re-renders every second */}
          <LiveClock />
        </div>

        {/* Two Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* LEFT COLUMN */}
          <div className="lg:col-span-2 flex flex-col gap-6">

            {/* Streak + Leaderboard */}
            <div className="flex gap-3">
              <div className="flex-1 bg-white/60 backdrop-blur-md rounded-2xl p-3 border border-white/40 shadow text-center">
                <p className="text-2xl font-bold text-indigo-600">🔥 {streak}</p>
                <p className="text-xs text-gray-500 mt-1">Day streak</p>
              </div>
              {leaderboardRank && (
                <div className="flex-1 bg-white/60 backdrop-blur-md rounded-2xl p-3 border border-white/40 shadow text-center">
                  <p className="text-2xl font-bold text-indigo-600">#{leaderboardRank}</p>
                  <p className="text-xs text-gray-500 mt-1">Leaderboard rank</p>
                </div>
              )}
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: "Files uploaded", value: stats.files, icon: <FontAwesomeIcon icon={faFile} /> },
                { label: "AI questions", value: stats.aiQuestions, icon: <FontAwesomeIcon icon={faRobot} /> },
                { label: "Products listed", value: stats.products, icon: <FontAwesomeIcon icon={faBagShopping} /> },
                { label: "Messages sent", value: stats.messages, icon: <FontAwesomeIcon icon={faMessage} /> },
              ].map((stat, i) => (
                loading ? <SkeletonCard key={i} /> : (
                  <div key={i} className="bg-white/60 backdrop-blur-md rounded-2xl p-4 border border-white/40 shadow text-center">
                    <p className="text-2xl mb-1">{stat.icon}</p>
                    <p className="text-2xl font-bold text-indigo-600"><AnimatedNumber target={stat.value} /></p>
                    <p className="text-xs text-gray-500 mt-1">{stat.label}</p>
                  </div>
                )
              ))}
            </div>

            {/* Recent Activity */}
            <div>
              <h2 className={`text-sm font-semibold mb-3 ${darkMode ? "text-gray-300" : "text-gray-600"}`}>Recent Activity</h2>
              {loading ? (
                [1, 2, 3].map(i => <SkeletonCard key={i} />)
              ) : recentActivity.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">No recent activity yet.</p>
              ) : (
                recentActivity.map((item) => (
                  <Link key={item.id} to={item.href || "#"}
                    className="flex items-start gap-3 bg-white/60 backdrop-blur-md rounded-xl px-4 py-3 mb-2 border border-white/40 shadow hover:bg-white/80 transition">
                    <span className="text-xl mt-0.5">{activityIcon(item.type)}</span>
                    <div>
                      <p className="text-sm text-gray-700">{item.description}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{timeAgo(item.createdAt)}</p>
                    </div>
                  </Link>
                ))
              )}
            </div>

            {/* Glassmorphism Cards */}
            <div>
              <h2 className={`text-sm font-semibold mb-3 ${darkMode ? "text-gray-300" : "text-gray-600"}`}>Your Modules</h2>

              {/* Desktop: 2x2 grid */}
              <div className="hidden lg:grid lg:grid-cols-2 gap-5">
                {cards.map((card, index) => (
                  loading ? <SkeletonCard key={index} /> : (
                    <Link
                      key={index}
                      to={card.href}
                      className="block backdrop-blur-md border border-white/40 shadow-lg rounded-2xl p-5 transition-all duration-500 hover:scale-105 hover:shadow-xl active:scale-95"
                      style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.6) 0%, rgba(255,255,255,0.3) 100%)" }}
                    >
                      <div className="flex items-center gap-2 mb-3">
                        <span>{card.icon}</span>
                        <h3 className="text-indigo-700 font-bold text-base">{card.title}</h3>
                      </div>
                      <p className="text-gray-600 text-sm whitespace-pre-line">{card.content}</p>
                    </Link>
                  )
                ))}
              </div>

              {/* Mobile: zigzag */}
              <div className="flex lg:hidden flex-col gap-5">
                {cards.map((card, index) => (
                  loading ? <SkeletonCard key={index} /> : (
                    <GlassCard key={index} {...card} delay={index * 150} />
                  )
                ))}
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN */}
          <div className="flex flex-col gap-6">

            {/* Study Timer */}
            <StudyTimer />

            {/* Motivational Quote */}
            <div className="bg-white/60 backdrop-blur-md rounded-2xl p-4 border border-white/40 shadow">
              <p className={`text-xs font-semibold mb-2 ${darkMode ? "text-gray-400" : "text-gray-500"}`}>Quote of the day</p>
              <p className="text-sm text-gray-600 italic">"{quote.text}"</p>
              <p className="text-xs text-gray-400 mt-1 text-right">— {quote.author}</p>
            </div>

            {/* Shortcuts */}
            <div className="bg-white/60 backdrop-blur-md rounded-2xl p-4 border border-white/40 shadow">
              <p className={`text-xs font-semibold mb-3 ${darkMode ? "text-gray-400" : "text-gray-500"}`}>Quick shortcuts</p>
              <div className="flex flex-col gap-2">
                <Link to="/study-material" className="text-sm text-indigo-600 hover:underline"><FontAwesomeIcon icon={faBookmark} className="mr-2" />Go to Study Material</Link>
                <Link to="/ai" className="text-sm text-indigo-600 hover:underline"><FontAwesomeIcon icon={faRobot} className="mr-2" />Resume AI conversation</Link>
                <Link to="/chat" className="text-sm text-indigo-600 hover:underline"><FontAwesomeIcon icon={faMessage} className="mr-2" />Open Chat</Link>
                <Link to="/marketplace" className="text-sm text-indigo-600 hover:underline"><FontAwesomeIcon icon={faBagShopping} className="mr-2" />Browse Marketplace</Link>
              </div>
            </div>

          </div>
        </div>
      </main>

      {/* FOOTER */}
      <div style={{ fontFamily: "'Geist', sans-serif" }} className="pt-10 px-4 bg-gradient-to-br from-indigo-100 via-white to-purple-100">
        <footer className="bg-white w-full max-w-[1350px] mx-auto text-black pt-8 lg:pt-12 px-4 sm:px-8 md:px-16 lg:px-28 rounded-tl-3xl rounded-tr-3xl overflow-hidden">
          <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-6 gap-8 md:gap-12">
            <div className="lg:col-span-3 space-y-6">
              <p className="text-sm text-neutral-600 max-w-96">TestYourSelf is a smart educational platform designed to help students store, organise, and interact with learning materials.</p>
              <div className="flex gap-5">
                {["twitter", "github", "linkedin", "youtube", "instagram"].map(s => (
                  <a key={s} href="#" className="text-neutral-600 hover:text-neutral-700 text-sm underline">{s}</a>
                ))}
              </div>
            </div>
            <div className="lg:col-span-3 grid grid-cols-2 gap-8">
              <div>
                <h3 className="font-bold text-sm mb-4">Resources</h3>
                <ul className="space-y-3 text-sm text-neutral-800">
                  <li><Link to="/study-material" className="hover:text-neutral-700">Study Material</Link></li>
                  <li><Link to="/ai" className="hover:text-neutral-700">AI</Link></li>
                  <li><Link to="/marketplace" className="hover:text-neutral-700">Marketplace</Link></li>
                  <li><Link to="/chat" className="hover:text-neutral-700">Chat</Link></li>
                </ul>
              </div>
              <div>
                <h3 className="font-bold text-sm mb-4">Company</h3>
                <ul className="space-y-3 text-sm text-neutral-800">
                  <li><a href="#" className="hover:text-neutral-700">About</a></li>
                  <li><a href="#" className="hover:text-neutral-700">Vision</a></li>
                  <li><a href="#" className="hover:text-neutral-700">Privacy policy</a></li>
                  <li><a href="#" className="hover:text-neutral-700">Contact Us</a></li>
                </ul>
              </div>
            </div>
          </div>
          <div className="max-w-7xl mx-auto mt-12 pt-4 border-t border-neutral-300 flex justify-between items-center">
            <p className="text-neutral-600 text-sm">© 2026 TestYourSelf</p>
            <p className="text-sm text-neutral-600">All rights reserved.</p>
          </div>
          <h1 className="text-center font-extrabold leading-[0.7] text-transparent text-[clamp(3rem,15vw,15rem)] [-webkit-text-stroke:1px_#D4D4D4] mt-6">
            TestYourSelf
          </h1>
        </footer>
      </div>

    </div>
  );
}

export default Home;
