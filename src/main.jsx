import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import './index.css'

import MarketingLayout from './layouts/MarketingLayout'
import AppLayout from './layouts/AppLayout'
import ProtectedRoute from './components/ProtectedRoute'

import HomePage from './pages/marketing/HomePage'
import FeaturesPage from './pages/marketing/FeaturesPage'
import PricingPage from './pages/marketing/PricingPage'
import AboutPage from './pages/marketing/AboutPage'
import ContactPage from './pages/marketing/ContactPage'
import SignUpPage from './pages/marketing/SignUpPage'
import CheckoutSuccess from './pages/marketing/CheckoutSuccess'
import CheckoutCancel from './pages/marketing/CheckoutCancel'
import WelcomePage from './pages/marketing/WelcomePage'
import Login from './pages/Login'

// Clean up OAuth error params before React mounts (prevents router crash from invalid hash selectors)
if (window.location.search.includes('error=') || window.location.hash.includes('error=')) {
  window.history.replaceState({}, '', window.location.pathname)
}


createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Public marketing routes */}
          <Route element={<MarketingLayout />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/features" element={<FeaturesPage />} />
            <Route path="/pricing" element={<PricingPage />} />
            <Route path="/about" element={<AboutPage />} />
            <Route path="/contact" element={<ContactPage />} />
            <Route path="/signup" element={<SignUpPage />} />
            <Route path="/login" element={<Login />} />
            <Route path="/checkout/success" element={<CheckoutSuccess />} />
            <Route path="/checkout/cancel" element={<CheckoutCancel />} />
            <Route path="/welcome" element={<WelcomePage />} />
          </Route>

          {/* Protected app routes */}
          <Route
            path="/app/*"
            element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            }
          />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
