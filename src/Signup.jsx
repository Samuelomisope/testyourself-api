import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { auth, db } from "./firebase";
import { doc, setDoc } from "firebase/firestore";
import {
  GoogleAuthProvider, signInWithPopup, createUserWithEmailAndPassword,
  updateProfile, sendEmailVerification,
} from "firebase/auth";
import { getFaculties, getDepartments } from "./universities";
import { getUniversities } from "./api";
import { getEmailDomainWarning } from "./domainCheck";
import login1 from "./assets/login1.webp";
import login2 from "./assets/login2.avif";
import login3 from "./assets/login3.webp";

// FIX #1: Move images outside component — not recreated on every render
const images = [login1, login2, login3];

function Signup() {
  const [currentImage, setCurrentImage] = useState(0);

  useEffect(() => {
    const twelveHours = 12 * 60 * 60 * 1000;
    const interval = setInterval(() => {
      setCurrentImage((prev) => (prev + 1) % images.length);
    }, twelveHours);
    return () => clearInterval(interval);
  }, []);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [profilePicture, setProfilePicture] = useState(null);
  const [profilePreview, setProfilePreview] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const [university, setUniversity] = useState("");
  const [customUniversity, setCustomUniversity] = useState("");
  const [domainWarning, setDomainWarning] = useState("");
  const [faculty, setFaculty] = useState("");
  const [department, setDepartment] = useState("");
  const [customDepartment, setCustomDepartment] = useState("");
  const [isCustomUni, setIsCustomUni] = useState(false);
  const [universitiesList, setUniversitiesList] = useState([]);

  const selectedUni = isCustomUni ? customUniversity : university;
  const faculties = getFaculties(university);
  const departments = getDepartments(university, faculty);

  useEffect(() => {
    getUniversities().then(data => setUniversitiesList(data));
  }, []);

  // FIX #4: Revoke old blob URL before creating a new one — prevents memory leak
  const handleProfilePicture = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (profilePreview) URL.revokeObjectURL(profilePreview);
    setProfilePicture(file);
    setProfilePreview(URL.createObjectURL(file));
  };

  const signUpWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    try {
      setLoading(true);
      setError("");
      const result = await signInWithPopup(auth, provider);

      // FIX #3: Add { merge: true } to avoid overwriting existing user data
      await setDoc(doc(db, "users", result.user.uid), {
        uid: result.user.uid,
        displayName: result.user.displayName,
        email: result.user.email,
        photoURL: result.user.photoURL || null,
        createdAt: new Date(),
      }, { merge: true });

      // FIX #6: Pass fromLogin state so Home.jsx shows the welcome toast
      navigate("/home", { state: { fromLogin: true } });
    } catch (err) {
      console.error(err);
      setError("Failed to sign up with Google. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async (e) => {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    try {
      setLoading(true);
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);

      // FIX #2: Upload photo to real storage — never store blob URLs in Firebase
      let uploadedPhotoURL = null;
      if (profilePicture) {
        try {
          const { uploadSingle } = await import("./useUpload");
          uploadedPhotoURL = await uploadSingle(profilePicture, "profile");
        } catch (uploadErr) {
          console.error("Photo upload failed, continuing without photo:", uploadErr);
        }
      }

      await updateProfile(userCredential.user, {
        displayName: fullName,
        photoURL: uploadedPhotoURL || null,
      });

      // FIX #3: Add { merge: true } to avoid overwriting existing user data
      await setDoc(doc(db, "users", userCredential.user.uid), {
        uid: userCredential.user.uid,
        displayName: fullName,
        email: email,
        photoURL: uploadedPhotoURL || null,
        university: selectedUni,
        faculty: faculty,
        department: department === "custom" ? customDepartment : department,
        emailVerified: false,
        createdAt: new Date(),
      }, { merge: true });

      await sendEmailVerification(userCredential.user);
      navigate("/verify-email");
    } catch (err) {
      console.error(err);
      switch (err.code) {
        case "auth/email-already-in-use":
          setError("An account with this email already exists.");
          break;
        case "auth/invalid-email":
          setError("Invalid email address.");
          break;
        case "auth/weak-password":
          setError("Password is too weak. Use at least 6 characters.");
          break;
        default:
          setError("Failed to create account. Please try again.");
      }
    } finally {
      setLoading(false);
    }
    
  };

  return (
    <div className="flex w-full bg-gray-100 min-h-screen">
      <div className="w-full md:inline-block hidden h-full relative">
        <img className="h-full w-full object-cover" src={images[currentImage]} alt="leftSideImage" />
        <div className="absolute inset-0 bg-gradient-to-r from-gray-100 via-transparent to-gray-100" />
      </div>
      <div className="h-screen border-l-2 border-gray-300" />

      <div className="w-full flex flex-col items-center justify-center py-10">
        <form
          onSubmit={handleSignup}
          className="md:w-96 w-80 flex flex-col items-center justify-center space-y-4"
        >
          <h2 style={{ fontFamily: "'Nunito', sans-serif" }} className="text-4xl text-indigo-500 font-bold">
            TestYourSelf
          </h2>
          <p className="text-sm text-gray-500/90">Create your account to get started.</p>

          {error && <p className="text-red-500 text-sm w-full text-center">{error}</p>}

          {/* Profile Picture */}
          <div className="flex flex-col items-center gap-2">
            <div className="w-20 h-20 rounded-full bg-gray-200 overflow-hidden border border-gray-300">
              {profilePreview ? (
                <img src={profilePreview} alt="Profile" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-400 text-sm">
                  Photo
                </div>
              )}
            </div>
            <label className="text-sm text-indigo-500 cursor-pointer hover:underline">
              Upload Photo
              <input type="file" accept="image/*" onChange={handleProfilePicture} className="hidden" />
            </label>
          </div>

          {/* Google Button */}
          <button
            type="button"
            onClick={signUpWithGoogle}
            disabled={loading}
            className="w-full bg-white border border-gray-300 flex items-center justify-center h-12 rounded-full hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Please wait..." : (
              <img
                src="https://raw.githubusercontent.com/prebuiltui/prebuiltui/main/assets/login/googleLogo.svg"
                alt="Sign up with Google"
              />
            )}
          </button>

          <div className="flex items-center gap-4 w-full">
            <div className="w-full h-px bg-gray-300/90" />
            <p className="w-full text-nowrap text-sm text-gray-500/90">or sign up with email</p>
            <div className="w-full h-px bg-gray-300/90" />
          </div>

          {/* Full Name */}
          <div className="flex items-center w-full border border-gray-300/60 h-12 rounded-full pl-6 gap-2 bg-white">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z" fill="#6B7280" />
            </svg>
            <input
              type="text"
              placeholder="Full Name"
              value={fullName}
              onChange={(e) => { setFullName(e.target.value); setError(""); }}
              className="w-full bg-transparent text-black placeholder-gray-500 outline-none text-sm"
              required
            />
          </div>

          {/* University */}
          <div className="flex items-center w-full border border-gray-300/60 rounded-full pl-6 gap-2 bg-white">
            <select
              value={isCustomUni ? "custom" : university}
              onChange={(e) => {
                if (e.target.value === "custom") {
                  setIsCustomUni(true);
                  setUniversity("");
                  // FIX #5: Reset faculty/department when switching to custom to avoid stale dropdowns
                  setFaculty("");
                  setDepartment("");
                } else {
                  setIsCustomUni(false);
                  setUniversity(e.target.value);
                  setFaculty("");
                  setDepartment("");
                }
              }}
              className="w-full bg-transparent text-gray-500 outline-none text-sm py-3 pr-4"
            >
              <option value="">Select University</option>
              {universitiesList.map(u => (
                <option key={u.id} value={u.shortName || u.name}>
                  {u.name}
                </option>
              ))}
              <option value="custom">Other (type your own)</option>
            </select>
          </div>

          {isCustomUni && (
            <input
              type="text"
              placeholder="Enter your university name"
              value={customUniversity}
              onChange={(e) => setCustomUniversity(e.target.value)}
              className="w-full border border-gray-300/60 rounded-full pl-6 py-3 text-sm bg-white outline-none"
            />
          )}

          {/* Faculty — only show if known university selected */}
          {university && !isCustomUni && faculties.length > 0 && (
            <div className="flex items-center w-full border border-gray-300/60 rounded-full pl-6 gap-2 bg-white">
              <select
                value={faculty}
                onChange={(e) => { setFaculty(e.target.value); setDepartment(""); }}
                className="w-full bg-transparent text-gray-500 outline-none text-sm py-3 pr-4"
              >
                <option value="">Select Faculty / School</option>
                {faculties.map(f => (
                  <option key={f.name} value={f.name}>{f.name} — {f.fullName}</option>
                ))}
              </select>
            </div>
          )}

          {/* Department */}
          {(faculty || isCustomUni) && (
            <div className="flex items-center w-full border border-gray-300/60 rounded-full pl-6 gap-2 bg-white">
              <select
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                className="w-full bg-transparent text-gray-500 outline-none text-sm py-3 pr-4"
              >
                <option value="">Select Department</option>
                {departments.map(d => <option key={d} value={d}>{d}</option>)}
                <option value="custom">Other (type your own)</option>
              </select>
            </div>
          )}

          {department === "custom" && (
            <input
              type="text"
              placeholder="Enter your department"
              value={customDepartment}
              onChange={(e) => setCustomDepartment(e.target.value)}
              className="w-full border border-gray-300/60 rounded-full pl-6 py-3 text-sm bg-white outline-none"
            />
          )}

          {/* Email */}
          <div className="flex items-center w-full border border-gray-300/60 h-12 rounded-full pl-6 gap-2 bg-white">
            <svg width="19" height="11" viewBox="0 0 16 11" fill="none">
              <path fillRule="evenodd" clipRule="evenodd" d="M0 .55.571 0H15.43l.57.55v9.9l-.571.55H.57L0 10.45zm1.143 1.138V9.9h13.714V1.69l-6.503 4.8h-.697zM13.749 1.1H2.25L8 5.356z" fill="#6B7280" />
            </svg>
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setError("");
                setDomainWarning(getEmailDomainWarning(e.target.value));
              }}
              className="w-full bg-transparent text-black placeholder-gray-500 outline-none text-sm"
              required
            />
          </div>
          {domainWarning && (
            <p className="text-yellow-500 text-xs w-full px-2">{domainWarning}</p>
          )}

          {/* Password */}
          <div className="flex items-center w-full border border-gray-300/60 h-12 rounded-full pl-6 gap-2 bg-white">
            <svg width="13" height="19" viewBox="0 0 13 17" fill="none">
              <path d="M13 8.5c0-.938-.729-1.7-1.625-1.7h-.812V4.25C10.563 1.907 8.74 0 6.5 0S2.438 1.907 2.438 4.25V6.8h-.813C.729 6.8 0 7.562 0 8.5v6.8c0 .938.729 1.7 1.625 1.7h9.75c.896 0 1.625-.762 1.625-1.7zM4.063 4.25c0-1.406 1.093-2.55 2.437-2.55s2.438 1.144 2.438 2.55V6.8H4.061z" fill="#6B7280" />
            </svg>
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(""); }}
              className="w-full bg-transparent text-gray-500/80 placeholder-gray-500/80 outline-none text-sm"
              required
            />
          </div>

          {/* Confirm Password */}
          <div className="flex items-center w-full border border-gray-300/60 h-12 rounded-full pl-6 gap-2 bg-white">
            <svg width="13" height="19" viewBox="0 0 13 17" fill="none">
              <path d="M13 8.5c0-.938-.729-1.7-1.625-1.7h-.812V4.25C10.563 1.907 8.74 0 6.5 0S2.438 1.907 2.438 4.25V6.8h-.813C.729 6.8 0 7.562 0 8.5v6.8c0 .938.729 1.7 1.625 1.7h9.75c.896 0 1.625-.762 1.625-1.7zM4.063 4.25c0-1.406 1.093-2.55 2.437-2.55s2.438 1.144 2.438 2.55V6.8H4.061z" fill="#6B7280" />
            </svg>
            <input
              type="password"
              placeholder="Confirm Password"
              value={confirmPassword}
              onChange={(e) => { setConfirmPassword(e.target.value); setError(""); }}
              className="w-full bg-transparent text-gray-500/80 placeholder-gray-500/80 outline-none text-sm"
              required
            />
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="w-full h-12 rounded-full text-white bg-indigo-500 hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Creating account..." : "Sign Up"}
          </button>

          <p className="text-gray-500/90 text-sm">
            Already have an account?{" "}
            <a className="text-indigo-400 hover:underline" href="/">Login</a>
          </p>
          <p className="text-gray-400 text-sm">
            By signing up, you agree to our Terms of Service and Privacy Policy.
          </p>
        </form>
        <div className="w-full border-t-2 border-gray-300" />
      </div>
    </div>
  );
}

export default Signup;
