import { BrowserRouter, Routes, Route } from "react-router-dom";
import Signup from "./Signup";
import Login from "./Login";
import Home from "./Home";
import StudyMaterial from "./StudyMaterial";
import AI from "./AI";
import Chat from "./chat";
import Marketplace from "./Marketplace";
import MarketplaceDetail from "./MarketplaceDetail";
import CreateListing from "./CreateListing";
import MyListings from "./MyListings";
import SellerProfile from "./SellerProfile";
import MarketplaceOnboarding from "./MarketplaceOnboarding";
import ProtectedRoute from "./ProtectedRoute";
import Search from "./Search";
import VerifyEmail from "./VerifyEmail";
import Admin from "./Admin";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/verify-email" element={<VerifyEmail />} />
        <Route path="/home" element={<ProtectedRoute><Home /></ProtectedRoute>} />
        <Route path="/study-material" element={<ProtectedRoute><StudyMaterial /></ProtectedRoute>} />
        <Route path="/ai" element={<ProtectedRoute><AI /></ProtectedRoute>} />
        <Route path="/chat" element={<ProtectedRoute><Chat /></ProtectedRoute>} />
        <Route path="/marketplace" element={<ProtectedRoute><Marketplace /></ProtectedRoute>} />
        <Route path="/marketplace/create" element={<ProtectedRoute><CreateListing /></ProtectedRoute>} />
        <Route path="/marketplace/my-listings" element={<ProtectedRoute><MyListings /></ProtectedRoute>} />
        <Route path="/marketplace/onboarding" element={<ProtectedRoute><MarketplaceOnboarding /></ProtectedRoute>} />
        <Route path="/marketplace/seller/:userId" element={<ProtectedRoute><SellerProfile /></ProtectedRoute>} />
        <Route path="/marketplace/:id" element={<ProtectedRoute><MarketplaceDetail /></ProtectedRoute>} />
        <Route path="/search" element={<ProtectedRoute><Search /></ProtectedRoute>} />
        <Route path="/admin" element={<ProtectedRoute><Admin /></ProtectedRoute>} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;