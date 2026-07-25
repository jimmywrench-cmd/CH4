"use client";

import { AuthProvider, useAuth } from "@/lib/client/AuthContext";
import { ToastProvider } from "@/components/Toast";
import AuthScreen from "@/components/AuthScreen";
import AppShell from "@/components/AppShell";

function Gate() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="center-screen">
        <span className="spinner" />
      </div>
    );
  }

  return user ? <AppShell /> : <AuthScreen />;
}

export default function Page() {
  return (
    <ToastProvider>
      <AuthProvider>
        <Gate />
      </AuthProvider>
    </ToastProvider>
  );
}
