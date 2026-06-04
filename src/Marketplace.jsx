import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { auth } from "./firebase";
import { getIdToken } from "firebase/auth";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faSearch, faPlus, faList, faStore,
  faFilter, faTag, faBoxOpen, faTimes, faStar
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

const CATEGORIES = ["Books", "Electronics", "Clothing", "Furniture", "Food", "Services", "Digital", "Other"];
const CONDITIONS = ["NEW", "GOOD", "FAIR", "POOR"];
const TYPES = ["PHYSICAL", "DIGITAL", "SERVICE"];

function ListingCard({ item, onClick }) {
  const avgRating = item.reviews?.length
    ? (item.reviews.reduce((s, r) => s + r.rating, 0) / item.reviews.length).toFixed(1)
    : null;

  return (
    <div
      onClick={onClick}
      className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition cursor-pointer overflow-hidden"
    >
      {/* Image */}
      <div className="h-40 bg-gray-100 overflow-hidden">
        {item.images?.[0] ? (
          <img src={item.images[0]} alt={item.title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-300">
            <FontAwesomeIcon icon={faBoxOpen} className="text-4xl" />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-3">
        <p className="font-semibold text-gray-800 truncate">{item.title}</p>
        <p className="text-indigo-600 font-bold text-sm mt-0.5">₦{item.price?.toLocaleString()}</p>
        <div className="flex items-center justify-between mt-2">
          <span className="text-xs text-gray-400">{item.user?.displayName}</span>
          <div className="flex items-center gap-2">
            {avgRating && (
        <span className="text-xs text-yellow-500 flex items-center gap-0.5">
         <FontAwesomeIcon icon={faStar} /> {avgRating}
        </span>
            )}
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
              item.type === "DIGITAL" ? "bg-purple-100 text-purple-600" :
              item.type === "SERVICE" ? "bg-blue-100 text-blue-600" :
              "bg-gray-100 text-gray-500"
            }`}>{item.type}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function Marketplace() {
  const navigate = useNavigate();
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({
    category: "", type: "", condition: "", minPrice: "", maxPrice: ""
  });

  const fetchListings = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (filters.category) params.set("category", filters.category);
      if (filters.type) params.set("type", filters.type);
      if (filters.condition) params.set("condition", filters.condition);
      if (filters.minPrice) params.set("minPrice", filters.minPrice);
      if (filters.maxPrice) params.set("maxPrice", filters.maxPrice);

      const data = await apiFetch(`/marketplace?${params.toString()}`);
      setListings(data);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  useEffect(() => {
  const load = async () => {
    setLoading(true);
    try {
      const data = await apiFetch("/marketplace");
      setListings(data);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };
  load();
}, []);

  const handleSearch = (e) => {
    e.preventDefault();
    fetchListings();
  };

  const clearFilters = () => {
    setFilters({ category: "", type: "", condition: "", minPrice: "", maxPrice: "" });
    setSearch("");
  };

  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-3 sticky top-0 z-40 shadow-sm">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button onClick={() => navigate("/home")} className="text-gray-400 hover:text-indigo-500 transition">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>
            <h1 className="text-lg font-bold text-indigo-500 flex items-center gap-2">
              <FontAwesomeIcon icon={faStore} /> Marketplace
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate("/marketplace/my-listings")}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-gray-200 text-sm text-gray-600 hover:border-indigo-300 transition"
            >
              <FontAwesomeIcon icon={faList} /> My Listings
            </button>
            <button
              onClick={() => navigate("/marketplace/create")}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-indigo-500 text-white text-sm hover:bg-indigo-600 transition"
            >
              <FontAwesomeIcon icon={faPlus} /> Sell
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-5">
        {/* Search Bar */}
        <form onSubmit={handleSearch} className="flex gap-2 mb-4">
          <div className="flex-1 relative">
            <FontAwesomeIcon icon={faSearch} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search listings..."
              className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:border-indigo-400"
            />
          </div>
          <button
            type="button"
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl border text-sm transition ${
              activeFilterCount > 0 ? "bg-indigo-500 text-white border-indigo-500" : "border-gray-200 text-gray-600 hover:border-indigo-300"
            }`}
          >
            <FontAwesomeIcon icon={faFilter} />
            {activeFilterCount > 0 && <span>{activeFilterCount}</span>}
          </button>
          <button type="submit" className="px-4 py-2.5 bg-indigo-500 text-white rounded-xl text-sm hover:bg-indigo-600 transition">
            Search
          </button>
        </form>

        {/* Filters Panel */}
        {showFilters && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-4">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Category</label>
                <select
                  value={filters.category}
                  onChange={e => setFilters(f => ({ ...f, category: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-indigo-400"
                >
                  <option value="">All Categories</option>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Type</label>
                <select
                  value={filters.type}
                  onChange={e => setFilters(f => ({ ...f, type: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-indigo-400"
                >
                  <option value="">All Types</option>
                  {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Condition</label>
                <select
                  value={filters.condition}
                  onChange={e => setFilters(f => ({ ...f, condition: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-indigo-400"
                >
                  <option value="">All Conditions</option>
                  {CONDITIONS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Min Price (₦)</label>
                <input
                  type="number" value={filters.minPrice}
                  onChange={e => setFilters(f => ({ ...f, minPrice: e.target.value }))}
                  placeholder="0"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-indigo-400"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Max Price (₦)</label>
                <input
                  type="number" value={filters.maxPrice}
                  onChange={e => setFilters(f => ({ ...f, maxPrice: e.target.value }))}
                  placeholder="Any"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-indigo-400"
                />
              </div>
            </div>
            <div className="flex justify-between mt-3">
              <button onClick={clearFilters} className="text-xs text-gray-400 hover:text-red-400 flex items-center gap-1 transition">
                <FontAwesomeIcon icon={faTimes} /> Clear filters
              </button>
              <button onClick={() => { fetchListings(); setShowFilters(false); }}
                className="px-4 py-1.5 bg-indigo-500 text-white rounded-full text-xs hover:bg-indigo-600 transition">
                Apply
              </button>
            </div>
          </div>
        )}

        {/* Category Pills */}
        <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
          {CATEGORIES.map(cat => (
            <button
              key={cat}
              onClick={() => {
                setFilters(f => ({ ...f, category: f.category === cat ? "" : cat }));
                fetchListings();
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition ${
                filters.category === cat
                  ? "bg-indigo-500 text-white"
                  : "bg-white border border-gray-200 text-gray-600 hover:border-indigo-300"
              }`}
            >
              <FontAwesomeIcon icon={faTag} /> {cat}
            </button>
          ))}
        </div>

        {/* Listings Grid */}
        {loading ? (
          <div className="text-center py-16 text-gray-400">Loading...</div>
        ) : listings.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-4xl mb-3 text-gray-300"><FontAwesomeIcon icon={faBoxOpen} /></p>
            <p className="text-gray-500 font-medium">No listings found</p>
            <p className="text-gray-400 text-sm mt-1">Be the first to sell something!</p>
            <button
              onClick={() => navigate("/marketplace/create")}
              className="mt-4 px-5 py-2 bg-indigo-500 text-white rounded-full text-sm hover:bg-indigo-600 transition"
            >
              Create Listing
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {listings.map(item => (
              <ListingCard
                key={item.id}
                item={item}
                onClick={() => navigate(`/marketplace/${item.id}`)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default Marketplace;