import { useThree } from "@react-three/fiber";
import { Suspense, useMemo } from "react";
import { getSectionsDistance } from "../constants/animation";
import { useMobile } from "../contexts/MobileContext";
import { buildOfficeChair } from "../lib/office/chair";
import { buildBackpack, buildDesk, DESK_LIGHTS } from "../lib/office/desk";
import {
  FRONT_Z,
  OFFICE_LAYER,
  TITLE_TURN,
  chairAt,
  monitorScreen,
  officeLayout,
  snakePlantAt,
  titleAt,
  transformLights,
  vignetteMatrix,
} from "../lib/office/layout";
import { buildSnakePlant } from "../lib/office/plants";
import { MonitorScreen } from "./MonitorScreen";
import { OfficeCorner } from "./OfficeCorner";
import { SectionGroup } from "./SectionGroup";
import { SectionTitle } from "./SectionTitle";

// The screen's mesh sits at the furniture's origin, so it dissolves with it
const SCREEN_ORIGIN = [0, 0, FRONT_Z];

// The chair and the backpack at true scale; the desk group and the snake
// plant through the (phone portrait) desk vignette
const buildDeskCorner = (out, ctx) => {
  buildOfficeChair(out, ctx, chairAt(ctx.layout));
  buildBackpack(out, ctx);
  const vignette = vignetteMatrix(ctx.layout);
  out.solid.push(vignette);
  out.glow.push(vignette);
  buildDesk(out, ctx);
  buildSnakePlant(out, ctx, snakePlantAt(ctx.layout));
  out.solid.pop();
  out.glow.pop();
};

// Projects: the office's desk corner, the owner's real desk (blue hour: the
// window goes blue, the desk lamp, light bar and screen keep the room warm)
export const ProjectsSection = () => {
  const { isMobile } = useMobile();
  const sectionsDistance = getSectionsDistance(isMobile);
  const aspect = useThree((state) => Math.round(state.viewport.aspect * 100) / 100);
  const layout = officeLayout(isMobile, aspect);
  const lights = useMemo(() => transformLights(DESK_LIGHTS, vignetteMatrix(layout)), [layout]);
  return (
    <SectionGroup
      name="projects"
      position-x={isMobile ? 2 * sectionsDistance : 0}
      position-z={isMobile ? -5 : 2 * sectionsDistance}
    >
      <OfficeCorner corner="projects" lights={lights} build={buildDeskCorner}>
        <SectionTitle layers={OFFICE_LAYER} position={titleAt("projects", layout)} rotation-y={TITLE_TURN}>
          PROJECTS
        </SectionTitle>
        {/* Own boundary: a screenshot texture that hasn't loaded yet
            (project switch) must not suspend the whole scene. */}
        <Suspense fallback={null}>
          <MonitorScreen screen={monitorScreen(layout)} origin={SCREEN_ORIGIN} />
        </Suspense>
      </OfficeCorner>
    </SectionGroup>
  );
};
