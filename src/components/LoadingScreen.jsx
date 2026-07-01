import { useProgress } from "@react-three/drei";
import { config } from "../config";

export const LoadingScreen = () => {
  const { progress, active } = useProgress();

  return (
    <div
      className={`loading-screen ${active ? "" : "loading-screen--hidden"}`}
      aria-hidden={!active}
    >
      <div className="loading-screen__container">
        <h1 className="loading-screen__title">{config.title}</h1>
        <div
          className="progress__container"
          role="progressbar"
          aria-valuenow={Math.round(progress)}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="progress__bar"
            style={{ width: `${progress}%` }}
          ></div>
        </div>
        <p className="loading-screen__percent">{Math.round(progress)}%</p>
      </div>
    </div>
  );
};
