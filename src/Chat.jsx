import { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { auth } from "./firebase";
import { getIdToken } from "firebase/auth";
import { useAuth } from "./useAuth";
import { io } from "socket.io-client";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faChevronLeft, faUsers, faUser, faPaperPlane,
  faSpinner, faStore, faMicrophone, faImage,
  faFile, faSmile, faReply, faCheck, faCheckDouble,
  faCircle, faPlus, faCamera, faTimes, faStop, faSearch,
} from "@fortawesome/free-solid-svg-icons";
import { encryptMessage, decryptMessage } from "./crypto";
import { uploadSingle } from "./useUpload";

const API = "http://localhost:3000";

async function apiFetch(path, options = {}) {
  const token = await getIdToken(auth.currentUser, true);
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function safeAvatar(url, seed) {
  const fallback = `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(seed || "?")}`;
  if (!url || url.startsWith("blob:")) return fallback;
  return url;
}

function avatarError(e, seed) {
  e.target.onerror = null; // prevent infinite loop
  e.target.src = `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(seed || "?")}`;
}

const EMOJIS = ["❤️", "😂", "😮", "😢", "👍", "🙏"];

// ── Read Receipt ───────────────────────────────────────────────────
function ReadReceipt({ isRead, isOwn }) {
  if (!isOwn) return null;
  return (
    <span className={`text-xs ml-1 ${isRead ? "text-blue-400" : "text-gray-300"}`}>
      <FontAwesomeIcon icon={isRead ? faCheckDouble : faCheck} />
    </span>
  );
}

// ── Message Bubble ─────────────────────────────────────────────────
function MessageBubble({ message, isOwn, onReply, onReact, dbUserId }) {
  const [showEmoji, setShowEmoji] = useState(false);
  const decryptedText = message.text ? decryptMessage(message.text) : null;

  const groupedReactions = message.reactions?.reduce((acc, r) => {
    acc[r.emoji] = (acc[r.emoji] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className={`flex gap-2 group ${isOwn ? "flex-row-reverse" : "flex-row"}`}>
      {!isOwn && (
        <img
          src={safeAvatar(message.sender?.photoURL, message.sender?.displayName)}
          className="w-7 h-7 rounded-full object-cover shrink-0 mt-1"
          alt=""
          onError={(e) => avatarError(e, message.sender?.displayName)}
        />
      )}

      <div className={`max-w-[70%] flex flex-col ${isOwn ? "items-end" : "items-start"}`}>
        {!isOwn && (
          <p className="text-xs text-indigo-400 mb-1 ml-1 font-medium">{message.sender?.displayName}</p>
        )}

        {/* Reply preview */}
        {message.replyTo && (
          <div className="px-3 py-1.5 rounded-xl mb-1 text-xs border-l-2 border-indigo-400 bg-gray-100 text-gray-500 max-w-full truncate">
            <p className="font-medium text-indigo-500">{message.replyTo.sender?.displayName}</p>
            <p className="truncate">{message.replyTo.text ? decryptMessage(message.replyTo.text) : "Media"}</p>
          </div>
        )}

        <div className="relative">
          {/* Bubble */}
          <div className={`px-4 py-2.5 rounded-2xl text-sm ${
            isOwn
              ? "bg-indigo-500 text-white rounded-tr-sm"
              : "bg-white border border-gray-100 text-gray-800 rounded-tl-sm shadow-sm"
          }`}>
            {/* Image */}
            {message.type === "image" && message.mediaUrl && (
              <img
                src={message.mediaUrl}
                alt="media"
                className="rounded-xl max-w-[200px] mb-1 cursor-pointer"
                onClick={() => window.open(message.mediaUrl, "_blank")}
              />
            )}

            {/* Audio */}
            {message.type === "audio" && message.mediaUrl && (
              <audio controls className="max-w-[200px]" src={message.mediaUrl} />
            )}

            {/* File */}
            {message.type === "file" && message.mediaUrl && (
              <a
                href={message.mediaUrl}
                target="_blank"
                rel="noreferrer"
                className={`flex items-center gap-2 ${isOwn ? "text-white" : "text-indigo-500"}`}
              >
                <FontAwesomeIcon icon={faFile} />
                <span className="text-xs underline">View File</span>
              </a>
            )}

            {/* Text */}
            {decryptedText && <p>{decryptedText}</p>}
          </div>

          {/* Action buttons on hover */}
          <div className={`absolute top-0 ${isOwn ? "left-0 -translate-x-full" : "right-0 translate-x-full"} hidden group-hover:flex items-center gap-1 px-1`}>
            <button
              onClick={() => onReply(message)}
              className="w-6 h-6 bg-gray-100 rounded-full flex items-center justify-center text-gray-400 hover:text-indigo-500 transition"
            >
              <FontAwesomeIcon icon={faReply} className="text-xs" />
            </button>
            <button
              onClick={() => setShowEmoji(!showEmoji)}
              className="w-6 h-6 bg-gray-100 rounded-full flex items-center justify-center text-gray-400 hover:text-indigo-500 transition"
            >
              <FontAwesomeIcon icon={faSmile} className="text-xs" />
            </button>
          </div>

          {/* Emoji picker */}
          {showEmoji && (
            <div className={`absolute z-10 bottom-full mb-1 ${isOwn ? "right-0" : "left-0"} bg-white rounded-full shadow-lg border border-gray-100 flex gap-1 px-2 py-1`}>
              {EMOJIS.map(emoji => (
                <button
                  key={emoji}
                  onClick={() => { onReact(message.id, emoji); setShowEmoji(false); }}
                  className="text-lg hover:scale-125 transition"
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Reactions */}
        {groupedReactions && Object.keys(groupedReactions).length > 0 && (
          <div className="flex gap-1 mt-1 flex-wrap">
            {Object.entries(groupedReactions).map(([emoji, count]) => (
              <span key={emoji} className="bg-white border border-gray-100 rounded-full px-2 py-0.5 text-xs shadow-sm">
                {emoji} {count}
              </span>
            ))}
          </div>
        )}

        <div className="flex items-center gap-1 mt-1 mx-1">
          <p className="text-xs text-gray-300">
            {new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </p>
          <ReadReceipt isRead={message.isRead} isOwn={isOwn} />
        </div>
      </div>
    </div>
  );
}

// ── Status Circle ──────────────────────────────────────────────────
function StatusCircle({ status, onClick, isOwn }) {
  const viewed = status.views?.length > 0;
  return (
    <button onClick={onClick} className="flex flex-col items-center gap-1 shrink-0">
      <div className={`w-14 h-14 rounded-full p-0.5 ${viewed && !isOwn ? "bg-gray-200" : "bg-gradient-to-tr from-indigo-500 to-purple-500"}`}>
        <img
          src={safeAvatar(status.user?.photoURL, status.user?.displayName)}
          className="w-full h-full rounded-full object-cover border-2 border-white"
          alt=""
          onError={(e) => avatarError(e, status.user?.displayName)}
        />
      </div>
      <p className="text-xs text-gray-500 truncate w-14 text-center">{isOwn ? "My Status" : status.user?.displayName}</p>
    </button>
  );
}

// ── Room List Item ─────────────────────────────────────────────────
function RoomItem({ room, currentUserId, onClick, active }) {
  const otherMember = room.isGroup ? null : room.members?.find(m => m.user?.id !== currentUserId);
  const lastMessage = room.messages?.[0];
  const name = room.isGroup
    ? (room.university?.shortName || room.name || "Group")
    : (otherMember?.user?.displayName || "Unknown");
  const avatar = room.isGroup ? null : otherMember?.user?.photoURL;
  // FIX #7: Use server-provided unread count if available, fall back to client-side count
  const unread = room.unreadCount ?? (room.messages?.filter(m => !m.isRead && m.sender?.id !== currentUserId).length || 0);

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition text-left ${active ? "bg-indigo-50" : ""}`}
    >
      <div className="relative shrink-0">
        {room.isGroup ? (
          <div className="w-12 h-12 bg-indigo-100 rounded-full flex items-center justify-center">
            <FontAwesomeIcon icon={faUsers} className="text-indigo-500 text-lg" />
          </div>
        ) : (
          <img
            src={safeAvatar(avatar, name)}
            className="w-12 h-12 rounded-full object-cover border border-gray-200"
            onError={(e) => avatarError(e, name)}
            alt=""
          />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <p className="font-semibold text-gray-800 text-sm truncate">{name}</p>
          {lastMessage && (
            <p className="text-xs text-gray-400 shrink-0 ml-2">
              {new Date(lastMessage.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </p>
          )}
        </div>
        {lastMessage && (
          <p className="text-xs text-gray-400 truncate mt-0.5">
            {lastMessage.sender?.displayName}: {lastMessage.text ? decryptMessage(lastMessage.text) : "Media"}
          </p>
        )}
      </div>
      {unread > 0 && (
        <span className="shrink-0 w-5 h-5 bg-indigo-500 text-white rounded-full text-xs flex items-center justify-center font-medium">
          {unread}
        </span>
      )}
    </button>
  );
}

// ── Chat Room ──────────────────────────────────────────────────────
function ChatRoom({ room, dbUserId, onBack }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [typingUser, setTypingUser] = useState(null);
  const [replyTo, setReplyTo] = useState(null);
  const [recording, setRecording] = useState(false);
  const [uploading, setUploading] = useState(false);
  const socketRef = useRef(null);
  const bottomRef = useRef(null);
  const typingRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  // FIX #8: Track mic stream ref for cleanup on unmount
  const streamRef = useRef(null);

  const otherMember = room.isGroup ? null : room.members?.find(m => m.user?.id !== dbUserId);
  const roomName = room.isGroup
    ? (room.university?.shortName || "Group Chat")
    : (otherMember?.user?.displayName || "Chat");

  // FIX #1: Pass auth token to socket. FIX #2: Use async/await consistently.
  // FIX #3: Add dbUserId to dependency array to avoid stale closure.
  useEffect(() => {
    if (!dbUserId) return; // wait until dbUserId is available

    let socket;
    let mounted = true;

    const connect = async () => {
      try {
        // Fetch messages and mark as read concurrently
        const [data] = await Promise.all([
          apiFetch(`/chat/rooms/${room.id}/messages`),
          apiFetch(`/chat/rooms/${room.id}/read`, { method: "POST" }).catch(console.error),
        ]);
        if (mounted) {
          setMessages(data);
          setLoading(false);
        }
      } catch (err) {
        console.error(err);
        if (mounted) setLoading(false);
      }

      // FIX #1: Get token and pass it to socket for authentication
      // Guard after every await — React Strict Mode unmounts before async resolves
      if (!mounted) return;
      try {
        const token = await getIdToken(auth.currentUser, true);
        if (!mounted) return; // check again after the await
        socket = io(`${API}/chat`, {
          transports: ["websocket"],
          auth: { token },
        });
        socketRef.current = socket;

        socket.on("connect", () => socket.emit("joinRoom", { roomId: room.id }));
        socket.on("newMessage", (message) => {
          if (mounted) setMessages(prev => [...prev, message]);
        });
        socket.on("userTyping", ({ userId, isTyping }) => {
          if (mounted && userId !== dbUserId) setTypingUser(isTyping ? userId : null);
        });
        socket.on("messageReaction", ({ messageId, reaction }) => {
          if (mounted) setMessages(prev => prev.map(m => {
            if (m.id !== messageId) return m;
            const existing = m.reactions?.find(r => r.userId === reaction.userId);
            if (existing) {
              return { ...m, reactions: m.reactions.map(r => r.userId === reaction.userId ? reaction : r) };
            }
            return { ...m, reactions: [...(m.reactions || []), reaction] };
          }));
        });
      } catch (err) {
        console.error("Socket connection error:", err);
      }
    };

    connect();

    return () => {
      mounted = false;
      // FIX #8: Stop mic stream if still active when component unmounts
      streamRef.current?.getTracks().forEach(t => t.stop());
      streamRef.current = null;
      if (socket) {
        socket.emit("leaveRoom", { roomId: room.id });
        socket.disconnect();
      }
      socketRef.current = null;
    };
  }, [room.id, dbUserId]); // FIX #3: added dbUserId

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = (overrides = {}) => {
    if ((!text.trim() && !overrides.mediaUrl) || !socketRef.current) return;
    socketRef.current.emit("sendMessage", {
      roomId: room.id,
      senderId: dbUserId,
      text: text.trim() ? encryptMessage(text.trim()) : "",
      replyToId: replyTo?.id,
      type: "text",
      ...overrides,
    });
    setText("");
    setReplyTo(null);
  };

  const handleTyping = (e) => {
    setText(e.target.value);
    socketRef.current?.emit("typing", { roomId: room.id, userId: dbUserId, isTyping: true });
    clearTimeout(typingRef.current);
    typingRef.current = setTimeout(() => {
      socketRef.current?.emit("typing", { roomId: room.id, userId: dbUserId, isTyping: false });
    }, 1500);
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadSingle(file, "chat");
      sendMessage({ mediaUrl: url, mediaType: file.type, type: "image", text: "" });
    } catch (err) { console.error(err); }
    setUploading(false);
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadSingle(file, "chat");
      sendMessage({ mediaUrl: url, mediaType: file.type, type: "file", text: "" });
    } catch (err) { console.error(err); }
    setUploading(false);
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // FIX #8: Store stream in ref so we can stop it on unmount
      streamRef.current = stream;
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      mediaRecorder.ondataavailable = e => audioChunksRef.current.push(e.data);
      mediaRecorder.onstop = async () => {
        const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        const file = new File([blob], "voice-note.webm", { type: "audio/webm" });
        setUploading(true);
        try {
          const url = await uploadSingle(file, "chat/audio");
          sendMessage({ mediaUrl: url, mediaType: "audio/webm", type: "audio", text: "" });
        } catch (err) { console.error(err); }
        setUploading(false);
        stream.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      };
      mediaRecorder.start();
      setRecording(true);
    } catch (err) { console.error(err); }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setRecording(false);
  };

  const handleReact = (messageId, emoji) => {
    socketRef.current?.emit("reactMessage", {
      messageId, emoji, userId: dbUserId, roomId: room.id,
    });
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3 shrink-0 shadow-sm">
        <button onClick={onBack} className="text-gray-400 hover:text-indigo-500 transition md:hidden">
          <FontAwesomeIcon icon={faChevronLeft} />
        </button>
        {room.isGroup ? (
          <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center">
            <FontAwesomeIcon icon={faUsers} className="text-indigo-500" />
          </div>
        ) : (
          <img
            src={safeAvatar(otherMember?.user?.photoURL, roomName)}
            className="w-10 h-10 rounded-full object-cover border border-gray-200"
            alt=""
            onError={(e) => avatarError(e, roomName)}
          />
        )}
        <div className="flex-1">
          <p className="font-semibold text-gray-800 text-sm">{roomName}</p>
          {typingUser
            ? <p className="text-xs text-indigo-400 animate-pulse">typing...</p>
            : <p className="text-xs text-gray-400">{room.isGroup ? `${room.members?.length || 0} members` : "tap for info"}</p>
          }
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3" style={{ background: "url('https://i.pinimg.com/originals/97/c0/07/97c00759032b89f29aadf12a6e52c98b.jpg') center/cover" }}>
        <div className="backdrop-blur-[1px] min-h-full space-y-3">
          {loading ? (
            <div className="text-center py-10 text-indigo-400">
              <FontAwesomeIcon icon={faSpinner} spin />
            </div>
          ) : messages.length === 0 ? (
            <div className="text-center py-16">
              <div className="bg-white/80 rounded-2xl px-6 py-4 inline-block shadow-sm">
                <p className="text-gray-500 text-sm">No messages yet. Say hello!</p>
              </div>
            </div>
          ) : (
            messages.map(msg => (
              <MessageBubble
                key={msg.id}
                message={msg}
                isOwn={msg.sender?.id === dbUserId}
                onReply={setReplyTo}
                onReact={handleReact}
                dbUserId={dbUserId}
              />
            ))
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Reply Preview */}
      {replyTo && (
        <div className="bg-indigo-50 border-t border-indigo-100 px-4 py-2 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2">
            <FontAwesomeIcon icon={faReply} className="text-indigo-400 text-xs" />
            <div>
              <p className="text-xs text-indigo-500 font-medium">{replyTo.sender?.displayName}</p>
              <p className="text-xs text-gray-500 truncate max-w-[200px]">
                {replyTo.text ? decryptMessage(replyTo.text) : "Media"}
              </p>
            </div>
          </div>
          <button onClick={() => setReplyTo(null)} className="text-gray-400 hover:text-gray-600">
            <FontAwesomeIcon icon={faTimes} className="text-xs" />
          </button>
        </div>
      )}

      {/* Input */}
      <div className="bg-white border-t border-gray-200 px-3 py-3 flex items-end gap-2 shrink-0">
        {/* Attachment buttons */}
        <div className="flex gap-1">
          <label className="w-9 h-9 bg-gray-100 rounded-full flex items-center justify-center text-gray-400 hover:text-indigo-500 hover:bg-indigo-50 transition cursor-pointer">
            <FontAwesomeIcon icon={faImage} />
            <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
          </label>
          <label className="w-9 h-9 bg-gray-100 rounded-full flex items-center justify-center text-gray-400 hover:text-indigo-500 hover:bg-indigo-50 transition cursor-pointer">
            <FontAwesomeIcon icon={faFile} />
            <input type="file" className="hidden" onChange={handleFileUpload} />
          </label>
        </div>

        <input
          value={text}
          onChange={handleTyping}
          onKeyDown={e => e.key === "Enter" && !e.shiftKey && sendMessage()}
          placeholder="Type a message..."
          className="flex-1 border border-gray-200 rounded-2xl px-4 py-2.5 text-sm outline-none focus:border-indigo-400 bg-gray-50"
        />

        {uploading ? (
          <div className="w-10 h-10 flex items-center justify-center text-indigo-400">
            <FontAwesomeIcon icon={faSpinner} spin />
          </div>
        ) : text.trim() ? (
          <button
            onClick={() => sendMessage()}
            className="w-10 h-10 bg-indigo-500 text-white rounded-full flex items-center justify-center hover:bg-indigo-600 transition"
          >
            <FontAwesomeIcon icon={faPaperPlane} />
          </button>
        ) : (
          <button
            onMouseDown={startRecording}
            onMouseUp={stopRecording}
            onTouchStart={startRecording}
            onTouchEnd={stopRecording}
            className={`w-10 h-10 rounded-full flex items-center justify-center transition ${
              recording ? "bg-red-500 text-white animate-pulse" : "bg-gray-100 text-gray-400 hover:text-indigo-500"
            }`}
          >
            <FontAwesomeIcon icon={recording ? faStop : faMicrophone} />
          </button>
        )}
      </div>
    </div>
  );
}

// ── Status Viewer ──────────────────────────────────────────────────
function StatusViewer({ status, onClose, onView }) {
  // FIX #5: Add status.id to dependency array
  useEffect(() => { onView(status.id); }, [status.id]);

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col">
      <div className="flex items-center gap-3 px-4 py-4">
        <button onClick={onClose} className="text-white">
          <FontAwesomeIcon icon={faChevronLeft} />
        </button>
        <img
          src={safeAvatar(status.user?.photoURL, status.user?.displayName)}
          className="w-8 h-8 rounded-full object-cover"
          alt=""
          onError={(e) => avatarError(e, status.user?.displayName)}
        />
        <div>
          <p className="text-white text-sm font-medium">{status.user?.displayName}</p>
          <p className="text-gray-400 text-xs">{new Date(status.createdAt).toLocaleTimeString()}</p>
        </div>
      </div>
      <div className="flex-1 flex items-center justify-center px-6">
        {status.type === "image" && status.mediaUrl ? (
          <img src={status.mediaUrl} alt="status" className="max-h-full max-w-full rounded-2xl" />
        ) : (
          <p className="text-white text-2xl font-medium text-center">{status.text}</p>
        )}
      </div>
      <p className="text-gray-400 text-xs text-center pb-6">
        {status.views?.length || 0} views
      </p>
    </div>
  );
}

// ── Main Chat Component ────────────────────────────────────────────
function Chat() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [tab, setTab] = useState("chats");
  const [rooms, setRooms] = useState([]);
  const [activeRoom, setActiveRoom] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dbUser, setDbUser] = useState(null);
  const [statuses, setStatuses] = useState([]);
  const [viewingStatus, setViewingStatus] = useState(null);
  const [showStatusCreate, setShowStatusCreate] = useState(false);
  const [newStatus, setNewStatus] = useState("");
  const [postingStatus, setPostingStatus] = useState(false);
  const [userSearch, setUserSearch] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  // FIX #6: Debounce ref for search
  const searchDebounceRef = useRef(null);

  useEffect(() => {
    const init = async () => {
      try {
        const [roomsData, userData, statusData] = await Promise.all([
          apiFetch("/chat/rooms"),
          apiFetch("/users/me"),
          apiFetch("/chat/status"),
        ]);
        setRooms(roomsData);
        setDbUser(userData);
        setStatuses(statusData);

        const params = new URLSearchParams(location.search);
        const targetUserId = params.get("dm");
        if (targetUserId) {
          const room = await apiFetch("/chat/rooms/dm", {
            method: "POST",
            body: JSON.stringify({ targetUserId }),
          });
          setActiveRoom(room);
          setRooms(prev => {
            const exists = prev.find(r => r.id === room.id);
            return exists ? prev.map(r => r.id === room.id ? room : r) : [room, ...prev];
          });
        }
      } catch (err) { console.error(err); }
      setLoading(false);
    };
    init();
  }, []);

  const postStatus = async () => {
    if (!newStatus.trim()) return;
    setPostingStatus(true);
    try {
      const status = await apiFetch("/chat/status", {
        method: "POST",
        body: JSON.stringify({ text: newStatus, type: "text" }),
      });
      setStatuses(prev => [status, ...prev]);
      setNewStatus("");
      setShowStatusCreate(false);
    } catch (err) { console.error(err); }
    setPostingStatus(false);
  };

  const searchUsers = async (q) => {
    if (!q.trim()) { setSearchResults([]); return; }
    setSearching(true);
    try {
      const data = await apiFetch(`/chat/users/search?q=${encodeURIComponent(q)}`);
      setSearchResults(data);
    } catch (err) { console.error(err); }
    setSearching(false);
  };

  // FIX #6: Debounced search handler — prevents API call on every keystroke
  const handleSearchChange = (e) => {
    const value = e.target.value;
    setUserSearch(value);
    clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => searchUsers(value), 400);
  };

  const myStatuses = statuses.filter(s => s.user?.id === dbUser?.id);
  const otherStatuses = statuses.filter(s => s.user?.id !== dbUser?.id);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-3 sticky top-0 z-40 shadow-sm shrink-0">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate("/home")} className="text-gray-400 hover:text-indigo-500 transition">
              <FontAwesomeIcon icon={faChevronLeft} />
            </button>
            <h1 className="text-lg font-bold text-indigo-500">ChatSnap</h1>
          </div>
        </div>

        {/* Tabs */}
        <div className="max-w-5xl mx-auto flex gap-6 mt-2">
          {["chats", "status"].map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`pb-1 text-sm font-semibold capitalize border-b-2 transition ${
                tab === t ? "border-indigo-500 text-indigo-500" : "border-transparent text-gray-400"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </header>

      <div className="flex-1 max-w-5xl w-full mx-auto flex overflow-hidden" style={{ height: "calc(100vh - 97px)" }}>

        {/* Sidebar */}
        <div className={`w-full md:w-80 border-r border-gray-200 bg-white flex flex-col shrink-0 ${activeRoom ? "hidden md:flex" : "flex"}`}>

          {/* Chats Tab */}
          {tab === "chats" && (
            <>
              <div className="px-3 py-2 border-b border-gray-100">
                <div className="relative">
                  <FontAwesomeIcon icon={faSearch} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs" />
                  <input
                    value={userSearch}
                    onChange={handleSearchChange} // FIX #6: use debounced handler
                    placeholder="Search by name or @username..."
                    className="w-full pl-8 pr-3 py-2 bg-gray-100 rounded-xl text-sm outline-none focus:bg-white focus:border focus:border-indigo-300 transition"
                  />
                </div>

                {/* Search Results */}
                {searchResults.length > 0 && (
                  <div className="mt-2 bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                    {searchResults.map(u => (
                      <button
                        key={u.id}
                        onClick={async () => {
                          const room = await apiFetch("/chat/rooms/dm", {
                            method: "POST",
                            body: JSON.stringify({ targetUserId: u.id }),
                          });
                          setActiveRoom(room);
                          setRooms(prev => prev.find(r => r.id === room.id) ? prev : [room, ...prev]);
                          setUserSearch("");
                          setSearchResults([]);
                        }}
                        className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 transition text-left"
                      >
                        <img
                          src={safeAvatar(u.photoURL, u.displayName)}
                          className="w-8 h-8 rounded-full object-cover border border-gray-200"
                          alt=""
                          onError={(e) => avatarError(e, u.displayName)}
                        />
                        <div>
                          <p className="text-sm font-medium text-gray-800">{u.displayName}</p>
                          {u.chatSnapUsername && (
                            <p className="text-xs text-gray-400">@{u.chatSnapUsername}</p>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {loading ? (
                <div className="flex-1 flex items-center justify-center text-indigo-400">
                  <FontAwesomeIcon icon={faSpinner} spin />
                </div>
              ) : rooms.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-6">
                  <p className="text-4xl text-gray-200 mb-3"><FontAwesomeIcon icon={faUser} /></p>
                  <p className="text-gray-500 font-medium text-sm">No conversations yet</p>
                  <button
                    onClick={() => navigate("/marketplace")}
                    className="mt-4 flex items-center gap-1.5 px-4 py-2 bg-indigo-500 text-white rounded-full text-xs font-medium hover:bg-indigo-600 transition"
                  >
                    <FontAwesomeIcon icon={faStore} /> Browse Marketplace
                  </button>
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
                  {rooms.map(room => (
                    <RoomItem
                      key={room.id}
                      room={room}
                      currentUserId={dbUser?.id}
                      active={activeRoom?.id === room.id}
                      onClick={() => setActiveRoom(room)}
                    />
                  ))}
                </div>
              )}
            </>
          )}

          {/* Status Tab */}
          {tab === "status" && (
            <div className="flex-1 overflow-y-auto">
              {/* My status */}
              <div className="px-4 py-3 border-b border-gray-100">
                <p className="text-xs text-gray-400 font-medium mb-3">MY STATUS</p>
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <img
                      src={safeAvatar(user?.photoURL, user?.displayName)}
                      className="w-12 h-12 rounded-full object-cover border border-gray-200"
                      alt=""
                      onError={(e) => avatarError(e, user?.displayName)}
                    />
                    <button
                      onClick={() => setShowStatusCreate(true)}
                      className="absolute -bottom-1 -right-1 w-5 h-5 bg-indigo-500 rounded-full flex items-center justify-center text-white"
                    >
                      <FontAwesomeIcon icon={faPlus} className="text-xs" />
                    </button>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-800">My Status</p>
                    <p className="text-xs text-gray-400">{myStatuses.length > 0 ? `${myStatuses.length} update${myStatuses.length > 1 ? "s" : ""}` : "Tap + to add status"}</p>
                  </div>
                </div>
              </div>

              {/* Status create */}
              {showStatusCreate && (
                <div className="px-4 py-3 border-b border-gray-100 bg-indigo-50">
                  <textarea
                    value={newStatus}
                    onChange={e => setNewStatus(e.target.value)}
                    placeholder="What's on your mind?"
                    rows={3}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-indigo-400 resize-none bg-white"
                  />
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={() => setShowStatusCreate(false)}
                      className="flex-1 py-2 rounded-xl border border-gray-200 text-sm text-gray-500"
                    >Cancel</button>
                    <button
                      onClick={postStatus}
                      disabled={postingStatus || !newStatus.trim()}
                      className="flex-1 py-2 rounded-xl bg-indigo-500 text-white text-sm hover:bg-indigo-600 transition disabled:opacity-50"
                    >Post</button>
                  </div>
                </div>
              )}

              {/* Recent updates */}
              {otherStatuses.length > 0 && (
                <div className="px-4 py-3">
                  <p className="text-xs text-gray-400 font-medium mb-3">RECENT UPDATES</p>
                  <div className="flex gap-4 overflow-x-auto pb-2">
                    {otherStatuses.map(status => (
                      <StatusCircle
                        key={status.id}
                        status={status}
                        isOwn={false}
                        onClick={() => setViewingStatus(status)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {otherStatuses.length === 0 && !showStatusCreate && (
                <div className="text-center py-10">
                  <p className="text-gray-400 text-sm">No status updates yet</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Chat Area */}
        <div className={`flex-1 flex flex-col ${activeRoom ? "flex" : "hidden md:flex"}`}>
          {activeRoom ? (
            <ChatRoom
              room={activeRoom}
              dbUserId={dbUser?.id}
              onBack={() => setActiveRoom(null)}
            />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-6">
              <p className="text-5xl text-gray-200 mb-3"><FontAwesomeIcon icon={faUser} /></p>
              <p className="text-gray-500 font-medium">Select a conversation</p>
              <p className="text-gray-400 text-sm mt-1">Choose from the list or start a new chat</p>
            </div>
          )}
        </div>
      </div>

      {/* Status Viewer */}
      {viewingStatus && (
        <StatusViewer
          status={viewingStatus}
          onClose={() => setViewingStatus(null)}
          onView={(id) => apiFetch(`/chat/status/${id}/view`, { method: "POST" }).catch(console.error)}
        />
      )}
    </div>
  );
}

export default Chat;
