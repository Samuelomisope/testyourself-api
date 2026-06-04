import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { auth } from "./firebase";
import { getIdToken } from "firebase/auth";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faChevronLeft, faPlus,
  faImage, faTag, faTimes, faSpinner
} from "@fortawesome/free-solid-svg-icons";
import { uploadMultiple } from "./useUpload";

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

function CreateListing() {
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [form, setForm] = useState({
    title: "",
    description: "",
    price: "",
    images: [],
    category: "",
    type: "PHYSICAL",
    condition: "GOOD",
    tags: [],
  });

  const set = (key, value) => setForm(f => ({ ...f, [key]: value }));

  const addTag = () => {
    const tag = tagInput.trim();
    if (tag && !form.tags.includes(tag)) {
      set("tags", [...form.tags, tag]);
      setTagInput("");
    }
  };

  const removeTag = (tag) => set("tags", form.tags.filter(t => t !== tag));

 const [uploading, setUploading] = useState(false);

const handleImageUpload = async (e) => {
  const files = Array.from(e.target.files);
  if (!files.length) return;
  setUploading(true);
  try {
    const urls = await uploadMultiple(files, "marketplace");
    set("images", [...form.images, ...urls]);
  } catch (err) {
    console.error(err);
    alert("Image upload failed. Please try again.");
  }
  setUploading(false);
};

  const removeImage = (index) => set("images", form.images.filter((_, i) => i !== index));

  const submit = async () => {
    if (!form.title || !form.description || !form.price) return;
    setSubmitting(true);
    try {
      await apiFetch("/marketplace", {
        method: "POST",
        body: JSON.stringify({ ...form, price: parseFloat(form.price) }),
      });
      navigate("/marketplace/my-listings");
    } catch (err) {
      console.error(err);
      alert("Failed to create listing. Make sure you belong to a university.");
    }
    setSubmitting(false);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-3 sticky top-0 z-40 shadow-sm">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <button onClick={() => navigate("/marketplace")} className="text-gray-400 hover:text-indigo-500 transition">
            <FontAwesomeIcon icon={faChevronLeft} />
          </button>
          <h1 className="text-base font-bold text-gray-800">Create Listing</h1>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-5 space-y-4">

        {/* Images */}
       <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
  <p className="text-sm font-semibold text-gray-600 mb-3 flex items-center gap-2">
    <FontAwesomeIcon icon={faImage} className="text-indigo-400" /> Images
  </p>
  <div className="flex flex-wrap gap-3">
    {form.images.map((url, i) => (
      <div key={i} className="relative w-20 h-20 rounded-xl overflow-hidden border border-gray-200">
        <img src={url} alt="" className="w-full h-full object-cover" />
        <button
          onClick={() => removeImage(i)}
          className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs"
        >
          <FontAwesomeIcon icon={faTimes} />
        </button>
      </div>
    ))}
    <label className={`w-20 h-20 rounded-xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center text-gray-400 hover:border-indigo-300 hover:text-indigo-400 transition cursor-pointer ${uploading ? "opacity-50 pointer-events-none" : ""}`}>
      <FontAwesomeIcon icon={uploading ? faSpinner : faPlus} spin={uploading} />
      <span className="text-xs mt-1">{uploading ? "Uploading..." : "Add"}</span>
      <input
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleImageUpload}
      />
    </label>
  </div>
</div>

        {/* Basic Info */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
          <p className="text-sm font-semibold text-gray-600">Basic Info</p>

          <div>
            <label className="text-xs text-gray-500 mb-1 block">Title *</label>
            <input
              value={form.title}
              onChange={e => set("title", e.target.value)}
              placeholder="What are you selling?"
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-indigo-400"
            />
          </div>

          <div>
            <label className="text-xs text-gray-500 mb-1 block">Description *</label>
            <textarea
              value={form.description}
              onChange={e => set("description", e.target.value)}
              placeholder="Describe your item..."
              rows={4}
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-indigo-400 resize-none"
            />
          </div>

          <div>
            <label className="text-xs text-gray-500 mb-1 block">Price (₦) *</label>
            <input
              type="number"
              value={form.price}
              onChange={e => set("price", e.target.value)}
              placeholder="0"
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-indigo-400"
            />
          </div>
        </div>

        {/* Details */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
          <p className="text-sm font-semibold text-gray-600">Details</p>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Type</label>
              <select
                value={form.type}
                onChange={e => set("type", e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-indigo-400"
              >
                {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Condition</label>
              <select
                value={form.condition}
                onChange={e => set("condition", e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-indigo-400"
              >
                {CONDITIONS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs text-gray-500 mb-1 block">Category</label>
            <select
              value={form.category}
              onChange={e => set("category", e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-indigo-400"
            >
              <option value="">Select category</option>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>

        {/* Tags */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <p className="text-sm font-semibold text-gray-600 mb-3 flex items-center gap-2">
            <FontAwesomeIcon icon={faTag} className="text-indigo-400" /> Tags
          </p>
          <div className="flex gap-2 mb-3">
            <input
              value={tagInput}
              onChange={e => setTagInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && addTag()}
              placeholder="Add a tag..."
              className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-indigo-400"
            />
            <button
              onClick={addTag}
              className="px-3 py-2 bg-indigo-500 text-white rounded-xl text-sm hover:bg-indigo-600 transition"
            >
              <FontAwesomeIcon icon={faPlus} />
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {form.tags.map(tag => (
              <span key={tag} className="flex items-center gap-1.5 px-3 py-1 bg-indigo-50 text-indigo-600 rounded-full text-xs font-medium">
                {tag}
                <button onClick={() => removeTag(tag)}>
                  <FontAwesomeIcon icon={faTimes} className="text-indigo-400 hover:text-red-400 transition" />
                </button>
              </span>
            ))}
          </div>
        </div>

        {/* Submit */}
        <button
          onClick={submit}
          disabled={submitting || !form.title || !form.description || !form.price}
          className="w-full py-3 bg-indigo-500 text-white rounded-2xl font-semibold hover:bg-indigo-600 transition disabled:opacity-50"
        >
          {submitting ? "Creating..." : "Create Listing"}
        </button>
      </div>
    </div>
  );
}

export default CreateListing;