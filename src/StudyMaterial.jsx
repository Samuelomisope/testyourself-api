import { useState, useEffect, useRef } from "react";
import { useAuth } from "./useAuth";
import { Link, useLocation } from "react-router-dom";
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faFileLines, faLock, faVideo, faBox, faFile, faNoteSticky, faUser, faGlobe } from '@fortawesome/free-solid-svg-icons';
import { faFile as farFile } from '@fortawesome/free-regular-svg-icons';
import { useDarkMode } from "./DarkModeContext";


const FILE_ICONS = {
  pdf: <FontAwesomeIcon icon={faFileLines} />,
  video: <FontAwesomeIcon icon={faVideo} />,
  note: <FontAwesomeIcon icon={faNoteSticky} />,
  default: <FontAwesomeIcon icon={farFile} />,
};

const getMimeFileType = (mimeType) => {
  if (!mimeType) return "default";
  if (mimeType.includes("pdf")) return "pdf";
  if (mimeType.includes("video")) return "video";
  if (mimeType.includes("word") || mimeType.includes("presentation") || mimeType.includes("text")) return "note";
  return "default";
};

const getFileType = (name) => {
  const ext = name?.split(".").pop().toLowerCase();
  if (["pdf"].includes(ext)) return "pdf";
  if (["mp4", "mov", "avi", "mkv", "webm"].includes(ext)) return "video";
  if (["doc", "docx", "txt", "ppt", "pptx"].includes(ext)) return "note";
  return "default";
};

const formatDate = (ts) => {
  if (!ts) return "";
  const date = new Date(ts);
  return date.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
};

const TAB_LINKS = [
  {
    href: "/home", label: "Home",
    icon: <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" /></svg>
  },
  {
    href: "/study-material", label: "Study",
    icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round"><path d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
  },
  {
    href: "/ai", label: "AI",
    icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round"><path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
  },
  {
    href: "/chat", label: "Chat",
    icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round"><path d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
  },
  {
    href: "/marketplace", label: "Market",
    icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round"><path d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
  },
];

// ─── Scientific Calculator ────────────────────────────────────────────────────
function Calculator({ onClose }) {
  const [display, setDisplay] = useState("0");
  const [equation, setEquation] = useState("");
  const [justCalculated, setJustCalculated] = useState(false);

  const buttons = [
    ["AC", "+/-", "%", "÷"],
    ["7", "8", "9", "×"],
    ["4", "5", "6", "−"],
    ["1", "2", "3", "+"],
    ["sin", "cos", "tan", "√"],
    ["π", "^", "log", "ln"],
    ["(", ")", ".", "="],
    ["0"],
  ];


  const handleButton = (val) => {
    if (val === "AC") { setDisplay("0"); setEquation(""); setJustCalculated(false); return; }
    if (val === "+/-") { setDisplay(d => String(parseFloat(d) * -1)); return; }
    if (val === "%") { setDisplay(d => String(parseFloat(d) / 100)); return; }
    if (val === "=") {
      try {
        let expr = equation + display;
        expr = expr.replace(/×/g, "*").replace(/÷/g, "/").replace(/−/g, "-")
          .replace(/π/g, Math.PI)
          .replace(/sin\(/g, "Math.sin(")
          .replace(/cos\(/g, "Math.cos(")
          .replace(/tan\(/g, "Math.tan(")
          .replace(/√\(/g, "Math.sqrt(")
          .replace(/log\(/g, "Math.log10(")
          .replace(/ln\(/g, "Math.log(")
          .replace(/\^/g, "**");
        const result = eval(expr);
        setDisplay(String(parseFloat(result.toFixed(10))));
        setEquation("");
        setJustCalculated(true);
      } catch { setDisplay("Error"); }
      return;
    }
    if (["÷", "×", "−", "+", "^"].includes(val)) {
      setEquation(eq => eq + display + val);
      setDisplay("0");
      setJustCalculated(false);
      return;
    }
    if (["sin", "cos", "tan", "√", "log", "ln"].includes(val)) {
      setEquation(eq => eq + val + "(");
      setDisplay("0");
      return;
    }
    if (val === "π") { setDisplay(String(Math.PI)); return; }
    if (val === "(") { setEquation(eq => eq + "("); return; }
    if (val === ")") { setEquation(eq => eq + display + ")"); setDisplay("0"); return; }
    if (val === ".") {
      if (!display.includes(".")) setDisplay(d => d + ".");
      return;
    }
    setDisplay(d => justCalculated ? val : d === "0" ? val : d + val);
    setJustCalculated(false);
  };

  const isOperator = (v) => ["÷", "×", "−", "+", "=", "AC"].includes(v);

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 rounded-3xl w-80 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <span className="text-white font-semibold text-sm">Scientific Calculator</span>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M6 18L18 6M6 6l12 12" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="px-5 pb-2 text-right">
          <p className="text-gray-400 text-xs h-4">{equation}</p>
          <p className="text-white text-4xl font-light truncate">{display}</p>
        </div>
        <div className="grid grid-cols-4 gap-1 p-3">
          {buttons.flat().map((btn, i) => (
            <button
              key={i}
              onClick={() => handleButton(btn)}
              className={`rounded-full py-3 text-sm font-medium transition active:scale-95 ${
                btn === "=" ? "bg-indigo-500 text-white col-span-1" :
                btn === "0" ? "bg-gray-700 text-white col-span-4 text-left pl-6" :
                isOperator(btn) ? "bg-indigo-400/80 text-white" :
                ["sin","cos","tan","√","π","^","log","ln","(",")"].includes(btn) ? "bg-gray-600 text-white text-xs" :
                "bg-gray-700 text-white"
              }`}
            >
              {btn}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Upload Modal ─────────────────────────────────────────────────────────────
function UploadModal({ onClose, user, userProfile, universitiesList = [] }) {
  const [file, setFile] = useState(null);
  const [title, setTitle] = useState("");
  const [courseInput, setCourseInput] = useState("");
  const [uploadUniversity, setUploadUniversity] = useState("");
  const [description, setDescription] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [uploadStatus, setUploadStatus] = useState("");
  const fileRef = useRef();

  const handleUpload = async () => {
    if (!file || !title.trim()) { setError("Please select a file and add a title."); return; }
    if (file.size > 100 * 1024 * 1024) { setError("File too large. Maximum size is 100MB."); return; }

    setUploading(true);
    setError("");

    try {
      const { auth } = await import("./firebase");
      const { getIdToken } = await import("firebase/auth");
      const token = await getIdToken(auth.currentUser, true);

      const formData = new FormData();
      formData.append("file", file);
      formData.append("title", title);
      formData.append("description", description);
      formData.append("faculty", courseInput);
      formData.append("isPublic", String(isPublic));
      if (uploadUniversity) formData.append("university", uploadUniversity);

      const xhr = new XMLHttpRequest();
      xhr.open("POST", "http://localhost:3000/study-material/upload");
      xhr.setRequestHeader("Authorization", `Bearer ${token}`);
      xhr.timeout = 300000;

      xhr.ontimeout = () => {
        setError("Upload is taking too long. Please try again.");
        setUploading(false);
      };

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const percent = Math.round((e.loaded / e.total) * 100);
          setProgress(percent);
          if (percent === 100) setUploadStatus("Finalizing upload... please wait.");
        }
      };

      xhr.onload = () => {
        if (xhr.status === 201 || xhr.status === 200) {
          onClose(true);
        } else {
          setError("Upload failed. Try again.");
          setUploading(false);
        }
      };

      xhr.onerror = () => { setError("Upload failed. Try again."); setUploading(false); };
      xhr.send(formData);

    } catch (err) {
      console.error(err);
      setError("Upload failed. Try again.");
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-bold text-gray-800 text-lg">Upload File</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M6 18L18 6M6 6l12 12" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {error && <p className="text-red-500 text-sm mb-3">{error}</p>}

        {/* File Picker */}
        <div
          onClick={() => fileRef.current.click()}
          className="border-2 border-dashed border-indigo-300 rounded-2xl p-6 text-center cursor-pointer hover:bg-indigo-50 transition mb-4"
        >
          {file ? (
            <div>
              <p className="text-2xl mb-1">{FILE_ICONS[getFileType(file.name)]}</p>
              <p className="text-sm font-medium text-gray-700">{file.name}</p>
              <p className="text-xs text-gray-400">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
            </div>
          ) : (
            <div>
              <p className="text-3xl mb-2">☁️</p>
              <p className="text-sm text-gray-500">Tap to select a file</p>
              <p className="text-xs text-gray-400 mt-1">PDF, Video, Word, PowerPoint</p>
            </div>
          )}
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            accept=".pdf,.doc,.docx,.ppt,.pptx,.txt,.mp4,.mov,.avi,.mkv,.webm"
            onChange={(e) => setFile(e.target.files[0])}
          />
        </div>

        {/* Title */}
        <input
          type="text"
          placeholder="File title *"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm mb-3 outline-none focus:border-indigo-400"
        />

        {/* Course */}
        <input
          type="text"
          placeholder="Course name e.g. CHM 101, Calculus I"
          value={courseInput}
          onChange={(e) => setCourseInput(e.target.value)}
          className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm mb-3 outline-none focus:border-indigo-400"
        />

        {/* University */}
        <select
          value={uploadUniversity}
          onChange={(e) => setUploadUniversity(e.target.value)}
          className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm mb-3 outline-none focus:border-indigo-400"
        >
          <option value="">Select University</option>
          {universitiesList.map(u => (
            <option key={u.id} value={u.shortName || u.name}>
              {u.name}
            </option>
          ))}
        </select>

        {/* Description */}
        <textarea
          placeholder="Description (optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm mb-3 outline-none focus:border-indigo-400 resize-none"
        />

        {/* Visibility */}
        <div className="flex items-center gap-3 mb-5">
          <button
            type="button"
            onClick={() => setIsPublic(false)}
            className={`flex-1 py-2 rounded-xl text-sm font-medium border transition ${!isPublic ? "bg-indigo-500 text-white border-indigo-500" : "text-gray-500 border-gray-200"}`}
          >
            <FontAwesomeIcon icon={faLock} className="mr-1" /> Private
          </button>
          <button
            type="button"
            onClick={() => setIsPublic(true)}
            className={`flex-1 py-2 rounded-xl text-sm font-medium border transition ${isPublic ? "bg-indigo-500 text-white border-indigo-500" : "text-gray-500 border-gray-200"}`}
          >
            <FontAwesomeIcon icon={faGlobe} className="mr-1" /> Public
          </button>
        </div>

        {/* Progress bar */}
        {uploading && (
          <div className="mb-2">
            <div className="w-full bg-gray-100 rounded-full h-2">
              <div className="bg-indigo-500 h-2 rounded-full transition-all" style={{ width: `${progress}%` }} />
            </div>
            <p className="text-xs text-gray-400 mt-1 text-right">{progress}%</p>
          </div>
        )}

        {uploading && uploadStatus && (
          <p className="text-xs text-indigo-500 text-center mb-2">{uploadStatus}</p>
        )}

        <button
          onClick={handleUpload}
          disabled={uploading}
          className="w-full py-3 bg-indigo-500 text-white rounded-xl font-medium hover:bg-indigo-600 transition disabled:opacity-50"
        >
          {uploading ? "Uploading..." : "Upload"}
        </button>
      </div>
    </div>
  );
}

// ─── File Detail Modal ────────────────────────────────────────────────────────
function FileDetailModal({ file, onClose }) {
  if (!file) return null;
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-bold text-gray-800">{file.title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M6 18L18 6M6 6l12 12" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="p-6">
          <div className="text-center mb-5">
            <p className="text-6xl mb-2">{FILE_ICONS[getMimeFileType(file.fileType)] || <FontAwesomeIcon icon={faFile} className="text-indigo-400" />}</p>
            <div className="flex items-center justify-center gap-2 flex-wrap">
              {file.faculty && (
                <span className="px-3 py-1 bg-indigo-100 text-indigo-600 rounded-full text-xs font-medium">
                  {file.faculty}
                </span>
              )}
              {file.university?.name && (
                <span className="px-3 py-1 bg-purple-100 text-purple-600 rounded-full text-xs font-medium">
                  {file.university.shortName || file.university.name}
                </span>
              )}
            </div>
          </div>
          <div className="space-y-2 mb-5 text-sm text-gray-600">
            {file.description && <p className="text-gray-500">{file.description}</p>}
            <p><FontAwesomeIcon icon={faFile} className="mr-1" /> Uploaded: {formatDate(file.createdAt)}</p>
            <p><FontAwesomeIcon icon={faUser} className="mr-1" /> By: {file.user?.displayName}</p>
            <p>
              {file.isPublic
                ? <><FontAwesomeIcon icon={faGlobe} className="mr-1" /> Public</>
                : <><FontAwesomeIcon icon={faLock} className="mr-1" /> Private</>
              }
            </p>
            {file.fileSize && <p><FontAwesomeIcon icon={faBox} className="mr-1" /> Size: {(file.fileSize / 1024 / 1024).toFixed(2)} MB</p>}
          </div>

          {/* PDF Viewer */}
          {getMimeFileType(file.fileType) === "pdf" && (
            <div className="mb-4 rounded-xl overflow-hidden border border-gray-200" style={{ height: 300 }}>
              <iframe src={file.fileUrl} className="w-full h-full" title={file.title} />
            </div>
          )}

          {/* Video Player */}
          {getMimeFileType(file.fileType) === "video" && (
            <div className="mb-4 rounded-xl overflow-hidden bg-black">
              <video controls className="w-full max-h-64" src={file.fileUrl} />
            </div>
          )}

          <div className="flex gap-3">
            <a
              href={file.fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 py-2.5 bg-indigo-500 text-white rounded-xl text-sm font-medium text-center hover:bg-indigo-600 transition"
            >
              Open
            </a>
            <a
              href={file.fileUrl}
              download
              className="flex-1 py-2.5 border border-indigo-300 text-indigo-600 rounded-xl text-sm font-medium text-center hover:bg-indigo-50 transition"
            >
              Download
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── File Card ────────────────────────────────────────────────────────────────
function FileCard({ file, user, onSelect, onDelete }) {
  return (
    <div
      onClick={() => onSelect(file)}
      className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 hover:shadow-md hover:border-indigo-200 transition text-left group relative cursor-pointer"
    >
      {file.user?.displayName === user?.displayName && (
        <button
          onClick={async (e) => {
            e.stopPropagation();
            if (!window.confirm("Delete this file?")) return;
            try {
              const { auth } = await import("./firebase");
              const { getIdToken } = await import("firebase/auth");
              const token = await getIdToken(auth.currentUser, true);
              await fetch(`http://localhost:3000/study-material/${file.id}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${token}` },
              });
              onDelete();
            } catch (err) {
              console.error(err);
            }
          }}
          className="absolute top-2 right-2 w-7 h-7 bg-red-100 text-red-500 rounded-full flex items-center justify-center hover:bg-red-200 transition opacity-0 group-hover:opacity-100"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path d="M6 18L18 6M6 6l12 12" strokeLinecap="round" />
          </svg>
        </button>
      )}
      <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center text-2xl mb-3 group-hover:bg-indigo-100 transition">
        {FILE_ICONS[getMimeFileType(file.fileType)] || <FontAwesomeIcon icon={faFile} />}
      </div>
      <p className="text-sm font-semibold text-gray-800 truncate mb-1">{file.title}</p>
      <div className="flex flex-wrap gap-1 mb-2">
        {file.faculty && (
          <span className="px-2 py-0.5 bg-indigo-100 text-indigo-600 rounded-full text-xs">{file.faculty}</span>
        )}
        {file.university?.shortName && (
          <span className="px-2 py-0.5 bg-purple-100 text-purple-600 rounded-full text-xs">{file.university.shortName}</span>
        )}
      </div>
      <p className="text-xs text-gray-400">{formatDate(file.createdAt)}</p>
      <p className="text-xs text-gray-300 mt-0.5">{getMimeFileType(file.fileType)?.toUpperCase()}</p>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
function StudyMaterial() {
  const { user } = useAuth();
  const location = useLocation();
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [universityFilter, setUniversityFilter] = useState("All");
  const [viewMode, setViewMode] = useState("grid");
  const [showUpload, setShowUpload] = useState(false);
  const [showCalculator, setShowCalculator] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [universitiesList, setUniversitiesList] = useState([]);
  const [successMessage, setSuccessMessage] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const { darkMode } = useDarkMode();

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (!user) return;
    const fetchFiles = async () => {
  try {
    const { auth } = await import("./firebase");
    const { getIdToken } = await import("firebase/auth");
    const token = await getIdToken(auth.currentUser, true);
    const res = await fetch(`http://localhost:3000/study-material?search=${debouncedSearch}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    // Make sure data is always an array
    setFiles(Array.isArray(data) ? data : []);
  } catch (err) {
    console.error(err);
    setFiles([]); // always reset to empty array on error
  } finally {
    setLoading(false);
  }
};
    fetchFiles();
  }, [user, debouncedSearch, refreshKey]);

  useEffect(() => {
    fetch("http://localhost:3000/universities")
      .then(r => r.json())
      .then(data => setUniversitiesList(data))
      .catch(console.error);
  }, []);

  const filtered = files.filter(f => {
    if (universityFilter === "All") return true;
    return f.university?.shortName === universityFilter || f.university?.name === universityFilter;
  });

  return (
    <div className={`min-h-screen ${darkMode ? "bg-gray-900 text-white" : "bg-gradient-to-br from-indigo-50 via-white to-purple-50"}`}>

      {/* Success Toast */}
      {successMessage && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-50 bg-green-500 text-white px-6 py-3 rounded-full text-sm shadow-lg">
          ✅ {successMessage}
        </div>
      )}

      {/* HEADER */}
      <header className={`fixed top-0 left-0 w-full z-40 shadow-sm ${darkMode ? "bg-gray-800" : "bg-white"}`}>
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between px-4 py-2">
            <div className="flex items-center gap-3">
              <Link to="/home" className={darkMode ? "text-gray-400 hover:text-indigo-400" : "text-gray-500 hover:text-indigo-500"}>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round">
                  <path d="M15 18l-6-6 6-6" />
                </svg>
              </Link>
              <h1 style={{ fontFamily: "'Nunito', sans-serif" }} className="text-lg font-bold text-indigo-500">
                Study Material
              </h1>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setShowCalculator(true)} className="w-9 h-9 bg-gray-100 rounded-full flex items-center justify-center hover:bg-gray-200 transition">
                <svg className="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <rect x="4" y="2" width="16" height="20" rx="2" />
                  <path d="M8 6h8M8 10h2M12 10h2M16 10h.01M8 14h2M12 14h2M16 14h2M8 18h2M12 18h2M16 18h2" strokeLinecap="round" />
                </svg>
              </button>
              <button onClick={() => setViewMode(v => v === "grid" ? "list" : "grid")} className="w-9 h-9 bg-gray-100 rounded-full flex items-center justify-center hover:bg-gray-200 transition">
                {viewMode === "grid" ? (
                  <svg className="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" strokeLinecap="round" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
                    <rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
                  </svg>
                )}
              </button>
              <button onClick={() => setShowUpload(true)} className="flex items-center gap-2 bg-indigo-500 text-white px-4 py-2 rounded-full text-sm font-medium hover:bg-indigo-600 transition">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                  <path d="M12 5v14M5 12h14" strokeLinecap="round" />
                </svg>
                Upload
              </button>
            </div>
          </div>

          <div className="flex items-center justify-around border-t border-gray-100 px-2">
            {TAB_LINKS.map((tab) => {
              const isActive = location.pathname === tab.href;
              return (
                <Link
                  key={tab.href}
                  to={tab.href}
                  className={`flex flex-col items-center py-2 px-4 border-b-2 transition text-xs gap-0.5 ${
                    isActive ? "border-indigo-500 text-indigo-500" : "border-transparent text-gray-400 hover:text-indigo-400"
                  }`}
                >
                  {tab.icon}
                  <span>{tab.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </header>

      <main className="pt-28 px-4 pb-10 max-w-6xl mx-auto">

        {/* Search Bar */}
        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-full px-4 py-2.5 shadow-sm mt-4 mb-4">
          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" strokeLinecap="round" />
          </svg>
          <input
            type="text"
            placeholder="Search by title, course or keyword..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 bg-transparent text-sm outline-none text-gray-700 placeholder-gray-400"
          />
          {search && (
            <button onClick={() => setSearch("")} className="text-gray-400 hover:text-gray-600">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M6 18L18 6M6 6l12 12" strokeLinecap="round" />
              </svg>
            </button>
          )}
        </div>

        {/* University Filter */}
        <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
          {["All", ...universitiesList.map(u => u.shortName || u.name)].map(u => (
            <button
              key={u}
              onClick={() => setUniversityFilter(u)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition ${
                universityFilter === u
                  ? "bg-indigo-500 text-white"
                  : "bg-white border border-gray-200 text-gray-600 hover:border-indigo-300"
              }`}
            >
              {u}
            </button>
          ))}
        </div>

        <p className="text-xs text-gray-400 mb-4">
          {filtered.length} {filtered.length === 1 ? "file" : "files"} found
        </p>

        {/* Loading Skeleton */}
        {loading && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="bg-white rounded-2xl p-4 animate-pulse">
                <div className="h-12 w-12 bg-gray-200 rounded-xl mb-3" />
                <div className="h-3 bg-gray-200 rounded w-3/4 mb-2" />
                <div className="h-3 bg-gray-200 rounded w-1/2" />
              </div>
            ))}
          </div>
        )}

        {/* Empty State */}
        {!loading && filtered.length === 0 && (
          <div className="text-center py-20">
            <p className="text-5xl mb-4"><FontAwesomeIcon icon={faFile} className="text-gray-300" /></p>
            <p className="text-gray-500 font-medium">No files found</p>
            <p className="text-gray-400 text-sm mt-1">
              {search ? "Try a different search term" : "Upload your first file to get started"}
            </p>
            <button
              onClick={() => setShowUpload(true)}
              className="mt-4 px-6 py-2 bg-indigo-500 text-white rounded-full text-sm hover:bg-indigo-600 transition"
            >
              Upload File
            </button>
          </div>
        )}

        {/* Grid View */}
        {!loading && filtered.length > 0 && viewMode === "grid" && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {filtered.map(file => (
              <FileCard
                key={file.id}
                file={file}
                user={user}
                onSelect={setSelectedFile}
                onDelete={() => setRefreshKey(k => k + 1)}
              />
            ))}
          </div>
        )}

        {/* List View */}
        {!loading && filtered.length > 0 && viewMode === "list" && (
          <div className="flex flex-col gap-3">
            {filtered.map(file => (
              <FileCard
                key={file.id}
                file={file}
                user={user}
                onSelect={setSelectedFile}
                onDelete={() => setRefreshKey(k => k + 1)}
              />
            ))}
          </div>
        )}

      </main>

      {/* Modals */}
      {showUpload && (
        <UploadModal
          onClose={(uploaded) => {
            setShowUpload(false);
            if (uploaded) {
              setSuccessMessage("File uploaded successfully!");
              setTimeout(() => setSuccessMessage(""), 3000);
              setRefreshKey(k => k + 1);
            }
          }}
          user={user}
          universitiesList={universitiesList}
        />
      )}
      {showCalculator && <Calculator onClose={() => setShowCalculator(false)} />}
      {selectedFile && <FileDetailModal file={selectedFile} onClose={() => setSelectedFile(null)} />}

    </div>
  );
}

export default StudyMaterial;
