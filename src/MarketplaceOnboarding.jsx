import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { auth } from "./firebase";
import { getIdToken } from "firebase/auth";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faStore, faUser, faComment,
  faPhone, faChevronRight, faCheckCircle
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

function MarketplaceOnboarding() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1); // 1 = choose role, 2 = seller form, 3 = done
  const [role, setRole] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    bio: "",
    chatSnapUsername: "",
    whatsapp: "",
  });

  const set = (key, value) => setForm(f => ({ ...f, [key]: value }));

  const handleRoleSelect = async (selectedRole) => {
    setRole(selectedRole);
    if (selectedRole === "buyer") {
      setSubmitting(true);
      try {
        await apiFetch("/marketplace/buyer/onboard", { method: "POST" });
        setStep(3);
      } catch (err) { console.error(err); }
      setSubmitting(false);
    } else {
      setStep(2);
    }
  };

  const handleSellerSubmit = async () => {
    setSubmitting(true);
    try {
      await apiFetch("/marketplace/seller/onboard", {
        method: "POST",
        body: JSON.stringify(form),
      });
      setStep(3);
    } catch (err) { console.error(err); }
    setSubmitting(false);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md">

        {/* Step 1 — Choose Role */}
        {step === 1 && (
          <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-8">
            <div className="text-center mb-8">
              <p className="text-4xl text-indigo-500 mb-3">
                <FontAwesomeIcon icon={faStore} />
              </p>
              <h1 className="text-2xl font-bold text-gray-800">Welcome to the Marketplace</h1>
              <p className="text-gray-400 text-sm mt-2">How would you like to use the marketplace?</p>
            </div>

            <div className="space-y-3">
              <button
                onClick={() => handleRoleSelect("seller")}
                disabled={submitting}
                className="w-full flex items-center justify-between p-4 rounded-2xl border-2 border-gray-100 hover:border-indigo-300 hover:bg-indigo-50 transition group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-500">
                    <FontAwesomeIcon icon={faStore} />
                  </div>
                  <div className="text-left">
                    <p className="font-semibold text-gray-800">I want to Sell</p>
                    <p className="text-xs text-gray-400">List items and connect with buyers</p>
                  </div>
                </div>
                <FontAwesomeIcon icon={faChevronRight} className="text-gray-300 group-hover:text-indigo-400 transition" />
              </button>

              <button
                onClick={() => handleRoleSelect("buyer")}
                disabled={submitting}
                className="w-full flex items-center justify-between p-4 rounded-2xl border-2 border-gray-100 hover:border-indigo-300 hover:bg-indigo-50 transition group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center text-purple-500">
                    <FontAwesomeIcon icon={faUser} />
                  </div>
                  <div className="text-left">
                    <p className="font-semibold text-gray-800">I want to Buy</p>
                    <p className="text-xs text-gray-400">Browse and purchase from sellers</p>
                  </div>
                </div>
                <FontAwesomeIcon icon={faChevronRight} className="text-gray-300 group-hover:text-indigo-400 transition" />
              </button>
            </div>

            <p className="text-center text-xs text-gray-400 mt-6">You can change this later in your profile</p>
          </div>
        )}

        {/* Step 2 — Seller Form */}
        {step === 2 && (
          <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-8">
            <div className="text-center mb-6">
              <p className="text-4xl text-indigo-500 mb-3">
                <FontAwesomeIcon icon={faStore} />
              </p>
              <h1 className="text-xl font-bold text-gray-800">Set Up Your Seller Profile</h1>
              <p className="text-gray-400 text-sm mt-1">Help buyers know how to reach you</p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs text-gray-500 mb-1 block flex items-center gap-1">
                  <FontAwesomeIcon icon={faUser} /> Bio (optional)
                </label>
                <textarea
                  value={form.bio}
                  onChange={e => set("bio", e.target.value)}
                  placeholder="Tell buyers a bit about yourself..."
                  rows={3}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-indigo-400 resize-none"
                />
              </div>

              <div>
                <label className="text-xs text-gray-500 mb-1 block flex items-center gap-1">
                  <FontAwesomeIcon icon={faComment} /> ChatSnap Username *
                </label>
                <input
                  value={form.chatSnapUsername}
                  onChange={e => set("chatSnapUsername", e.target.value)}
                  placeholder="@yourusername"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-indigo-400"
                />
                <p className="text-xs text-gray-400 mt-1">
                  Buyers will contact you via ChatSnap DM
                </p>
              </div>

              <div>
                <label className="text-xs text-gray-500 mb-1 block flex items-center gap-1">
                  <FontAwesomeIcon icon={faPhone} /> WhatsApp Number (optional)
                </label>
                <input
                  value={form.whatsapp}
                  onChange={e => set("whatsapp", e.target.value)}
                  placeholder="e.g. 2348012345678"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-indigo-400"
                />
              </div>
            </div>

            <button
              onClick={handleSellerSubmit}
              disabled={submitting || !form.chatSnapUsername}
              className="w-full mt-6 py-3 bg-indigo-500 text-white rounded-2xl font-semibold hover:bg-indigo-600 transition disabled:opacity-50"
            >
              {submitting ? "Saving..." : "Complete Setup"}
            </button>

            <button
              onClick={() => setStep(1)}
              className="w-full mt-2 py-2 text-gray-400 text-sm hover:text-gray-600 transition"
            >
              Go Back
            </button>
          </div>
        )}

        {/* Step 3 — Done */}
        {step === 3 && (
          <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-8 text-center">
            <p className="text-5xl text-green-400 mb-4">
              <FontAwesomeIcon icon={faCheckCircle} />
            </p>
            <h1 className="text-2xl font-bold text-gray-800">You're all set!</h1>
            <p className="text-gray-400 text-sm mt-2">
              {role === "seller"
                ? "Your seller profile is ready. Start listing your items!"
                : "Your buyer account is ready. Start browsing the marketplace!"}
            </p>
            <button
              onClick={() => navigate(role === "seller" ? "/marketplace/create" : "/marketplace")}
              className="mt-6 w-full py-3 bg-indigo-500 text-white rounded-2xl font-semibold hover:bg-indigo-600 transition"
            >
              {role === "seller" ? "Create First Listing" : "Browse Marketplace"}
            </button>
          </div>
        )}

      </div>
    </div>
  );
}

export default MarketplaceOnboarding;