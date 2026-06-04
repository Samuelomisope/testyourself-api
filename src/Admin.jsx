import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { auth } from "./firebase";
import { getIdToken } from "firebase/auth";
import { useAuth } from "./useAuth";
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faRobot, faBook, faUsers, faShoppingBag, faGraduationCap,
  faFlag, faBan, faCheckCircle, faChartBar, faStore, faStar
} from '@fortawesome/free-solid-svg-icons'

const ADMIN_EMAILS = ["omisope34@gmail.com"];

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

// ── Stat Card ──────────────────────────────────────────────────────────────
function StatCard({ label, value, icon, color }) {
  return (
    <div className={`bg-white rounded-2xl p-5 border-l-4 shadow-sm flex items-center gap-4 ${color}`}>
      <div className="text-3xl">{icon}</div>
      <div>
        <p className="text-2xl font-bold text-gray-800">{value ?? "—"}</p>
        <p className="text-xs text-gray-500 mt-0.5">{label}</p>
      </div>
    </div>
  );
}

// ── Confirm Modal ──────────────────────────────────────────────────────────
function ConfirmModal({ message, onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl">
        <p className="text-gray-700 text-sm mb-5">{message}</p>
        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition">Cancel</button>
          <button onClick={onConfirm} className="flex-1 py-2 rounded-xl bg-red-500 text-white text-sm hover:bg-red-600 transition">Delete</button>
        </div>
      </div>
    </div>
  );
}

// ── Users Tab ──────────────────────────────────────────────────────────────
function UsersTab() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [confirm, setConfirm] = useState(null);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;

  useEffect(() => {
    apiFetch("/admin/users").then(setUsers).catch(console.error).finally(() => setLoading(false));
  }, []);

  const deleteUser = async (id) => {
    try {
      await apiFetch(`/admin/users/${id}`, { method: "DELETE" });
      setUsers(u => u.filter(x => x.id !== id));
    } catch (err) { console.error(err); }
  };

  const filtered = users.filter(u =>
    u.displayName?.toLowerCase().includes(search.toLowerCase()) ||
    u.email?.toLowerCase().includes(search.toLowerCase())
  );

  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);

  return (
    <div>
      <input
        type="text" placeholder="Search users..." value={search}
        onChange={e => { setSearch(e.target.value); setPage(1); }}
        className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm mb-4 outline-none focus:border-indigo-400"
      />
      {loading ? <p className="text-gray-400 text-sm text-center py-10">Loading...</p> : (
        <>
          <div className="overflow-x-auto rounded-2xl border border-gray-100">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                <tr>
                  <th className="px-4 py-3 text-left">User</th>
                  <th className="px-4 py-3 text-left">Email</th>
                  <th className="px-4 py-3 text-left">University</th>
                  <th className="px-4 py-3 text-left">Joined</th>
                  <th className="px-4 py-3 text-left">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {paginated.map(u => (
                  <tr key={u.id} className="hover:bg-gray-50 transition">
                    {/* User cell with banned badge */}
                    <td className="px-4 py-3 flex items-center gap-2">
                      <img
                        src={u.photoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${u.displayName}`}
                        className="w-7 h-7 rounded-full object-cover"
                        alt=""
                      />
                      <span className="font-medium text-gray-800">{u.displayName || "—"}</span>
                      {u.isBanned && (
                        <span className="px-1.5 py-0.5 bg-red-100 text-red-500 rounded text-xs">Banned</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500">{u.email}</td>
                    <td className="px-4 py-3 text-gray-500">{u.university?.shortName || "—"}</td>
                    <td className="px-4 py-3 text-gray-400">{u.createdAt ? new Date(u.createdAt).toLocaleDateString() : "—"}</td>
                    {/* Action cell with Ban + Delete */}
                    <td className="px-4 py-3 flex items-center gap-2">
                      <button
                        onClick={async () => {
                          try {
                            const token = await getIdToken(auth.currentUser, true);
                            await fetch(`${API}/admin/users/${u.id}/ban`, {
                              method: "PATCH",
                              headers: { Authorization: `Bearer ${token}` },
                            });
                            setUsers(prev => prev.map(x => x.id === u.id ? { ...x, isBanned: !x.isBanned } : x));
                          } catch (err) { console.error(err); }
                        }}
                        className={`text-xs font-medium transition ${u.isBanned ? "text-green-500 hover:text-green-700" : "text-orange-400 hover:text-orange-600"}`}
                      >
                        {u.isBanned ? "Unban" : "Ban"}
                      </button>
                      <button
                        onClick={() => setConfirm({ id: u.id, name: u.displayName })}
                        className="text-red-400 hover:text-red-600 text-xs font-medium transition"
                      >Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && <p className="text-center text-gray-400 py-8 text-sm">No users found.</p>}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-4">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-40"
              >Previous</button>
              <span className="text-sm text-gray-500">Page {page} of {totalPages}</span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-40"
              >Next</button>
            </div>
          )}
        </>
      )}
      {confirm && (
        <ConfirmModal
          message={`Delete user "${confirm.name}"? This cannot be undone.`}
          onConfirm={() => { deleteUser(confirm.id); setConfirm(null); }}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}

// ── Study Materials Tab ────────────────────────────────────────────────────
function MaterialsTab() {
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [confirm, setConfirm] = useState(null);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;

  useEffect(() => {
    apiFetch("/admin/materials").then(setMaterials).catch(console.error).finally(() => setLoading(false));
  }, []);

  const deleteMaterial = async (id) => {
    try {
      await apiFetch(`/admin/materials/${id}`, { method: "DELETE" });
      setMaterials(m => m.filter(x => x.id !== id));
    } catch (err) { console.error(err); }
  };

  const filtered = materials.filter(m =>
    m.title?.toLowerCase().includes(search.toLowerCase()) ||
    m.faculty?.toLowerCase().includes(search.toLowerCase())
  );

  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);

  return (
    <div>
      <input
        type="text" placeholder="Search materials..." value={search}
        onChange={e => { setSearch(e.target.value); setPage(1); }}
        className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm mb-4 outline-none focus:border-indigo-400"
      />
      {loading ? <p className="text-gray-400 text-sm text-center py-10">Loading...</p> : (
        <>
          <div className="overflow-x-auto rounded-2xl border border-gray-100">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                <tr>
                  <th className="px-4 py-3 text-left">Title</th>
                  <th className="px-4 py-3 text-left">Uploaded By</th>
                  <th className="px-4 py-3 text-left">Faculty</th>
                  <th className="px-4 py-3 text-left">Visibility</th>
                  <th className="px-4 py-3 text-left">Date</th>
                  <th className="px-4 py-3 text-left">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {paginated.map(m => (
                  <tr key={m.id} className="hover:bg-gray-50 transition">
                    <td className="px-4 py-3 font-medium text-gray-800 max-w-[180px] truncate">{m.title}</td>
                    <td className="px-4 py-3 text-gray-500">{m.user?.displayName || "—"}</td>
                    <td className="px-4 py-3 text-gray-500">{m.faculty || "—"}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${m.isPublic ? "bg-green-100 text-green-600" : "bg-gray-100 text-gray-500"}`}>
                        {m.isPublic ? "Public" : "Private"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-400">{new Date(m.createdAt).toLocaleDateString()}</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setConfirm({ id: m.id, name: m.title })}
                        className="text-red-400 hover:text-red-600 text-xs font-medium transition"
                      >Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && <p className="text-center text-gray-400 py-8 text-sm">No materials found.</p>}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-4">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-40"
              >Previous</button>
              <span className="text-sm text-gray-500">Page {page} of {totalPages}</span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-40"
              >Next</button>
            </div>
          )}
        </>
      )}
      {confirm && (
        <ConfirmModal
          message={`Delete "${confirm.name}"? This cannot be undone.`}
          onConfirm={() => { deleteMaterial(confirm.id); setConfirm(null); }}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}

// ── Products Tab ───────────────────────────────────────────────────────────
function ProductsTab() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [confirm, setConfirm] = useState(null);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;

  useEffect(() => {
    apiFetch("/admin/products").then(setProducts).catch(console.error).finally(() => setLoading(false));
  }, []);

  const deleteProduct = async (id) => {
    try {
      await apiFetch(`/admin/products/${id}`, { method: "DELETE" });
      setProducts(p => p.filter(x => x.id !== id));
    } catch (err) { console.error(err); }
  };

  const filtered = products.filter(p =>
    p.title?.toLowerCase().includes(search.toLowerCase())
  );

  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);

  return (
    <div>
      <input
        type="text" placeholder="Search products..." value={search}
        onChange={e => { setSearch(e.target.value); setPage(1); }}
        className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm mb-4 outline-none focus:border-indigo-400"
      />
      {loading ? <p className="text-gray-400 text-sm text-center py-10">Loading...</p> : (
        <>
          <div className="overflow-x-auto rounded-2xl border border-gray-100">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                <tr>
                  <th className="px-4 py-3 text-left">Title</th>
                  <th className="px-4 py-3 text-left">Seller</th>
                  <th className="px-4 py-3 text-left">Price</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">Date</th>
                  <th className="px-4 py-3 text-left">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {paginated.map(p => (
                  <tr key={p.id} className="hover:bg-gray-50 transition">
                    <td className="px-4 py-3 font-medium text-gray-800 max-w-[180px] truncate">{p.title}</td>
                    <td className="px-4 py-3 text-gray-500">{p.user?.displayName || "—"}</td>
                    <td className="px-4 py-3 text-gray-700">₦{p.price?.toLocaleString()}</td>
                    <td className="px-4 py-3">
                      {/* Updated status badge using p.status */}
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        p.status === "ACTIVE" ? "bg-green-100 text-green-600" :
                        p.status === "SOLD" ? "bg-red-100 text-red-500" :
                        "bg-gray-100 text-gray-500"
                      }`}>
                        {p.status || "ACTIVE"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-400">{new Date(p.createdAt).toLocaleDateString()}</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setConfirm({ id: p.id, name: p.title })}
                        className="text-red-400 hover:text-red-600 text-xs font-medium transition"
                      >Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && <p className="text-center text-gray-400 py-8 text-sm">No products found.</p>}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-4">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-40"
              >Previous</button>
              <span className="text-sm text-gray-500">Page {page} of {totalPages}</span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-40"
              >Next</button>
            </div>
          )}
        </>
      )}
      {confirm && (
        <ConfirmModal
          message={`Delete "${confirm.name}"? This cannot be undone.`}
          onConfirm={() => { deleteProduct(confirm.id); setConfirm(null); }}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}

// ── Universities Tab ───────────────────────────────────────────────────────
function UniversitiesTab() {
  const [universities, setUniversities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [newShort, setNewShort] = useState("");
  const [adding, setAdding] = useState(false);
  const [confirm, setConfirm] = useState(null);

  useEffect(() => {
    apiFetch("/universities").then(setUniversities).catch(console.error).finally(() => setLoading(false));
  }, []);

  const addUniversity = async () => {
    if (!newName.trim()) return;
    setAdding(true);
    try {
      const created = await apiFetch("/universities", {
        method: "POST",
        body: JSON.stringify({ name: newName, shortName: newShort }),
      });
      setUniversities(u => [...u, created]);
      setNewName(""); setNewShort("");
    } catch (err) { console.error(err); }
    setAdding(false);
  };

  const deleteUniversity = async (id) => {
    try {
      await apiFetch(`/admin/universities/${id}`, { method: "DELETE" });
      setUniversities(u => u.filter(x => x.id !== id));
    } catch (err) { console.error(err); }
  };

  return (
    <div>
      {/* Add University */}
      <div className="flex gap-2 mb-4">
        <input
          type="text" placeholder="University full name *" value={newName}
          onChange={e => setNewName(e.target.value)}
          className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-indigo-400"
        />
        <input
          type="text" placeholder="Short name e.g. UNILAG" value={newShort}
          onChange={e => setNewShort(e.target.value)}
          className="w-36 border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-indigo-400"
        />
        <button
          onClick={addUniversity} disabled={adding}
          className="bg-indigo-500 text-white px-4 py-2.5 rounded-xl text-sm hover:bg-indigo-600 transition disabled:opacity-50"
        >Add</button>
      </div>

      {loading ? <p className="text-gray-400 text-sm text-center py-10">Loading...</p> : (
        <div className="overflow-x-auto rounded-2xl border border-gray-100">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
              <tr>
                <th className="px-4 py-3 text-left">Name</th>
                <th className="px-4 py-3 text-left">Short Name</th>
                <th className="px-4 py-3 text-left">Country</th>
                <th className="px-4 py-3 text-left">Verified</th>
                <th className="px-4 py-3 text-left">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {universities.map(u => (
                <tr key={u.id} className="hover:bg-gray-50 transition">
                  <td className="px-4 py-3 font-medium text-gray-800">{u.name}</td>
                  <td className="px-4 py-3 text-gray-500">{u.shortName || "—"}</td>
                  <td className="px-4 py-3 text-gray-500">{u.country || "—"}</td>
                  {/* Verified toggle */}
                  <td className="px-4 py-3">
                    <button
                      onClick={async () => {
                        try {
                          const token = await getIdToken(auth.currentUser, true);
                          await fetch(`${API}/universities/${u.id}`, {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                            body: JSON.stringify({ isVerified: !u.isVerified }),
                          });
                          setUniversities(prev => prev.map(x => x.id === u.id ? { ...x, isVerified: !x.isVerified } : x));
                        } catch (err) { console.error(err); }
                      }}
                      className={`px-3 py-1 rounded-full text-xs font-medium transition flex items-center gap-1 ${
                        u.isVerified
                          ? "bg-green-100 text-green-600 hover:bg-green-200"
                          : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                      }`}
                    >
                      {u.isVerified
                        ? <><FontAwesomeIcon icon={faCheckCircle} className="text-green-500" /> Verified</>
                        : "Verify"
                      }
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => setConfirm({ id: u.id, name: u.name })}
                      className="text-red-400 hover:text-red-600 text-xs font-medium transition"
                    >Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {universities.length === 0 && <p className="text-center text-gray-400 py-8 text-sm">No universities found.</p>}
        </div>
      )}
      {confirm && (
        <ConfirmModal
          message={`Delete "${confirm.name}"? This cannot be undone.`}
          onConfirm={() => { deleteUniversity(confirm.id); setConfirm(null); }}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}

// ── Reports Tab ────────────────────────────────────────────────────────────
function ReportsTab() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch("/admin/reports").then(setReports).catch(() => setReports([])).finally(() => setLoading(false));
  }, []);

  const resolve = async (id) => {
    try {
      await apiFetch(`/admin/reports/${id}/resolve`, { method: "PATCH" });
      setReports(r => r.map(x => x.id === id ? { ...x, resolved: true } : x));
    } catch (err) { console.error(err); }
  };

  return (
    <div>
      {loading ? <p className="text-gray-400 text-sm text-center py-10">Loading...</p> : (
        reports.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-4xl mb-3 text-green-400"><FontAwesomeIcon icon={faCheckCircle} /></p>
            <p className="text-gray-500 font-medium">No reports yet</p>
            <p className="text-gray-400 text-sm mt-1">Everything looks clean!</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {reports.map(r => (
              <div key={r.id} className={`bg-white rounded-2xl p-4 border shadow-sm ${r.status === "RESOLVED" ? "opacity-50" : ""}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-gray-800">{r.reason}</p>
                    <p className="text-xs text-gray-400 mt-1">Reported by: {r.reporter?.displayName || "Unknown"}</p>
                    <p className="text-xs text-gray-400">Target: {r.targetType} — {r.targetId}</p>
                    <p className="text-xs text-gray-400">{new Date(r.createdAt).toLocaleDateString()}</p>
                  </div>
                  {!r.resolved && (
                    <button
                      onClick={() => resolve(r.id)}
                      className="shrink-0 px-3 py-1.5 bg-green-100 text-green-600 rounded-full text-xs font-medium hover:bg-green-200 transition"
                    >Resolve</button>
                  )}
                  {r.status === "RESOLVED" && (
                    <span className="shrink-0 px-3 py-1.5 bg-gray-100 text-gray-400 rounded-full text-xs font-medium">Resolved</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}


// ── Sellers Tab ────────────────────────────────────────────────────
function SellersTab() {
  const [sellers, setSellers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [confirm, setConfirm] = useState(null);

  useEffect(() => {
    apiFetch("/admin/sellers").then(setSellers).catch(console.error).finally(() => setLoading(false));
  }, []);

  const deleteSeller = async (id) => {
    try {
      await apiFetch(`/admin/sellers/${id}`, { method: "DELETE" });
      setSellers(s => s.filter(x => x.id !== id));
    } catch (err) { console.error(err); }
  };

  return (
    <div>
      {loading ? <p className="text-gray-400 text-sm text-center py-10">Loading...</p> : (
        <div className="overflow-x-auto rounded-2xl border border-gray-100">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
              <tr>
                <th className="px-4 py-3 text-left">Seller</th>
                <th className="px-4 py-3 text-left">Email</th>
                <th className="px-4 py-3 text-left">ChatSnap</th>
                <th className="px-4 py-3 text-left">WhatsApp</th>
                <th className="px-4 py-3 text-left">Rating</th>
                <th className="px-4 py-3 text-left">Sales</th>
                <th className="px-4 py-3 text-left">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sellers.map(s => (
                <tr key={s.id} className="hover:bg-gray-50 transition">
                  <td className="px-4 py-3 flex items-center gap-2">
                    <img
                      src={s.user?.photoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${s.user?.displayName}`}
                      className="w-7 h-7 rounded-full object-cover"
                      alt=""
                    />
                    <span className="font-medium text-gray-800">{s.user?.displayName || "—"}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{s.user?.email || "—"}</td>
                  <td className="px-4 py-3 text-gray-500">{s.chatSnapUsername || "—"}</td>
                  <td className="px-4 py-3 text-gray-500">{s.whatsapp || "—"}</td>
                  <td className="px-4 py-3 text-yellow-500 flex items-center gap-1">
                    <FontAwesomeIcon icon={faStar} />
                    {s.rating > 0 ? s.rating.toFixed(1) : "—"}
                  </td>
                  <td className="px-4 py-3 text-gray-500">{s.totalSales}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => setConfirm({ id: s.id, name: s.user?.displayName })}
                      className="text-red-400 hover:text-red-600 text-xs font-medium transition"
                    >Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {sellers.length === 0 && <p className="text-center text-gray-400 py-8 text-sm">No sellers found.</p>}
        </div>
      )}
      {confirm && (
        <ConfirmModal
          message={`Remove seller profile for "${confirm.name}"? This cannot be undone.`}
          onConfirm={() => { deleteSeller(confirm.id); setConfirm(null); }}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}

// ── Reviews Tab ────────────────────────────────────────────────────
function ReviewsTab() {
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [confirm, setConfirm] = useState(null);

  useEffect(() => {
    apiFetch("/admin/reviews").then(setReviews).catch(console.error).finally(() => setLoading(false));
  }, []);

  const deleteReview = async (id) => {
    try {
      await apiFetch(`/admin/reviews/${id}`, { method: "DELETE" });
      setReviews(r => r.filter(x => x.id !== id));
    } catch (err) { console.error(err); }
  };

  return (
    <div>
      {loading ? <p className="text-gray-400 text-sm text-center py-10">Loading...</p> : (
        <div className="overflow-x-auto rounded-2xl border border-gray-100">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
              <tr>
                <th className="px-4 py-3 text-left">Reviewer</th>
                <th className="px-4 py-3 text-left">Item</th>
                <th className="px-4 py-3 text-left">Rating</th>
                <th className="px-4 py-3 text-left">Comment</th>
                <th className="px-4 py-3 text-left">Date</th>
                <th className="px-4 py-3 text-left">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {reviews.map(r => (
                <tr key={r.id} className="hover:bg-gray-50 transition">
                  <td className="px-4 py-3 font-medium text-gray-800">{r.user?.displayName || "—"}</td>
                  <td className="px-4 py-3 text-gray-500 max-w-[150px] truncate">{r.item?.title || "—"}</td>
                  <td className="px-4 py-3 text-yellow-500 flex items-center gap-1">
                    <FontAwesomeIcon icon={faStar} /> {r.rating}
                  </td>
                  <td className="px-4 py-3 text-gray-500 max-w-[200px] truncate">{r.comment || "—"}</td>
                  <td className="px-4 py-3 text-gray-400">{new Date(r.createdAt).toLocaleDateString()}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => setConfirm({ id: r.id })}
                      className="text-red-400 hover:text-red-600 text-xs font-medium transition"
                    >Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {reviews.length === 0 && <p className="text-center text-gray-400 py-8 text-sm">No reviews found.</p>}
        </div>
      )}
      {confirm && (
        <ConfirmModal
          message="Delete this review? This cannot be undone."
          onConfirm={() => { deleteReview(confirm.id); setConfirm(null); }}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}

// ── Main Admin Component ───────────────────────────────────────────────────
function Admin() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("overview");
  const [stats, setStats] = useState(null);

    useEffect(() => {
    apiFetch("/admin/stats").then(setStats).catch(console.error);
  }, []);

  // Guard — only admin email allowed
  if (user && !ADMIN_EMAILS.includes(user.email)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <p className="text-5xl mb-4"><FontAwesomeIcon icon={faBan} /></p>
          <p className="text-gray-700 font-semibold">Access Denied</p>
          <p className="text-gray-400 text-sm mt-1">You don't have permission to view this page.</p>
          <button onClick={() => navigate("/home")} className="mt-4 px-5 py-2 bg-indigo-500 text-white rounded-full text-sm hover:bg-indigo-600 transition">
            Go Home
          </button>
        </div>
      </div>
    );
  }

  const tabs = [
  { id: "overview", label: "Overview", icon: <FontAwesomeIcon icon={faRobot} /> },
  { id: "users", label: "Users", icon: <FontAwesomeIcon icon={faUsers} /> },
  { id: "materials", label: "Materials", icon: <FontAwesomeIcon icon={faBook} /> },
  { id: "products", label: "Products", icon: <FontAwesomeIcon icon={faShoppingBag} /> },
  { id: "sellers", label: "Sellers", icon: <FontAwesomeIcon icon={faStore} /> },
  { id: "reviews", label: "Reviews", icon: <FontAwesomeIcon icon={faStar} /> },
  { id: "universities", label: "Universities", icon: <FontAwesomeIcon icon={faGraduationCap} /> },
  { id: "reports", label: "Reports", icon: <FontAwesomeIcon icon={faFlag} /> },
];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between sticky top-0 z-40 shadow-sm">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/home")} className="text-gray-400 hover:text-indigo-500 transition">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <div>
            <h1 style={{ fontFamily: "'Nunito', sans-serif" }} className="text-lg font-bold text-indigo-500">
              TestYourSelf <span className="text-gray-400 font-normal text-sm">/ Admin</span>
            </h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <img
            src={user?.photoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${user?.displayName}`}
            className="w-8 h-8 rounded-full object-cover border border-gray-200"
            alt=""
          />
          <span className="text-sm text-gray-600 hidden sm:block">{user?.displayName}</span>
          <span className="px-2 py-0.5 bg-indigo-100 text-indigo-600 rounded-full text-xs font-semibold">Admin</span>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-6">
        {/* Tabs */}
        <div className="flex gap-2 overflow-x-auto pb-2 mb-6">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition ${
                activeTab === tab.id
                  ? "bg-indigo-500 text-white shadow-sm"
                  : "bg-white border border-gray-200 text-gray-600 hover:border-indigo-300"
              }`}
            >
              <span>{tab.icon}</span> {tab.label}
            </button>
          ))}
        </div>

        {/* Overview */}
        {activeTab === "overview" && (
          <div>
            <h2 className="text-lg font-bold text-gray-700 mb-4">Platform Overview</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <StatCard label="Total Users" value={stats?.users} icon={<FontAwesomeIcon icon={faUsers} color="indigo" />} color="border-indigo-400" />
              <StatCard label="Study Materials" value={stats?.materials} icon={<FontAwesomeIcon icon={faBook} color="purple" />} color="border-purple-400" />
              <StatCard label="Products Listed" value={stats?.products} icon={<FontAwesomeIcon icon={faShoppingBag} color="pink" />} color="border-pink-400" />
              <StatCard label="Universities" value={stats?.universities} icon={<FontAwesomeIcon icon={faGraduationCap} color="green" />} color="border-green-400" />
              {/* New: Pending Reports stat */}
              <StatCard label="Pending Reports" value={stats?.pendingReports} icon={<FontAwesomeIcon icon={faFlag} color="red" />} color="border-red-400" />
            </div>

            {/* Marketplace Stats */}
        {stats?.marketplace && (
             <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <StatCard label="Total Sellers" value={stats.marketplace.sellers} icon={<FontAwesomeIcon icon={faStore} color="indigo" />} color="border-indigo-400" />
                 <StatCard label="Total Buyers" value={stats.marketplace.buyers} icon={<FontAwesomeIcon icon={faUsers} color="purple" />} color="border-purple-400" />
                <StatCard label="Active Listings" value={stats.marketplace.activeListings} icon={<FontAwesomeIcon icon={faShoppingBag} color="green" />} color="border-green-400" />
                <StatCard label="Sold Items" value={stats.marketplace.soldListings} icon={<FontAwesomeIcon icon={faCheckCircle} color="pink" />} color="border-pink-400" />
             </div>
            )}

            <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
              <p className="text-sm font-semibold text-gray-600 mb-1">Logged in as</p>
              <p className="text-gray-800">{user?.email}</p>
              <p className="text-xs text-gray-400 mt-1">You have full admin access to this platform.</p>
            </div>

            {/* Top Universities by Users */}
            {stats?.topUniversities?.length > 0 && (
              <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm mt-4">
                <p className="text-sm font-semibold text-gray-600 mb-3 flex items-center gap-2">
                  <FontAwesomeIcon icon={faChartBar} className="text-indigo-400" />
                  Top Universities by Users
                </p>
                {stats.topUniversities.map(u => (
                  <div key={u.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                    <p className="text-sm text-gray-700">{u.shortName || u.name}</p>
                    <div className="flex gap-4 text-xs text-gray-400">
                      <span className="flex items-center gap-1">
                        <FontAwesomeIcon icon={faUsers} className="text-indigo-300" />
                        {u._count.users}
                      </span>
                      <span className="flex items-center gap-1">
                        <FontAwesomeIcon icon={faBook} className="text-purple-300" />
                        {u._count.studyMaterials}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "users" && <UsersTab />}
        {activeTab === "materials" && <MaterialsTab />}
        {activeTab === "products" && <ProductsTab />}
        {activeTab === "universities" && <UniversitiesTab />}
        {activeTab === "reports" && <ReportsTab />}
        {activeTab === "sellers" && <SellersTab />}
        {activeTab === "reviews" && <ReviewsTab />}
      </div>
    </div>
  );
}

export default Admin;
