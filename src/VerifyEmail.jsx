import { useState, useEffect } from "react";
import { auth } from "./firebase";
import { sendEmailVerification, signOut, reload } from "firebase/auth";
import { useNavigate } from "react-router-dom";

function VerifyEmail() {
  const [sent, setSent] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const navigate = useNavigate();
  const user = auth.currentUser;

  // Countdown timer for resend cooldown
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((c) => c - 1), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  // Poll every 4 seconds to check if user has verified
  useEffect(() => {
    const interval = setInterval(async () => {
      if (!auth.currentUser) return;
      await reload(auth.currentUser);
      if (auth.currentUser.emailVerified) {
        clearInterval(interval);
        navigate("/home");
      }
    }, 4000);
    return () => clearInterval(interval);
  }, [navigate]);

  const handleResend = async () => {
    if (!user) return;
    try {
      setError("");
      await sendEmailVerification(user);
      setSent(true);
      setCooldown(60); // 60 second cooldown
    } catch (err) {
      if (err.code === "auth/too-many-requests") {
        setError("Too many requests. Please wait a moment before trying again.");
      } else {
        setError("Failed to send verification email. Please try again.");
      }
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    navigate("/");
  };

  const handleCheckNow = async () => {
    setChecking(true);
    try {
      await reload(auth.currentUser);
      if (auth.currentUser.emailVerified) {
        navigate("/home");
      } else {
        setError("Email not verified yet. Please check your inbox and click the link.");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-100 via-white to-purple-100 flex items-center justify-center px-4">
      <div className="bg-white rounded-3xl shadow-xl p-8 max-w-md w-full flex flex-col items-center gap-5 text-center">

        {/* Icon */}
        <div className="w-16 h-16 bg-indigo-50 rounded-full flex items-center justify-center">
          <svg className="w-8 h-8 text-indigo-500" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>

        <h2 style={{ fontFamily: "'Nunito', sans-serif" }} className="text-2xl font-bold text-indigo-500">
          Verify your email
        </h2>

        <p className="text-gray-500 text-sm leading-relaxed">
          We sent a verification link to{" "}
          <span className="font-semibold text-gray-700">{user?.email}</span>.
          <br />Click the link in your email to activate your account.
        </p>

        {error && <p className="text-red-500 text-sm">{error}</p>}

        {sent && !error && (
          <p className="text-green-500 text-sm">Verification email sent! Check your inbox (and spam).</p>
        )}

        {/* Check manually */}
        <button
          onClick={handleCheckNow}
          disabled={checking}
          className="w-full h-12 rounded-full bg-indigo-500 text-white text-sm font-medium hover:bg-indigo-600 transition disabled:opacity-50"
        >
          {checking ? "Checking..." : "I've verified my email"}
        </button>

        {/* Resend */}
        <button
          onClick={handleResend}
          disabled={cooldown > 0}
          className="w-full h-12 rounded-full border border-indigo-300 text-indigo-500 text-sm font-medium hover:bg-indigo-50 transition disabled:opacity-50"
        >
          {cooldown > 0 ? `Resend email (${cooldown}s)` : "Resend verification email"}
        </button>

        {/* Logout */}
        <button
          onClick={handleLogout}
          className="text-sm text-gray-400 hover:text-gray-600 underline"
        >
          Sign out and use a different account
        </button>

        <p className="text-xs text-gray-400">
          Can't find the email? Check your spam or junk folder.
        </p>
      </div>
    </div>
  );
}

export default VerifyEmail;
