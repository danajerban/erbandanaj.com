import { Suspense, lazy } from "react";
import { SceneErrorBoundary } from "./components/ErrorBoundary";
import { Menu } from "./components/Menu";

// Lazy: keeps the entry chunk free of three.js/r3f/drei/motion. The
// static #app-loader in index.html covers the load, so the fallback is null.
const SceneCanvas = lazy(() => import("./components/SceneCanvas"));

function App() {
  return (
    <>
      <Menu />
      <SceneErrorBoundary>
        <Suspense fallback={null}>
          <SceneCanvas />
        </Suspense>
      </SceneErrorBoundary>
    </>
  );
}

export default App;
