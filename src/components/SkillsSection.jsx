import { getSectionsDistance } from "../constants/animation";
import { useMobile } from "../contexts/MobileContext";
import { OFFICE_LAYER, TITLE } from "../lib/office/layout";
import { buildReadingCorner, READING_LIGHTS } from "../lib/office/readingCorner";
import { OfficeCorner } from "./OfficeCorner";
import { SectionGroup } from "./SectionGroup";
import { SectionTitle } from "./SectionTitle";

// Skills: the office's window corner, the reading corner (afterglow: the
// window shows the live sky, the reading lamp half on)
export const SkillsSection = () => {
  const { isMobile } = useMobile();
  const sectionsDistance = getSectionsDistance(isMobile);
  return (
    <SectionGroup
      name="skills"
      position-x={isMobile ? sectionsDistance : 0}
      position-z={isMobile ? -5 : sectionsDistance}
    >
      <OfficeCorner corner="skills" lights={READING_LIGHTS} build={buildReadingCorner}>
        <SectionTitle
          layers={OFFICE_LAYER}
          size={TITLE.size}
          height={TITLE.height}
          position={[TITLE.left.skills.default, TITLE.baseline, TITLE.z]}
        >
          SKILLS
        </SectionTitle>
      </OfficeCorner>
    </SectionGroup>
  );
};
