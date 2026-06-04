import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { auth } from "./firebase";
import {
  setPersistence, browserLocalPersistence, browserSessionPersistence,
  GoogleAuthProvider, signInWithPopup, signInWithEmailAndPassword,
  sendPasswordResetEmail,
} from "firebase/auth";
import { db } from "./firebase";
import { doc, setDoc } from "firebase/firestore";
import login1 from "./assets/login1.webp";
import login2 from "./assets/login2.avif";
import login3 from "./assets/login3.webp";

const images = [login1, login2, login3];

function Login() {
  const [currentImage, setCurrentImage] = useState(0);

  useEffect(() => {
    const twelveHours = 12 * 60 * 60 * 1000;

    // FIX #1: Actually apply the saved index with setCurrentImage
    const savedIndex = localStorage.getItem("imageIndex");
    if (savedIndex !== null) {
      setCurrentImage(Number(savedIndex));
    }

    const interval = setInterval(() => {
      setCurrentImage((prev) => {
        const next = (prev + 1) % images.length;
        localStorage.setItem("imageIndex", next);
        return next;
      });
    }, twelveHours);

    return () => clearInterval(interval);
  }, []);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  // FIX #4: Separate state for success messages so they don't render in red
  const [successMsg, setSuccessMsg] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const navigate = useNavigate();

  const signInWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    try {
      setLoading(true);
      setError("");
      setSuccessMsg("");
      // FIX #3: Apply persistence before Google sign-in too
      await setPersistence(auth, rememberMe ? browserLocalPersistence : browserSessionPersistence);
      const result = await signInWithPopup(auth, provider);

      await setDoc(doc(db, "users", result.user.uid), {
        uid: result.user.uid,
        displayName: result.user.displayName,
        email: result.user.email,
        photoURL: result.user.photoURL || null,
        createdAt: new Date(),
      }, { merge: true });

      // FIX #2: Pass fromLogin state so Home.jsx shows the welcome toast
      navigate("/home", { state: { fromLogin: true } });
    } catch (err) {
      console.error(err);
      setError("Failed to sign in with Google. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleEmailLogin = async (e) => {
    e.preventDefault();
    setError("");
    setSuccessMsg("");
    try {
      setLoading(true);
      await setPersistence(auth, rememberMe ? browserLocalPersistence : browserSessionPersistence);
      await signInWithEmailAndPassword(auth, email, password);
      // FIX #2: Pass fromLogin state so Home.jsx shows the welcome toast
      navigate("/home", { state: { fromLogin: true } });
    } catch {
      setError("Failed to sign in. Check your email and password and try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    setError("");
    setSuccessMsg("");
    if (!email) {
      setError("Enter your email above first, then click Forgot Password.");
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email);
      // FIX #4: Use successMsg for non-error feedback
      setSuccessMsg("Password reset email sent — check your inbox (and spam folder).");
    } catch (err) {
      console.error(err);
      setError("Failed to send reset email. Check your email address and try again.");
    }
  };

  return (
    <div className="flex w-full bg-gray-100 min-h-screen">
      <div className="w-full md:inline-block hidden h-full relative">
        <img className="h-full w-full object-cover" src={images[currentImage]} alt="leftSideImage" />
        <div className="absolute inset-0 bg-gradient-to-r from-gray-100 via-transparent to-gray-100" />
      </div>
      <div className="h-screen border-l-2 border-gray-300" />

      <div className="w-full flex flex-col items-center justify-center space-y-6">
        <form
          onSubmit={handleEmailLogin}
          className="md:w-96 w-80 flex flex-col items-center justify-center space-y-6"
        >
          <h2 style={{ fontFamily: "'Nunito', sans-serif" }} className="text-4xl text-indigo-500 font-bold">
            TestYourSelf
          </h2>
          <p className="text-sm text-gray-500/90 mt-3">Study smarter, Learn together.</p>

          {/* FIX #4: Error and success shown with different styles */}
          {error && <p className="text-red-500 text-sm w-full text-center">{error}</p>}
          {successMsg && <p className="text-green-500 text-sm w-full text-center">{successMsg}</p>}

          <button
            type="button"
            onClick={signInWithGoogle}
            disabled={loading}
            className="w-full bg-white border border-gray-300 flex items-center justify-center h-12 rounded-full hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Signing in..." : (
              <img
                src="https://raw.githubusercontent.com/prebuiltui/prebuiltui/main/assets/login/googleLogo.svg"
                alt="Google logo"
              />
            )}
          </button>

          <div className="flex items-center gap-4 w-full">
            <div className="w-full h-px bg-gray-300/90" />
            <p className="w-full text-nowrap text-sm text-gray-500/90">or sign in with email</p>
            <div className="w-full h-px bg-gray-300/90" />
          </div>

          <div className="flex flex-col w-full gap-5">
            <div className="flex items-center w-full border border-gray-300/60 h-12 rounded-full pl-9 gap-2 bg-white">
              <svg width="19" height="11" viewBox="0 0 16 11" fill="none">
                <path fillRule="evenodd" clipRule="evenodd" d="M0 .55.571 0H15.43l.57.55v9.9l-.571.55H.57L0 10.45zm1.143 1.138V9.9h13.714V1.69l-6.503 4.8h-.697zM13.749 1.1H2.25L8 5.356z" fill="#6B7280" />
              </svg>
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-transparent text-black placeholder-gray-500 outline-none text-sm"
                required
              />
            </div>

            <div className="flex items-center w-full bg-white border border-gray-300/60 h-12 rounded-full pl-6 gap-2">
              <svg width="13" height="19" viewBox="0 0 13 17" fill="none">
                <path d="M13 8.5c0-.938-.729-1.7-1.625-1.7h-.812V4.25C10.563 1.907 8.74 0 6.5 0S2.438 1.907 2.438 4.25V6.8h-.813C.729 6.8 0 7.562 0 8.5v6.8c0 .938.729 1.7 1.625 1.7h9.75c.896 0 1.625-.762 1.625-1.7zM4.063 4.25c0-1.406 1.093-2.55 2.437-2.55s2.438 1.144 2.438 2.55V6.8H4.061z" fill="#6B7280" />
              </svg>
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="bg-transparent text-gray-500/80 placeholder-gray-500/80 outline-none text-sm w-full h-full"
                required
              />
            </div>
          </div>

          <div className="w-full flex items-center justify-between text-gray-500/80">
            <div className="flex items-center gap-2">
              <input
                className="h-5 cursor-pointer"
                type="checkbox"
                id="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
              />
              <label className="text-sm cursor-pointer" htmlFor="checkbox">Remember me</label>
            </div>
            {/* FIX #5: Use <button> instead of <a>, fix cursor-pointer class */}
            <button
              type="button"
              className="text-sm underline cursor-pointer text-gray-500/80 hover:text-indigo-500 transition"
              onClick={handleForgotPassword}
            >
              Forgot password?
            </button>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full h-12 rounded-full text-white bg-indigo-500 hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Signing in..." : "Login"}
          </button>

          <p className="text-gray-500/90 text-sm mt-4">
            Don't have an account?{" "}
            <a className="text-indigo-400 hover:underline" href="/signup">Sign up</a>
          </p>
          <p className="text-gray-400 text-sm mt-6">
            By signing in, you agree to our Terms of Service and Privacy Policy.
          </p>
        </form>
        <div className="w-full border-t-2 border-gray-300" />
      </div>
    </div>
  );
}

export default Login;
