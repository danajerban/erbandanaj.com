import { Text3D } from "@react-three/drei";
import { useMobile } from "../contexts/MobileContext";

export const SectionTitle = ({ children, ...props }) => {
  const { isMobile } = useMobile();
  return (
    <Text3D font={"/fonts/Inter_Bold.json"} size={0.3} {...props}>
      {children}
      {/* MOBILE_PERF: the smoother title surface is desktop only — revert by removing the ternary */}
      <meshStandardMaterial color="#FAEAEA" roughness={isMobile ? 1 : 0.7} />
    </Text3D>
  );
};
