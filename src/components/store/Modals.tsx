import { lazy, Suspense } from "react";
import { useStore } from "@/context/StoreContext";

export function SuccessOverlay() {
  const { success, closeSuccess } = useStore();
  if (!success) return null;
  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-background p-6 text-center">
      <div className="success-checkmark mb-6">
        <div className="check-icon" />
      </div>
      <h2 className="mb-2 text-2xl font-black">{success.title}</h2>
      <p className="mb-8 text-sm text-muted-foreground">{success.desc}</p>
      <button
        onClick={closeSuccess}
        className="w-full max-w-xs rounded-xl bg-foreground py-3.5 text-sm font-bold text-background"
      >
        Continue
      </button>
    </div>
  );
}


const AuthModal = lazy(() => import("./modals/AuthModal").then((m) => ({ default: m.AuthModal })));
const ProfileModal = lazy(() => import("./modals/ProfileModal").then((m) => ({ default: m.ProfileModal })));
const WalletModal = lazy(() => import("./modals/WalletModal").then((m) => ({ default: m.WalletModal })));
const ProductModal = lazy(() => import("./modals/ProductModal").then((m) => ({ default: m.ProductModal })));
const NotificationsModal = lazy(() => import("./modals/MiscModals").then((m) => ({ default: m.NotificationsModal })));
const SuggestionModal = lazy(() => import("./modals/MiscModals").then((m) => ({ default: m.SuggestionModal })));

export function Modals() {
  const { modal } = useStore();
  return (
    <Suspense fallback={null}>
      {modal === "auth" ? <AuthModal /> : null}
      {modal === "profile" ? <ProfileModal /> : null}
      {modal === "wallet" ? <WalletModal /> : null}
      {modal === "product" ? <ProductModal /> : null}
      {modal === "notifications" ? <NotificationsModal /> : null}
      {modal === "suggestion" ? <SuggestionModal /> : null}
      <SuccessOverlay />
    </Suspense>
  );
}
