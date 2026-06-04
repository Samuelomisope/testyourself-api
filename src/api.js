import { auth } from "./firebase";
import { getIdToken } from "firebase/auth";

const BASE_URL = "http://localhost:3000";

async function getAuthHeaders() {
  const user = auth.currentUser;
  if (!user) throw new Error("Not authenticated");
  const token = await getIdToken(user);
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

// GET request
export async function apiGet(path) {
  const headers = await getAuthHeaders();
  const res = await fetch(`${BASE_URL}${path}`, { headers });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

// POST request
export async function apiPost(path, body) {
  const headers = await getAuthHeaders();
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

// PATCH request
export async function apiPatch(path, body) {
  const headers = await getAuthHeaders();
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

// DELETE request
export async function apiDelete(path) {
  const headers = await getAuthHeaders();
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "DELETE",
    headers,
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

// Get all universities
export async function getUniversities() {
  const res = await fetch("http://localhost:3000/universities");
  if (!res.ok) throw new Error("Failed to fetch universities");
  return res.json();
}

export async function updateMe(data) {
    return apiPatch("/users/me", data)
}

export async function getUniversityByName(name) {
  const universities = await getUniversities();
  return universities.find(u => u.name === name || u.shortName === name) || null;
}