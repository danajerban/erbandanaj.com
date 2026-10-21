import { useThree } from "@react-three/fiber";
import { getSectionsDistance } from "../constants/animation";
import { useMobile } from "../contexts/MobileContext";
import { OFFICE_LAYER, TITLE_TURN, officeLayout, titleAt } from "../lib/office/layout";
import { buildReadingCorner, READING_LIGHTS } from "../lib/office/readingCorner";
import { OfficeCorner } from "./OfficeCorner";
import { SectionGroup } from "./SectionGroup";
import { SectionTitle } from "./SectionTitle";

// Skills: the office's window corner, the reading corner (afterglow: the
// window shows the live sky, the reading lamp half on)
export const SkillsSection = () => {
  const { isMobile } = useMobile();
  const sectionsDistance = getSectionsDistance(isMobile);
  const aspect = useThree((state) => Math.round(state.viewport.aspect * 100) / 100);
  const layout = officeLayout(isMobile, aspect);
  return (
    <SectionGroup
      name="skills"
      position-x={isMobile ? sectionsDistance : 0}
      position-z={isMobile ? -5 : sectionsDistance}
    >
      <OfficeCorner corner="skills" lights={READING_LIGHTS} build={buildReadingCorner}>
        <SectionTitle layers={OFFICE_LAYER} position={titleAt("skills", layout, aspect)} rotation-y={TITLE_TURN}>
          SKILLS
        </SectionTitle>
      </OfficeCorner>
    </SectionGroup>
  );
};
