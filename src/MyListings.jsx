import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { auth } from "./firebase";
import { getIdToken } from "firebase/auth";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faChevronLeft, faPlus, faBoxOpen,
  faEdit, faTrash, faStore, faCheckCircle
} from "@fortawesome/free-solid-svg-icons";

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

function MyListings() {
  const navigate = useNavigate();
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [confirm, setConfirm] = useState(null);

  useEffect(() => {
    apiFetch("/marketplace/my")
      .then(setListings)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const deleteListing = async (id) => {
    try {
      await apiFetch(`/marketplace/${id}`, { method: "DELETE" });
      setListings(prev => prev.filter(l => l.id !== id));
    } catch (err) { console.error(err); }
  };

  const markAsSold = async (id) => {
    try {
      await apiFetch(`/marketplace/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "SOLD" }),
      });
      setListings(prev => prev.map(l => l.id === id ? { ...l, status: "SOLD" } : l));
    } catch (err) { console.error(err); }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-3 sticky top-0 z-40 shadow-sm">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate("/marketplace")} className="text-gray-400 hover:text-indigo-500 transition">
              <FontAwesomeIcon icon={faChevronLeft} />
            </button>
            <h1 className="text-base font-bold text-gray-800 flex items-center gap-2">
              <FontAwesomeIcon icon={faStore} className="text-indigo-400" /> My Listings
            </h1>
          </div>
          <button
            onClick={() => navigate("/marketplace/create")}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-500 text-white rounded-full text-sm hover:bg-indigo-600 transition"
          >
            <FontAwesomeIcon icon={faPlus} /> New
          </button>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-5">
        {/* Seller onboarding prompt */}
        <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4 mb-5 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-indigo-700">Set up your seller profile</p>
            <p className="text-xs text-indigo-400 mt-0.5">Add your ChatSnap username so buyers can contact you</p>
          </div>
          <button
            onClick={() => navigate("/marketplace/onboarding")}
            className="px-3 py-1.5 bg-indigo-500 text-white rounded-full text-xs font-medium hover:bg-indigo-600 transition whitespace-nowrap"
          >
            Set Up
          </button>
        </div>

        {loading ? (
          <div className="text-center py-16 text-gray-400">Loading...</div>
        ) : listings.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-5xl mb-3 text-gray-200"><FontAwesomeIcon icon={faBoxOpen} /></p>
            <p className="text-gray-500 font-medium">No listings yet</p>
            <p className="text-gray-400 text-sm mt-1">Start selling something!</p>
            <button
              onClick={() => navigate("/marketplace/create")}
              className="mt-4 px-5 py-2 bg-indigo-500 text-white rounded-full text-sm hover:bg-indigo-600 transition"
            >
              Create Listing
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {listings.map(item => (
              <div key={item.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex gap-4">
                {/* Image */}
                <div className="w-20 h-20 rounded-xl overflow-hidden bg-gray-100 shrink-0">
                  {item.images?.[0] ? (
                    <img src={item.images[0]} alt={item.title} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-300">
                      <FontAwesomeIcon icon={faBoxOpen} className="text-2xl" />
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold text-gray-800 truncate">{item.title}</p>
                    <span className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-medium ${
                      item.status === "ACTIVE" ? "bg-green-100 text-green-600" :
                      item.status === "SOLD" ? "bg-red-100 text-red-500" :
                      "bg-gray-100 text-gray-500"
                    }`}>{item.status}</span>
                  </div>
                  <p className="text-indigo-600 font-bold text-sm mt-0.5">₦{item.price?.toLocaleString()}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{new Date(item.createdAt).toLocaleDateString()}</p>

                  {/* Actions */}
                  <div className="flex items-center gap-3 mt-2">
                    {item.status === "ACTIVE" && (
                      <button
                        onClick={() => markAsSold(item.id)}
                        className="flex items-center gap-1 text-xs text-green-500 hover:text-green-700 font-medium transition"
                      >
                        <FontAwesomeIcon icon={faCheckCircle} /> Mark Sold
                      </button>
                    )}
                    <button
                      onClick={() => navigate(`/marketplace/${item.id}`)}
                      className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-600 font-medium transition"
                    >
                      <FontAwesomeIcon icon={faEdit} /> View
                    </button>
                    <button
                      onClick={() => setConfirm(item.id)}
                      className="flex items-center gap-1 text-xs text-red-400 hover:text-red-600 font-medium transition"
                    >
                      <FontAwesomeIcon icon={faTrash} /> Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Confirm Delete Modal */}
      {confirm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl">
            <p className="text-gray-700 text-sm mb-5">Are you sure you want to delete this listing? This cannot be undone.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirm(null)}
                className="flex-1 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition"
              >Cancel</button>
              <button
                onClick={() => { deleteListing(confirm); setConfirm(null); }}
                className="flex-1 py-2 rounded-xl bg-red-500 text-white text-sm hover:bg-red-600 transition"
              >Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default MyListings;