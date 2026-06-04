import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { auth } from "./firebase";
import { getIdToken } from "firebase/auth";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faChevronLeft, faBoxOpen, faStar,
  faStore, faCommentDots, faUser
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

function SellerProfile() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      apiFetch(`/marketplace/seller/${userId}`),
      apiFetch(`/marketplace?universityId=`),
    ])
      .then(([profileData, allListings]) => {
        setProfile(profileData);
        setListings(allListings.filter(l => l.user?.id === userId));
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [userId]);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center text-gray-400">Loading...</div>
  );

  if (!profile) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <p className="text-5xl text-gray-200 mb-3"><FontAwesomeIcon icon={faUser} /></p>
        <p className="text-gray-500 font-medium">Seller profile not found</p>
        <button
          onClick={() => navigate("/marketplace")}
          className="mt-4 px-5 py-2 bg-indigo-500 text-white rounded-full text-sm hover:bg-indigo-600 transition"
        >
          Back to Marketplace
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-3 sticky top-0 z-40 shadow-sm">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="text-gray-400 hover:text-indigo-500 transition">
            <FontAwesomeIcon icon={faChevronLeft} />
          </button>
          <h1 className="text-base font-bold text-gray-800">Seller Profile</h1>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-5 space-y-4">

        {/* Profile Card */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center gap-4">
            <img
              src={profile.user?.photoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${profile.user?.displayName}`}
              className="w-16 h-16 rounded-full object-cover border-2 border-indigo-100"
              alt=""
            />
            <div className="flex-1">
              <p className="text-lg font-bold text-gray-800">{profile.user?.displayName}</p>
              {profile.user?.university?.shortName && (
                <p className="text-xs text-gray-400 mt-0.5">{profile.user.university.shortName}</p>
              )}
              {profile.rating > 0 && (
                <div className="flex items-center gap-1 mt-1">
                  {[1, 2, 3, 4, 5].map(s => (
                    <FontAwesomeIcon
                      key={s}
                      icon={faStar}
                      className={`text-sm ${s <= Math.round(profile.rating) ? "text-yellow-400" : "text-gray-200"}`}
                    />
                  ))}
                  <span className="text-xs text-gray-500 ml-1">{profile.rating.toFixed(1)}</span>
                </div>
              )}
            </div>
            {profile.totalSales > 0 && (
              <div className="text-center">
                <p className="text-xl font-bold text-indigo-600">{profile.totalSales}</p>
                <p className="text-xs text-gray-400">Sales</p>
              </div>
            )}
          </div>

          {profile.bio && (
            <p className="text-sm text-gray-600 mt-4 leading-relaxed">{profile.bio}</p>
          )}

          {/* Contact */}
          <div className="flex gap-2 mt-4">
            {profile.chatSnapUsername && (
              <button
                onClick={() => navigate(`/chat?user=${profile.chatSnapUsername}`)}
                className="flex items-center gap-1.5 px-4 py-2 bg-indigo-500 text-white rounded-xl text-sm font-medium hover:bg-indigo-600 transition"
              >
                <FontAwesomeIcon icon={faCommentDots} /> Chat on ChatSnap
              </button>
            )}
            {profile.whatsapp && (
              <a
                href={`https://wa.me/${profile.whatsapp}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 px-4 py-2 bg-green-500 text-white rounded-xl text-sm font-medium hover:bg-green-600 transition"
              >
                WhatsApp
              </a>
            )}
          </div>
        </div>

        {/* Listings */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <p className="text-sm font-semibold text-gray-600 mb-4 flex items-center gap-2">
            <FontAwesomeIcon icon={faStore} className="text-indigo-400" />
            Listings ({listings.length})
          </p>

          {listings.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-4xl text-gray-200 mb-2"><FontAwesomeIcon icon={faBoxOpen} /></p>
              <p className="text-gray-400 text-sm">No active listings</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {listings.map(item => (
                <div
                  key={item.id}
                  onClick={() => navigate(`/marketplace/${item.id}`)}
                  className="cursor-pointer rounded-xl border border-gray-100 overflow-hidden hover:shadow-md transition"
                >
                  <div className="h-28 bg-gray-100">
                    {item.images?.[0] ? (
                      <img src={item.images[0]} alt={item.title} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-300">
                        <FontAwesomeIcon icon={faBoxOpen} className="text-2xl" />
                      </div>
                    )}
                  </div>
                  <div className="p-2">
                    <p className="text-xs font-semibold text-gray-800 truncate">{item.title}</p>
                    <p className="text-xs text-indigo-600 font-bold mt-0.5">₦{item.price?.toLocaleString()}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default SellerProfile;