import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { auth } from "./firebase";
import { getIdToken } from "firebase/auth";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faStar, faUniversity, faTag, faBoxOpen,
  faChevronLeft, faChevronRight, faCommentDots,
  faStore, faPaperPlane
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

function StarRating({ value, onChange }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map(star => (
        <button key={star} onClick={() => onChange && onChange(star)} type="button">
          <FontAwesomeIcon
            icon={faStar}
            className={`text-xl ${star <= value ? "text-yellow-400" : "text-gray-200"} transition`}
          />
        </button>
      ))}
    </div>
  );
}

function MarketplaceDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [item, setItem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [imgIndex, setImgIndex] = useState(0);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    apiFetch(`/marketplace/${id}`)
      .then(setItem)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id]);

  const submitReview = async () => {
    if (!rating) return;
    setSubmitting(true);
    try {
      const review = await apiFetch(`/marketplace/${id}/reviews`, {
        method: "POST",
        body: JSON.stringify({ rating, comment }),
      });
      setItem(prev => ({ ...prev, reviews: [{ ...review, user: { displayName: "You" } }, ...prev.reviews] }));
      setRating(0);
      setComment("");
    } catch (err) { console.error(err); }
    setSubmitting(false);
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-400">Loading...</div>;
  if (!item) return <div className="min-h-screen flex items-center justify-center text-gray-400">Item not found.</div>;

  const avgRating = item.reviews?.length
    ? (item.reviews.reduce((s, r) => s + r.rating, 0) / item.reviews.length).toFixed(1)
    : null;

  const seller = item.user;
  const chatSnapUsername = seller?.sellerProfile?.chatSnapUsername;
  const whatsapp = seller?.sellerProfile?.whatsapp;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-3 sticky top-0 z-40 shadow-sm">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <button onClick={() => navigate("/marketplace")} className="text-gray-400 hover:text-indigo-500 transition">
            <FontAwesomeIcon icon={faChevronLeft} />
          </button>
          <h1 className="text-base font-bold text-gray-800 truncate">{item.title}</h1>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-5 space-y-4">

        {/* Images */}
        <div className="bg-white rounded-2xl overflow-hidden border border-gray-100 shadow-sm">
          <div className="relative h-64 bg-gray-100">
            {item.images?.length > 0 ? (
              <>
                <img src={item.images[imgIndex]} alt={item.title} className="w-full h-full object-cover" />
                {item.images.length > 1 && (
                  <>
                    <button
                      onClick={() => setImgIndex(i => Math.max(0, i - 1))}
                      className="absolute left-2 top-1/2 -translate-y-1/2 bg-white/80 rounded-full w-8 h-8 flex items-center justify-center shadow"
                    >
                      <FontAwesomeIcon icon={faChevronLeft} className="text-gray-600 text-sm" />
                    </button>
                    <button
                      onClick={() => setImgIndex(i => Math.min(item.images.length - 1, i + 1))}
                      className="absolute right-2 top-1/2 -translate-y-1/2 bg-white/80 rounded-full w-8 h-8 flex items-center justify-center shadow"
                    >
                      <FontAwesomeIcon icon={faChevronRight} className="text-gray-600 text-sm" />
                    </button>
                    <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
                      {item.images.map((_, i) => (
                        <div key={i} className={`w-1.5 h-1.5 rounded-full ${i === imgIndex ? "bg-indigo-500" : "bg-white/60"}`} />
                      ))}
                    </div>
                  </>
                )}
              </>
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-300">
                <FontAwesomeIcon icon={faBoxOpen} className="text-5xl" />
              </div>
            )}
          </div>
        </div>

        {/* Details */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold text-gray-800">{item.title}</h2>
              <p className="text-2xl font-bold text-indigo-600 mt-1">₦{item.price?.toLocaleString()}</p>
            </div>
            <div className="flex flex-col items-end gap-1">
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                item.type === "DIGITAL" ? "bg-purple-100 text-purple-600" :
                item.type === "SERVICE" ? "bg-blue-100 text-blue-600" :
                "bg-gray-100 text-gray-500"
              }`}>{item.type}</span>
              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-600">
                {item.condition}
              </span>
            </div>
          </div>

          <p className="text-gray-600 text-sm mt-3 leading-relaxed">{item.description}</p>

          {/* Tags */}
          {item.tags?.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3">
              {item.tags.map(tag => (
                <span key={tag} className="flex items-center gap-1 px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full text-xs">
                  <FontAwesomeIcon icon={faTag} /> {tag}
                </span>
              ))}
            </div>
          )}

          {/* Meta */}
          <div className="flex items-center gap-4 mt-4 text-xs text-gray-400">
            <span className="flex items-center gap-1">
              <FontAwesomeIcon icon={faUniversity} />
              {item.university?.shortName || "—"}
            </span>
            {avgRating && (
              <span className="flex items-center gap-1 text-yellow-500">
                <FontAwesomeIcon icon={faStar} /> {avgRating} ({item.reviews.length} reviews)
              </span>
            )}
          </div>
        </div>

        {/* Seller */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <p className="text-sm font-semibold text-gray-600 mb-3 flex items-center gap-2">
            <FontAwesomeIcon icon={faStore} className="text-indigo-400" /> Seller
          </p>
          <div className="flex items-center justify-between gap-3">
            <div
              className="flex items-center gap-3 cursor-pointer"
              onClick={() => navigate(`/marketplace/seller/${seller.id}`)}
            >
              <img
                src={seller.photoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${seller.displayName}`}
                className="w-10 h-10 rounded-full object-cover border border-gray-200"
                alt=""
              />
              <div>
                <p className="font-medium text-gray-800 text-sm">{seller.displayName}</p>
                {seller.sellerProfile?.rating > 0 && (
                  <span className="flex items-center gap-1 text-xs text-yellow-500">
                    <FontAwesomeIcon icon={faStar} />
                    {seller.sellerProfile.rating.toFixed(1)}
                  </span>
                )}
              </div>
            </div>

            {/* Contact buttons */}
            <div className="flex gap-2">
              {chatSnapUsername && (
                <button
                  onClick={() => navigate(`/chat?dm=${seller.id}`)}
                  className="flex items-center gap-1.5 px-3 py-2 bg-indigo-500 text-white rounded-xl text-xs font-medium hover:bg-indigo-600 transition"
                >
                  <FontAwesomeIcon icon={faCommentDots} /> Chat with Seller
                </button>
              )}
              {whatsapp && (
                <a
                  href={`https://wa.me/${whatsapp}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 px-3 py-2 bg-green-500 text-white rounded-xl text-xs font-medium hover:bg-green-600 transition"
                >
                  WhatsApp
                </a>
              )}
              {!chatSnapUsername && !whatsapp && (
                <span className="text-xs text-gray-400">No contact info</span>
              )}
            </div>
          </div>
        </div>

        {/* Reviews */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <p className="text-sm font-semibold text-gray-600 mb-4 flex items-center gap-2">
            <FontAwesomeIcon icon={faStar} className="text-yellow-400" />
            Reviews ({item.reviews?.length || 0})
          </p>

          {/* Add Review */}
          <div className="mb-5 pb-5 border-b border-gray-100">
            <p className="text-xs text-gray-500 mb-2">Leave a review</p>
            <StarRating value={rating} onChange={setRating} />
            <textarea
              value={comment}
              onChange={e => setComment(e.target.value)}
              placeholder="Write a comment (optional)..."
              rows={2}
              className="w-full mt-2 border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-indigo-400 resize-none"
            />
            <button
              onClick={submitReview}
              disabled={!rating || submitting}
              className="mt-2 flex items-center gap-1.5 px-4 py-2 bg-indigo-500 text-white rounded-xl text-xs font-medium hover:bg-indigo-600 transition disabled:opacity-50"
            >
              <FontAwesomeIcon icon={faPaperPlane} /> Submit Review
            </button>
          </div>

          {/* Review List */}
          {item.reviews?.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-4">No reviews yet. Be the first!</p>
          ) : (
            <div className="space-y-3">
              {item.reviews.map((r, i) => (
                <div key={i} className="flex gap-3">
                  <img
                    src={r.user?.photoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${r.user?.displayName}`}
                    className="w-8 h-8 rounded-full object-cover border border-gray-200 shrink-0"
                    alt=""
                  />
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-gray-800">{r.user?.displayName}</p>
                      <StarRating value={r.rating} />
                    </div>
                    {r.comment && <p className="text-xs text-gray-500 mt-0.5">{r.comment}</p>}
                    <p className="text-xs text-gray-300 mt-0.5">{new Date(r.createdAt).toLocaleDateString()}</p>
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

export default MarketplaceDetail;