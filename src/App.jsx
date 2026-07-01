import { Suspense, lazy } from "react";
import { SceneErrorBoundary } from "./components/ErrorBoundary";
import { Menu } from "./components/Menu";
import { MobileProvider } from "./contexts/MobileContext";

// Lazy: keeps the entry chunk free of three.js/r3f/drei/framer-motion. The
// static #app-loader in index.html covers the load, so the fallback is null.
const SceneCanvas = lazy(() => import("./components/SceneCanvas"));

function App() {
  return (
    <MobileProvider>
      <Menu />
      <SceneErrorBoundary>
        <Suspense fallback={null}>
          <SceneCanvas />
        </Suspense>
      </SceneErrorBoundary>
    </MobileProvider>
  );
}

export default App;
